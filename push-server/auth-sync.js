const express = require("express");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || "").trim();
const SESSION_DAYS = 30;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function bearerToken(req) {
  const value = String(req.headers.authorization || "");
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function cleanProfile(payload = {}) {
  return {
    email: String(payload.email || "").slice(0, 320),
    name: String(payload.name || payload.given_name || "").slice(0, 120),
    picture: String(payload.picture || "").slice(0, 1000),
  };
}

function createAuthSyncRouter(pool) {
  const router = express.Router();

  async function requireSession(req, res, next) {
    try {
      const token = bearerToken(req);
      if (!token) return res.status(401).json({ error: "Sign in required" });
      const tokenHash = hashToken(token);
      const { rows } = await pool.query(
        `SELECT s.user_id, s.expires_at, u.email, u.name, u.picture
           FROM app_sessions s
           JOIN app_users u ON u.user_id=s.user_id
          WHERE s.token_hash=$1
            AND s.expires_at>NOW()`,
        [tokenHash]
      );
      if (!rows.length) return res.status(401).json({ error: "Session expired" });
      req.emirutoUser = {
        id: rows[0].user_id,
        email: rows[0].email || "",
        name: rows[0].name || "",
        picture: rows[0].picture || "",
      };
      req.emirutoSessionHash = tokenHash;
      next();
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Authentication failed" });
    }
  }

  router.get("/config", (_req, res) => {
    res.json({
      googleAuthReady: Boolean(GOOGLE_CLIENT_ID),
      googleClientId: GOOGLE_CLIENT_ID || null,
      syncVersion: 1,
    });
  });

  router.post("/auth/google", async (req, res) => {
    try {
      if (!googleClient || !GOOGLE_CLIENT_ID) {
        return res.status(503).json({ error: "Google login is not configured yet" });
      }
      const credential = String(req.body?.credential || "");
      if (!credential) return res.status(400).json({ error: "Missing Google credential" });

      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload() || {};
      if (!payload.sub || payload.email_verified === false) {
        return res.status(401).json({ error: "Google account could not be verified" });
      }

      const profile = cleanProfile(payload);
      const userId = crypto.randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO app_users(user_id, google_sub, email, name, picture, last_login_at)
         VALUES($1,$2,$3,$4,$5,NOW())
         ON CONFLICT(google_sub) DO UPDATE SET
           email=EXCLUDED.email,
           name=EXCLUDED.name,
           picture=EXCLUDED.picture,
           last_login_at=NOW()
         RETURNING user_id, email, name, picture`,
        [userId, String(payload.sub), profile.email, profile.name, profile.picture]
      );

      const user = rows[0];
      const sessionToken = crypto.randomBytes(32).toString("base64url");
      const sessionHash = hashToken(sessionToken);
      const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);

      await pool.query(
        `INSERT INTO app_sessions(token_hash, user_id, expires_at)
         VALUES($1,$2,$3)`,
        [sessionHash, user.user_id, expiresAt]
      );
      await pool.query("DELETE FROM app_sessions WHERE expires_at<=NOW()");

      res.json({
        ok: true,
        sessionToken,
        expiresAt: expiresAt.toISOString(),
        user: {
          id: user.user_id,
          email: user.email || "",
          name: user.name || "",
          picture: user.picture || "",
        },
      });
    } catch (error) {
      console.error(error);
      res.status(401).json({ error: "Google login failed" });
    }
  });

  router.post("/auth/logout", requireSession, async (req, res) => {
    try {
      await pool.query("DELETE FROM app_sessions WHERE token_hash=$1", [req.emirutoSessionHash]);
      res.json({ ok: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  router.get("/me", requireSession, async (req, res) => {
    res.json({ ok: true, user: req.emirutoUser });
  });

  router.get("/sync", requireSession, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT payload, client_modified_at, server_updated_at, device_id
           FROM user_sync
          WHERE user_id=$1`,
        [req.emirutoUser.id]
      );
      if (!rows.length) return res.json({ ok: true, hasData: false });
      const row = rows[0];
      res.json({
        ok: true,
        hasData: true,
        data: row.payload,
        modifiedAt: row.client_modified_at?.toISOString?.() || row.client_modified_at,
        serverUpdatedAt: row.server_updated_at?.toISOString?.() || row.server_updated_at,
        deviceId: row.device_id || "",
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Sync download failed" });
    }
  });

  router.put("/sync", requireSession, async (req, res) => {
    const client = await pool.connect();
    try {
      const data = req.body?.data;
      const modifiedAtRaw = String(req.body?.modifiedAt || "");
      const deviceId = String(req.body?.deviceId || "").slice(0, 160);
      const modifiedMs = Date.parse(modifiedAtRaw);
      if (!data || typeof data !== "object" || Array.isArray(data) || !Number.isFinite(modifiedMs)) {
        return res.status(400).json({ error: "Invalid sync payload" });
      }

      const encoded = JSON.stringify(data);
      if (Buffer.byteLength(encoded, "utf8") > 900_000) {
        return res.status(413).json({ error: "Sync payload is too large" });
      }

      const modifiedAt = new Date(modifiedMs);
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT payload, client_modified_at, server_updated_at, device_id
           FROM user_sync
          WHERE user_id=$1
          FOR UPDATE`,
        [req.emirutoUser.id]
      );

      let winner = "client";
      let latestData = data;
      let latestModifiedAt = modifiedAt;
      let serverUpdatedAt = new Date();

      if (!existing.rows.length) {
        const inserted = await client.query(
          `INSERT INTO user_sync(user_id, payload, client_modified_at, device_id, server_updated_at)
           VALUES($1,$2::jsonb,$3,$4,NOW())
           RETURNING server_updated_at`,
          [req.emirutoUser.id, encoded, modifiedAt, deviceId]
        );
        serverUpdatedAt = inserted.rows[0].server_updated_at;
      } else {
        const row = existing.rows[0];
        const serverModifiedMs = new Date(row.client_modified_at).getTime();
        if (modifiedMs > serverModifiedMs) {
          const updated = await client.query(
            `UPDATE user_sync
                SET payload=$2::jsonb,
                    client_modified_at=$3,
                    device_id=$4,
                    server_updated_at=NOW()
              WHERE user_id=$1
              RETURNING server_updated_at`,
            [req.emirutoUser.id, encoded, modifiedAt, deviceId]
          );
          serverUpdatedAt = updated.rows[0].server_updated_at;
        } else {
          winner = modifiedMs === serverModifiedMs ? "same" : "server";
          latestData = row.payload;
          latestModifiedAt = row.client_modified_at;
          serverUpdatedAt = row.server_updated_at;
        }
      }

      await client.query("COMMIT");
      res.json({
        ok: true,
        winner,
        data: latestData,
        modifiedAt: latestModifiedAt?.toISOString?.() || latestModifiedAt,
        serverUpdatedAt: serverUpdatedAt?.toISOString?.() || serverUpdatedAt,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(error);
      res.status(500).json({ error: "Sync upload failed" });
    } finally {
      client.release();
    }
  });

  return router;
}

module.exports = { createAuthSyncRouter };
