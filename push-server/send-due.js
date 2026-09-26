const webpush = require("web-push");
const { pool, initDb } = require("./db");

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:emiruto@example.com";

if (!publicKey || !privateKey) {
  throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required");
}
webpush.setVapidDetails(subject, publicKey, privateKey);

async function main() {
  await initDb();

  // Do not burst very old missed notifications after downtime.
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
    } catch (error) {
      const status = Number(error?.statusCode || 0);
      if (status === 404 || status === 410) {
        await pool.query("DELETE FROM push_clients WHERE client_id=$1", [row.client_id]);
      } else {
        console.error("Push failed", row.client_id, row.notification_id, status || error?.message);
      }
    }
  }

  await pool.end();
}

main().catch(async error => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
