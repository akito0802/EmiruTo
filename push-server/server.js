const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { pool, initDb } = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 10000);
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const allowedOrigin = process.env.ALLOWED_ORIGIN || "https://akito0802.github.io";

app.set("trust proxy", 1);
app.use(express.json({ limit: "256kb" }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === allowedOrigin) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

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

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.get("/api/vapid-public-key", (_req, res) => {
  if (!VAPID_PUBLIC_KEY) return res.status(503).json({ error: "VAPID key not configured" });
  res.json({ publicKey: VAPID_PUBLIC_KEY });
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
      if (!n?.id || !Number.isFinite(fireMs) || fireMs < now - 60000 || fireMs > maxFuture) return [];
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
  .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`EmiruTo push API listening on ${PORT}`)))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
