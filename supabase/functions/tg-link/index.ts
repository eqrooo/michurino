import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

// Админка → «Подключить Telegram» / статус / тест / отключить чат. Только для админов.
// verify_jwt = true
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
async function secretFor(token: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("michurino:" + token));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await db.auth.getUser(jwt);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: adm } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!adm) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = body.action ?? "status";
  const listChats = async () => (await db.from("tg_chats").select("chat_id, name, created_at").order("created_at")).data ?? [];
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return json({ configured: false, chats: await listChats() });
  const tg = (method: string, payload: unknown = {}) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }).then((r) => r.json()).catch((e) => ({ ok: false, description: String(e) }));

  const me = await tg("getMe");
  if (!me?.ok) return json({ configured: false, error: "bad_token", chats: await listChats() });
  const bot = me.result.username;
  const hookUrl = `${url}/functions/v1/tg-webhook`;
  const setHook = async () => tg("setWebhook", { url: hookUrl, secret_token: await secretFor(token), allowed_updates: ["message", "callback_query"] });

  // держим вебхук в актуальном состоянии (сообщения + нажатия кнопок)
  const info = await tg("getWebhookInfo");
  const allowed: string[] = info?.result?.allowed_updates ?? [];
  if (info?.ok && (info.result.url !== hookUrl || !allowed.includes("callback_query"))) {
    const h = await setHook(); if (!h.ok) console.error("setWebhook", h.description);
  }

  if (action === "unlink" && body.chat_id) {
    await db.from("tg_chats").delete().eq("chat_id", body.chat_id);
    return json({ configured: true, bot, chats: await listChats() });
  }
  if (action === "test") {
    const chats = await listChats();
    const rs = await Promise.all(chats.map((c) => Promise.all([
      tg("setChatMenuButton", { chat_id: c.chat_id, menu_button: c.chat_id > 0 ? { type: "web_app", text: "Даты", web_app: { url: "https://michurino.asia/tg.html" } } : { type: "commands" } }),
      tg("sendMessage", { chat_id: c.chat_id, text: "👋 Проверка: уведомления с сайта Мичурино работают.",
        reply_markup: { inline_keyboard: [[{ text: "📒 Открыть админку", url: "https://michurino.asia/admin.html" }]] } }),
    ]).then(([, s]) => s)));
    rs.forEach((x) => { if (!x.ok) console.error("telegram test", x.description); });
    return json({ configured: true, bot, chats, tested: rs.filter((x) => x.ok).length });
  }
  if (action !== "link") return json({ configured: true, bot, chats: await listChats() });

  const hook = await setHook();
  if (!hook.ok) return json({ configured: true, bot, error: "webhook_failed", detail: hook.description, chats: await listChats() });
  const code = Array.from(crypto.getRandomValues(new Uint8Array(12))).map((x) => x.toString(16).padStart(2, "0")).join("");
  await db.from("tg_link_codes").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
  await db.from("tg_link_codes").insert({ code, user_id: user.id });
  return json({ configured: true, bot, link: `https://t.me/${bot}?start=${code}`, chats: await listChats() });
});
