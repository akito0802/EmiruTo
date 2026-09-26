const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS push_clients (
      client_id TEXT PRIMARY KEY,
      secret_hash TEXT NOT NULL,
      subscription JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scheduled_notifications (
      client_id TEXT NOT NULL REFERENCES push_clients(client_id) ON DELETE CASCADE,
      notification_id TEXT NOT NULL,
      fire_at TIMESTAMPTZ NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      tag TEXT,
      target_url TEXT,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (client_id, notification_id)
    );

    CREATE INDEX IF NOT EXISTS scheduled_notifications_due_idx
      ON scheduled_notifications (fire_at)
      WHERE sent_at IS NULL;
  `);
}

module.exports = { pool, initDb };
