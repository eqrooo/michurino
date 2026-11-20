import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

// Обновляет настройку бота: вебхук, описание, команды и кнопки меню.
// Гостям: кнопка «Забронировать» (book.html), команды /start, /book.
// Подключённым админам: кнопка «Даты» (tg.html) и админские команды.
// Безопасно вызывать повторно: ставит одну и ту же фиксированную настройку и ничего секретного не возвращает.
// verify_jwt = false
async function secretFor(token: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("michurino:" + token));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 48);
}
const SITE = "https://michurino.asia";
const ADMIN_COMMANDS = [
  { command: "dates", description: "Занятые даты (календарь)" },
  { command: "book", description: "Забронировать (как гость)" },
  { command: "admin", description: "Открыть админку" },
  { command: "stop", description: "Отключить уведомления" },
];

Deno.serve(async () => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return new Response("not configured");
  const tg = (method: string, payload: unknown) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }).then((x) => x.json()).catch(() => ({ ok: false }));
  const r = await tg("setWebhook", { url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/tg-webhook`, secret_token: await secretFor(token), allowed_updates: ["message", "callback_query"] });

  // для всех (гостей)
  await Promise.all([
    tg("setMyCommands", { commands: [
      { command: "book", description: "Забронировать онлайн" },
      { command: "start", description: "О комплексе" },
    ] }),
    tg("setChatMenuButton", { menu_button: { type: "web_app", text: "Забронировать", web_app: { url: `${SITE}/book.html` } } }),
    tg("setMyShortDescription", { short_description: "Комплекс отдыха «Мичурино»: коттедж, банкетный зал, баня. Свободные даты и бронь онлайн." }),
    tg("setMyDescription", { description: "Комплекс отдыха «Мичурино» в с. Тепличное 🌲\n\n🏡 Коттедж — посуточно, с 12:00 до 12:00\n🎉 Банкетный зал — до 70 гостей\n🧖 Баня — от 3 часов\n\nЗдесь можно посмотреть свободные даты и отправить заявку онлайн. Нажмите «Старт»." }),
  ]);

  // подключённым админам
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: chats } = await db.from("tg_chats").select("chat_id");
  const menus = await Promise.all((chats ?? []).map((c) => Promise.all([
    tg("setChatMenuButton", { chat_id: c.chat_id, menu_button: c.chat_id > 0 ? { type: "web_app", text: "Даты", web_app: { url: `${SITE}/tg.html` } } : { type: "commands" } }),
    tg("setMyCommands", { commands: ADMIN_COMMANDS, scope: { type: "chat", chat_id: c.chat_id } }),
  ]).then(([m]) => m)));

  const me = await tg("getMe", {});
  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((x) => x.json()).catch(() => null);
  return new Response(JSON.stringify({
    ok: r.ok, bot: me?.result?.username ?? null, menus: menus.filter((m) => m.ok).length,
    allowed: info?.result?.allowed_updates ?? null, pending: info?.result?.pending_update_count ?? null, last_error: info?.result?.last_error_message ?? null,
  }), { headers: { "Content-Type": "application/json" } });
});
