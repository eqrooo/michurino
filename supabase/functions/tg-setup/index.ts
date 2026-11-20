import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

// Обновляет настройку бота: вебхук (сообщения + нажатия кнопок), список команд и кнопку «Даты»
// у подключённых чатов. Безопасно вызывать повторно: всегда ставит одну и ту же фиксированную
// настройку и ничего секретного не возвращает.
// verify_jwt = false
async function secretFor(token: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("michurino:" + token));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

Deno.serve(async () => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return new Response("not configured");
  const tg = (method: string, payload: unknown) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }).then((x) => x.json()).catch(() => ({ ok: false }));
  const r = await tg("setWebhook", { url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/tg-webhook`, secret_token: await secretFor(token), allowed_updates: ["message", "callback_query"] });
  await tg("setMyCommands", { commands: [
    { command: "dates", description: "Занятые даты (календарь)" },
    { command: "admin", description: "Открыть админку" },
    { command: "stop", description: "Отключить уведомления" },
  ] });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: chats } = await db.from("tg_chats").select("chat_id");
  const menus = await Promise.all((chats ?? []).map((c) => tg("setChatMenuButton", {
    chat_id: c.chat_id,
    menu_button: c.chat_id > 0 ? { type: "web_app", text: "Даты", web_app: { url: "https://michurino.asia/tg.html" } } : { type: "commands" },
  })));
  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((x) => x.json()).catch(() => null);
  return new Response(JSON.stringify({
    ok: r.ok, menus: menus.filter((m) => m.ok).length,
    allowed: info?.result?.allowed_updates ?? null, pending: info?.result?.pending_update_count ?? null, last_error: info?.result?.last_error_message ?? null,
  }), { headers: { "Content-Type": "application/json" } });
});
