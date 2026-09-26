const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const webpush = require("web-push");
const { pool, initDb } = require("./db");
const { createAuthSyncRouter } = require("./auth-sync");

const app = express();
const PORT = Number(process.env.PORT || 10000);
const allowedOrigin = process.env.ALLOWED_ORIGIN || "https://akito0802.github.io";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "https://akito0802.github.io/EmiruTo/";

let vapidKeys = null;

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === allowedOrigin) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
app.use("/api", createAuthSyncRouter(pool));

function hashSecret(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest("hex");
}
function validClientId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{12,128}$/.test(value);
}
function validSecret(value) {
  return typeof value === "string" && value.length >= 24 && value.length <= 256;
}
async function authenticate(clientId, secret) {
  if (!validClientId(clientId) || !validSecret(secret)) return false;
  const { rows } = await pool.query("SELECT secret_hash FROM push_clients WHERE client_id=$1", [clientId]);
  if (!rows.length) return false;
  const a = Buffer.from(rows[0].secret_hash, "utf8");
  const b = Buffer.from(hashSecret(secret), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function ensureVapidKeys() {
  if (vapidKeys?.publicKey && vapidKeys?.privateKey) return vapidKeys;

  const envPublic = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const envPrivate = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  if (envPublic && envPrivate) {
    vapidKeys = { publicKey: envPublic, privateKey: envPrivate };
  } else {
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key='vapid_keys'");
    const saved = rows[0]?.value;
    if (saved?.publicKey && saved?.privateKey) {
      vapidKeys = saved;
    } else {
      vapidKeys = webpush.generateVAPIDKeys();
      await pool.query(
        `INSERT INTO app_settings(key, value, updated_at)
         VALUES('vapid_keys', $1::jsonb, NOW())
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
        [JSON.stringify(vapidKeys)]
      );
    }
  }

  webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
  return vapidKeys;
}

async function sendDueNotifications() {
  await ensureVapidKeys();

  await pool.query(`
    UPDATE scheduled_notifications
       SET sent_at=NOW()
     WHERE sent_at IS NULL
       AND fire_at < NOW() - INTERVAL '20 minutes'
  `);

  const { rows } = await pool.query(`
    SELECT n.client_id, n.notification_id, n.title, n.body, n.tag, n.target_url, c.subscription
      FROM scheduled_notifications n
      JOIN push_clients c ON c.client_id=n.client_id
     WHERE n.sent_at IS NULL
       AND n.fire_at <= NOW()
       AND n.fire_at >= NOW() - INTERVAL '20 minutes'
     ORDER BY n.fire_at ASC
     LIMIT 200
  `);

  let sent = 0;
  let removedSubscriptions = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const payload = JSON.stringify({
        title: row.title,
        body: row.body,
        tag: row.tag || row.notification_id,
        url: row.target_url || "https://akito0802.github.io/EmiruTo/",
      });

      await webpush.sendNotification(row.subscription, payload, { TTL: 1800, urgency: "normal" });
      await pool.query(
        "UPDATE scheduled_notifications SET sent_at=NOW() WHERE client_id=$1 AND notification_id=$2",
        [row.client_id, row.notification_id]
      );
      sent += 1;
    } catch (error) {
      const status = Number(error?.statusCode || 0);
      if (status === 404 || status === 410) {
        await pool.query("DELETE FROM push_clients WHERE client_id=$1", [row.client_id]);
        removedSubscriptions += 1;
      } else {
        failed += 1;
        console.error("Push failed", row.client_id, row.notification_id, status || error?.message);
      }
    }
  }

  return { checked: rows.length, sent, removedSubscriptions, failed };
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    const keys = await ensureVapidKeys();
    res.json({ ok: true, pushReady: Boolean(keys?.publicKey) });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.get("/api/vapid-public-key", async (_req, res) => {
  try {
    const keys = await ensureVapidKeys();
    res.json({ publicKey: keys.publicKey });
  } catch (error) {
    console.error(error);
    res.status(503).json({ error: "VAPID key unavailable" });
  }
});

app.post("/api/send-due", async (_req, res) => {
  try {
    const result = await sendDueNotifications();
    console.log("Push sender result", result);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Push delivery failed" });
  }
});

app.post("/api/push-status", async (req, res) => {
  try {
    const { clientId, secret } = req.body || {};
    if (!(await authenticate(clientId, secret))) return res.status(401).json({ error: "Unauthorized" });
    const clientResult = await pool.query(
      "SELECT updated_at FROM push_clients WHERE client_id=$1",
      [clientId]
    );
    const scheduleResult = await pool.query(
      `SELECT COUNT(*)::int AS pending,
              MIN(fire_at) FILTER (WHERE sent_at IS NULL) AS next_fire_at,
              MAX(sent_at) AS last_sent_at
         FROM scheduled_notifications
        WHERE client_id=$1 AND sent_at IS NULL`,
      [clientId]
    );
    res.json({
      ok: true,
      subscriptionUpdatedAt: clientResult.rows[0]?.updated_at || null,
      pending: Number(scheduleResult.rows[0]?.pending || 0),
      nextFireAt: scheduleResult.rows[0]?.next_fire_at || null,
      lastSentAt: scheduleResult.rows[0]?.last_sent_at || null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Push status failed" });
  }
});

app.post("/api/test-push", async (req, res) => {
  try {
    const { clientId, secret } = req.body || {};
    if (!(await authenticate(clientId, secret))) return res.status(401).json({ error: "Unauthorized" });
    const { rows } = await pool.query(
      "SELECT subscription FROM push_clients WHERE client_id=$1",
      [clientId]
    );
    if (!rows.length) return res.status(404).json({ error: "Subscription not found" });

    await ensureVapidKeys();
    const payload = JSON.stringify({
      title: "EmiruTo テスト通知🧡",
      body: "バックグラウンドPushはちゃんと届いてるよ。",
      tag: "emiruto-background-test-" + Date.now(),
      url: "https://akito0802.github.io/EmiruTo/"
    });

    try {
      await webpush.sendNotification(rows[0].subscription, payload, { TTL: 300, urgency: "high" });
      res.json({ ok: true });
    } catch (error) {
      const status = Number(error?.statusCode || 0);
      if (status === 404 || status === 410) {
        await pool.query("DELETE FROM push_clients WHERE client_id=$1", [clientId]);
        return res.status(410).json({ error: "Subscription expired" });
      }
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Test push failed" });
  }
});

app.post("/api/subscribe", async (req, res) => {
  try {
    const { clientId, secret, subscription } = req.body || {};
    if (!validClientId(clientId) || !validSecret(secret) || !subscription?.endpoint || !subscription?.keys) {
      return res.status(400).json({ error: "Invalid subscription" });
    }
    await pool.query(
      `INSERT INTO push_clients(client_id, secret_hash, subscription, updated_at)
       VALUES($1,$2,$3::jsonb,NOW())
       ON CONFLICT(client_id) DO UPDATE SET
         secret_hash=EXCLUDED.secret_hash,
         subscription=EXCLUDED.subscription,
         updated_at=NOW()`,
      [clientId, hashSecret(secret), JSON.stringify(subscription)]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Subscribe failed" });
  }
});

app.post("/api/schedule", async (req, res) => {
  const client = await pool.connect();
  try {
    const { clientId, secret, notifications } = req.body || {};
    if (!(await authenticate(clientId, secret))) return res.status(401).json({ error: "Unauthorized" });
    if (!Array.isArray(notifications) || notifications.length > 300) {
      return res.status(400).json({ error: "Invalid notifications" });
    }

    const now = Date.now();
    const maxFuture = now + 45 * 86400000;
    const clean = notifications.flatMap(n => {
      const fireMs = Date.parse(n?.fireAt || "");
      if (!n?.id || !Number.isFinite(fireMs) || fireMs < now - 20 * 60000 || fireMs > maxFuture) return [];
      const title = String(n.title || "EmiruTo").slice(0, 100);
      const body = String(n.body || "").slice(0, 240);
      const tag = String(n.tag || n.id).slice(0, 120);
      const targetUrl = String(n.url || "https://akito0802.github.io/EmiruTo/").slice(0, 300);
      return [{ id: String(n.id).slice(0, 160), fireAt: new Date(fireMs), title, body, tag, targetUrl }];
    });

    await client.query("BEGIN");
    await client.query("DELETE FROM scheduled_notifications WHERE client_id=$1 AND sent_at IS NULL", [clientId]);
    for (const n of clean) {
      await client.query(
        `INSERT INTO scheduled_notifications
           (client_id, notification_id, fire_at, title, body, tag, target_url)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(client_id, notification_id) DO UPDATE SET
           fire_at=EXCLUDED.fire_at,
           title=EXCLUDED.title,
           body=EXCLUDED.body,
           tag=EXCLUDED.tag,
           target_url=EXCLUDED.target_url,
           sent_at=NULL`,
        [clientId, n.id, n.fireAt, n.title, n.body, n.tag, n.targetUrl]
      );
    }
    await client.query("COMMIT");
    console.log("Push schedule synced", { scheduled: clean.length, earliest: clean[0]?.fireAt || null });
    res.json({ ok: true, scheduled: clean.length });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error);
    res.status(500).json({ error: "Schedule failed" });
  } finally {
    client.release();
  }
});

app.post("/api/unsubscribe", async (req, res) => {
  try {
    const { clientId, secret } = req.body || {};
    if (!(await authenticate(clientId, secret))) return res.status(401).json({ error: "Unauthorized" });
    await pool.query("DELETE FROM push_clients WHERE client_id=$1", [clientId]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unsubscribe failed" });
  }
});

initDb()
  .then(ensureVapidKeys)
  .then(() => app.listen(PORT, "0.0.0.0", () => {
    console.log(`EmiruTo push API listening on ${PORT}`);

    // While the free Render service is awake, check due notifications every minute.
    // GitHub Actions pings /api/send-due every 5 minutes to keep the service active.
    const runSender = () => sendDueNotifications().catch(error => console.error("Scheduled push sender failed", error));
    runSender();
    const senderTimer = setInterval(runSender, 60_000);
    senderTimer.unref?.();
  }))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
