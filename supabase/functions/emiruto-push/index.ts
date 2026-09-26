import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://akito0802.github.io";
const VAPID_SUBJECT = "https://akito0802.github.io/EmiruTo/";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}
function pathFor(req: Request) {
  const p = new URL(req.url).pathname;
  const i = p.indexOf("/emiruto-push");
  return i >= 0 ? p.slice(i + "/emiruto-push".length) || "/" : p;
}
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function validClientId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{12,128}$/.test(v);
}
function validSecret(v: unknown): v is string {
  return typeof v === "string" && v.length >= 24 && v.length <= 256;
}
async function getSetting(key: string) {
  const { data, error } = await admin.from("push_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}
async function setSetting(key: string, value: string) {
  const { error } = await admin.from("push_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}
async function ensureVapidKeys() {
  let publicKey = await getSetting("vapid_public_key");
  let privateKey = await getSetting("vapid_private_key");
  if (!publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    await setSetting("vapid_public_key", publicKey);
    await setSetting("vapid_private_key", privateKey);
  }
  return { publicKey, privateKey };
}
async function authenticate(clientId: unknown, secret: unknown) {
  if (!validClientId(clientId) || !validSecret(secret)) return false;
  const { data, error } = await admin.from("push_clients").select("secret_hash").eq("client_id", clientId).maybeSingle();
  if (error || !data?.secret_hash) return false;
  return constantTimeEqual(data.secret_hash, await sha256(secret));
}
async function parseBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}
async function sendDue(req: Request) {
  const supplied = req.headers.get("x-cron-secret") || "";
  const expected = await getSetting("cron_secret");
  if (!expected || !constantTimeEqual(supplied, expected)) return json(req, { error: "Unauthorized" }, 401);

  const now = new Date();
  const expiredBefore = new Date(now.getTime() - 20 * 60_000).toISOString();
  await admin
    .from("scheduled_notifications")
    .update({ sent_at: now.toISOString() })
    .is("sent_at", null)
    .lt("fire_at", expiredBefore);

  const { data: due, error } = await admin
    .from("scheduled_notifications")
    .select("client_id,notification_id,title,body,tag,target_url,fire_at,push_clients(subscription)")
    .is("sent_at", null)
    .lte("fire_at", now.toISOString())
    .gte("fire_at", expiredBefore)
    .order("fire_at", { ascending: true })
    .limit(200);
  if (error) throw error;

  const vapid = await ensureVapidKeys();
  webpush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey);

  let sent = 0, stale = 0, failed = 0;
  for (const row of due ?? []) {
    const subscription = (row as any).push_clients?.subscription;
    if (!subscription?.endpoint) {
      await admin.from("scheduled_notifications").update({ sent_at: now.toISOString() })
        .eq("client_id", row.client_id).eq("notification_id", row.notification_id);
      continue;
    }
    const payload = JSON.stringify({
      title: row.title,
      body: row.body,
      tag: row.tag || row.notification_id,
      url: row.target_url || "https://akito0802.github.io/EmiruTo/",
    });
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 1800, urgency: "normal" });
      sent++;
      await admin.from("scheduled_notifications").update({ sent_at: new Date().toISOString() })
        .eq("client_id", row.client_id).eq("notification_id", row.notification_id);
    } catch (e) {
      const status = Number((e as any)?.statusCode || 0);
      if (status === 404 || status === 410) {
        stale++;
        await admin.from("push_clients").delete().eq("client_id", row.client_id);
      } else {
        failed++;
        console.error("push failed", row.client_id, row.notification_id, status || String(e));
      }
    }
  }
  return json(req, { ok: true, due: due?.length || 0, sent, stale, failed });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  const path = pathFor(req);
  const origin = req.headers.get("origin");
  const isInternal = path === "/internal/send-due";
  if (!isInternal && origin && origin !== ALLOWED_ORIGIN) return json(req, { error: "Origin not allowed" }, 403);

  try {
    if (req.method === "GET" && path === "/api/health") return json(req, { ok: true });
    if (req.method === "GET" && path === "/api/vapid-public-key") {
      const { publicKey } = await ensureVapidKeys();
      return json(req, { publicKey });
    }
    if (req.method === "POST" && path === "/api/subscribe") {
      const body = await parseBody(req);
      const { clientId, secret, subscription } = body;
      if (!validClientId(clientId) || !validSecret(secret) || !subscription?.endpoint || !subscription?.keys) {
        return json(req, { error: "Invalid subscription" }, 400);
      }
      const { error } = await admin.from("push_clients").upsert({
        client_id: clientId,
        secret_hash: await sha256(secret),
        subscription,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return json(req, { ok: true });
    }
    if (req.method === "POST" && path === "/api/schedule") {
      const body = await parseBody(req);
      const { clientId, secret, notifications } = body;
      if (!(await authenticate(clientId, secret))) return json(req, { error: "Unauthorized" }, 401);
      if (!Array.isArray(notifications) || notifications.length > 300) return json(req, { error: "Invalid notifications" }, 400);

      const now = Date.now(), maxFuture = now + 45 * 86400_000;
      const clean = notifications.flatMap((n: any) => {
        const fireMs = Date.parse(n?.fireAt || "");
        if (!n?.id || !Number.isFinite(fireMs) || fireMs < now - 60_000 || fireMs > maxFuture) return [];
        return [{
          client_id: clientId,
          notification_id: String(n.id).slice(0, 160),
          fire_at: new Date(fireMs).toISOString(),
          title: String(n.title || "EmiruTo").slice(0, 100),
          body: String(n.body || "").slice(0, 240),
          tag: String(n.tag || n.id).slice(0, 120),
          target_url: String(n.url || "https://akito0802.github.io/EmiruTo/").slice(0, 300),
          sent_at: null,
        }];
      });

      const { error: delError } = await admin.from("scheduled_notifications").delete().eq("client_id", clientId).is("sent_at", null);
      if (delError) throw delError;
      if (clean.length) {
        const { error: insertError } = await admin.from("scheduled_notifications").upsert(clean);
        if (insertError) throw insertError;
      }
      return json(req, { ok: true, scheduled: clean.length });
    }
    if (req.method === "POST" && path === "/api/unsubscribe") {
      const body = await parseBody(req);
      const { clientId, secret } = body;
      if (!(await authenticate(clientId, secret))) return json(req, { error: "Unauthorized" }, 401);
      const { error } = await admin.from("push_clients").delete().eq("client_id", clientId);
      if (error) throw error;
      return json(req, { ok: true });
    }
    if (req.method === "POST" && path === "/internal/send-due") return await sendDue(req);
    return json(req, { error: "Not found" }, 404);
  } catch (error) {
    console.error(error);
    return json(req, { error: "Internal server error" }, 500);
  }
});
