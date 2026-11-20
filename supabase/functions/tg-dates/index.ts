import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

// Telegram-мини-приложение «Занятые даты» (tg.html). Только для админов.
// Кто открыл — проверяем по подписи Telegram (initData) и по привязанному чату действующего админа.
// verify_jwt = false (вход по подписи Telegram, без пароля)
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const enc = new TextEncoder();
const hmac = async (key: Uint8Array, msg: string) => {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
};
const hex = (b: Uint8Array) => Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function checkInitData(initData: string, token: string): Promise<{ id: number } | null> {
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if (!hash) return null;
  p.delete("hash");
  const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = await hmac(enc.encode("WebAppData"), token);
  if (!same(hex(await hmac(secret, dcs)), hash)) return null;
  const age = Date.now() / 1000 - Number(p.get("auth_date") ?? 0);
  if (!(age >= -300 && age < 2 * 24 * 3600)) return null;
  try { const u = JSON.parse(p.get("user") ?? "null"); return u && Number.isInteger(u.id) ? { id: u.id } : null; } catch { return null; }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dayOk = (s: string) => {
  if (!ISO.test(s)) return false;
  const t = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s && Math.abs(t - Date.now()) < 900 * 86400_000;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return json({ error: "not_configured" }, 500);
  const body = await req.json().catch(() => ({}));
  const tgUser = await checkInitData(String(body.initData ?? ""), token);
  if (!tgUser) return json({ error: "bad_signature" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // личный чат с ботом: chat_id = id пользователя Telegram
  const { data: chat } = await db.from("tg_chats").select("user_id").eq("chat_id", tgUser.id).maybeSingle();
  let isAdmin = false;
  if (chat?.user_id) {
    const { data: adm } = await db.from("admins").select("user_id").eq("user_id", chat.user_id).maybeSingle();
    isAdmin = !!adm;
  }
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const list = async () => {
    const from = new Date(Date.now() - 62 * 86400_000).toISOString().slice(0, 10);
    const { data, error } = await db.from("booked_dates").select("day, object").gte("day", from).order("day").limit(3000);
    if (error) throw error;
    return data ?? [];
  };

  try {
    const action = String(body.action ?? "list");
    if (action === "add" || action === "remove") {
      const days: string[] = Array.isArray(body.days) ? body.days.map(String) : [];
      const objs: string[] = Array.isArray(body.objects) ? body.objects.map(String) : [];
      if (!days.length || days.length > 400 || !days.every(dayOk)) return json({ error: "bad_days" }, 400);
      if (!objs.length || !objs.every((o) => o === "cottage" || o === "hall")) return json({ error: "bad_object" }, 400);
      if (action === "add") {
        const rows = days.flatMap((day) => objs.map((object) => ({ day, object, created_by: chat!.user_id })));
        const { error } = await db.from("booked_dates").upsert(rows, { onConflict: "day,object", ignoreDuplicates: true });
        if (error) throw error;
      } else {
        const { error } = await db.from("booked_dates").delete().in("day", days).in("object", objs);
        if (error) throw error;
      }
    }
    return json({ rows: await list() });
  } catch (e) {
    console.error("tg-dates", e);
    return json({ error: "failed" }, 500);
  }
});
