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

    CREATE TABLE IF NOT EXISTS app_users (
      user_id UUID PRIMARY KEY,
      google_sub TEXT UNIQUE NOT NULL,
      email TEXT,
      name TEXT,
      picture TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx
      ON app_sessions (expires_at);

    CREATE TABLE IF NOT EXISTS user_sync (
      user_id UUID PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
      payload JSONB NOT NULL,
      client_modified_at TIMESTAMPTZ NOT NULL,
      device_id TEXT,
      server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
