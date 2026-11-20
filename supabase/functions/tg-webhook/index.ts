import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

// Сюда Telegram присылает сообщения и нажатия кнопок. Проверяем секретный заголовок.
const ADMIN_URL = "https://michurino.asia/admin.html";
const DATES_URL = "https://michurino.asia/tg.html";
const BOOK_URL = "https://michurino.asia/book.html";
const GUEST_TEXT = "Здравствуйте! 👋 Это бот комплекса отдыха <b>«Мичурино»</b> 🌲\n\nЗдесь можно посмотреть свободные даты и оставить заявку онлайн:\n🏡 коттедж — посуточно, с 12:00 до 12:00\n🎉 банкетный зал — до 70 гостей\n🧖 баня — от 3 часов\n\nНажмите «📅 Забронировать онлайн» 👇\nТелефон: +7 (775) 454-26-00";
const ADMIN_COMMANDS = [
  { command: "dates", description: "Занятые даты (календарь)" },
  { command: "book", description: "Забронировать (как гость)" },
  { command: "admin", description: "Открыть админку" },
  { command: "stop", description: "Отключить уведомления" },
];
const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
async function secretFor(token: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("michurino:" + token));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

Deno.serve(async (req) => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return new Response("ok");
  const secret = await secretFor(token);
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) return new Response("forbidden", { status: 403 });

  const tg = (method: string, payload: unknown) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }).then((r) => r.json()).catch((e) => ({ ok: false, description: String(e) }));
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const upd = await req.json().catch(() => null);

  try {
    // ---------- нажатие «Подтвердить / Отклонить» ----------
    const cq = upd?.callback_query;
    if (cq) {
      const answer = (text: string) => tg("answerCallbackQuery", { callback_query_id: cq.id, text });
      const m = /^acc:(ok|no):(\d+)$/.exec(String(cq.data ?? ""));
      const chatId = cq.message?.chat?.id;
      if (!m || !chatId) { await answer("Неизвестная кнопка"); return new Response("ok"); }
      // нажать может только подключённый чат действующего админа
      const { data: chat } = await db.from("tg_chats").select("user_id").eq("chat_id", chatId).maybeSingle();
      let isAdmin = false;
      if (chat?.user_id) {
        const { data: adm } = await db.from("admins").select("user_id").eq("user_id", chat.user_id).maybeSingle();
        isAdmin = !!adm;
      }
      if (!isAdmin) { await answer("Нет прав администратора"); return new Response("ok"); }

      const approve = m[1] === "ok";
      const reqId = Number(m[2]);
      const { data: r, error: eu } = await db.from("admin_requests").update({ status: approve ? "approved" : "rejected" })
        .eq("id", reqId).eq("status", "pending").select("user_id, email").maybeSingle();
      if (eu) console.error("update request", eu);
      let result: string;
      if (!r) {
        const { data: cur } = await db.from("admin_requests").select("email, status").eq("id", reqId).maybeSingle();
        result = cur ? `ℹ️ Запрос <b>${esc(cur.email)}</b> уже обработан: ${cur.status === "approved" ? "доступ выдан" : "отклонён"}.` : "ℹ️ Запрос не найден.";
        await answer("Уже обработан");
      } else {
        if (approve) {
          const { error } = await db.from("admins").upsert({ user_id: r.user_id });
          if (error) console.error("grant admin", error);
        }
        const who = [cq.from?.first_name, cq.from?.last_name].filter(Boolean).join(" ");
        result = approve
          ? `✅ <b>Доступ выдан:</b> ${esc(r.email)}${who ? `\nПодтвердил: ${esc(who)}` : ""}\n\nПусть нажмёт «Проверить» в админке.`
          : `❌ <b>Запрос отклонён:</b> ${esc(r.email)}${who ? `\nОтклонил: ${esc(who)}` : ""}`;
        await answer(approve ? "Доступ выдан ✅" : "Запрос отклонён");
      }
      const ed = await tg("editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text: result, parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "📒 Открыть админку", url: ADMIN_URL + "#access" }]] } });
      if (!ed.ok) console.error("edit message", ed.description);
      return new Response("ok");
    }

    // ---------- обычные сообщения ----------
    const msg = upd?.message;
    if (!msg?.chat?.id || typeof msg.text !== "string") return new Response("ok");
    const chatId = msg.chat.id;
    // кнопка мини-приложения работает только в личном чате (chat_id > 0)
    const adminBtn = { inline_keyboard: [
      ...(chatId > 0 ? [[{ text: "📅 Занятые даты", web_app: { url: DATES_URL } }]] : []),
      [{ text: "📒 Открыть админку", url: ADMIN_URL }],
    ] };
    const send = async (text: string, withBtn = true) => {
      const r = await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...(withBtn ? { reply_markup: adminBtn } : {}) });
      if (!r.ok) console.error("telegram send error", r.description);
    };
    // гостям: приветствие и кнопка мини-приложения бронирования
    const guest = async () => {
      const r = await tg("sendMessage", { chat_id: chatId, text: GUEST_TEXT, parse_mode: "HTML", reply_markup: { inline_keyboard: [
        ...(chatId > 0 ? [[{ text: "📅 Забронировать онлайн", web_app: { url: BOOK_URL } }]] : []),
        [{ text: "🌐 Сайт и фото", url: "https://michurino.asia/" }],
      ] } });
      if (!r.ok) console.error("telegram guest error", r.description);
    };
    // кнопка «Админка» слева от поля ввода, команды и приём нажатий кнопок
    const setup = () => Promise.all([
      tg("setChatMenuButton", { chat_id: chatId, menu_button: chatId > 0 ? { type: "web_app", text: "Даты", web_app: { url: DATES_URL } } : { type: "commands" } }),
      tg("setMyCommands", { commands: ADMIN_COMMANDS, scope: { type: "chat", chat_id: chatId } }),
      tg("setWebhook", { url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/tg-webhook`, secret_token: secret, allowed_updates: ["message", "callback_query"] }),
    ]);

    const text = msg.text.trim();
    const { data: linked } = await db.from("tg_chats").select("chat_id").eq("chat_id", chatId).maybeSingle();

    if (text.startsWith("/book")) {
      await guest();
    } else if (text.startsWith("/start")) {
      const code = text.split(/\s+/)[1] ?? "";
      if (!/^[a-f0-9]{24}$/.test(code)) {
        if (linked && code !== "book") { await setup(); await send("Уведомления уже включены ✅"); }
        else await guest();
        return new Response("ok");
      }
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: row, error } = await db.from("tg_link_codes").delete().eq("code", code).gte("created_at", since).select("user_id").maybeSingle();
      if (error) console.error("code lookup", error);
      if (!row) { await send(linked ? "Уведомления уже включены ✅" : "Ссылка устарела. Откройте админку и нажмите «Подключить Telegram» ещё раз."); return new Response("ok"); }
      const { data: isAdm } = await db.from("admins").select("user_id").eq("user_id", row.user_id).maybeSingle();
      if (!isAdm) { await send("Нет прав администратора.", false); return new Response("ok"); }
      const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || msg.chat.title || "";
      const { error: e2 } = await db.from("tg_chats").upsert({ chat_id: chatId, user_id: row.user_id, name });
      if (e2) console.error("save chat", e2);
      await setup();
      await send("✅ <b>Готово!</b> Сюда будут приходить новые заявки с сайта и запросы доступа к админке (их можно подтверждать прямо здесь).\n\n📅 Занятые даты — кнопка «Даты» слева от поля ввода или команда /dates.\nВся админка — /admin. Отключить уведомления — /stop");
    } else if (linked && text.startsWith("/stop")) {
      await db.from("tg_chats").delete().eq("chat_id", chatId);
      // вернуть гостевое меню и команды
      await Promise.all([
        tg("setChatMenuButton", { chat_id: chatId, menu_button: chatId > 0 ? { type: "web_app", text: "Забронировать", web_app: { url: BOOK_URL } } : { type: "default" } }),
        tg("deleteMyCommands", { scope: { type: "chat", chat_id: chatId } }),
      ]);
      await send("Уведомления отключены. Чтобы включить снова — нажмите «Подключить Telegram» в админке.", false);
    } else if (linked && text.startsWith("/dates")) {
      await setup();
      await send("📅 Отметьте занятые даты — гости сразу увидят их на сайте:");
    } else if (linked) {
      await setup();
      await send("📒 Админка Мичурино:");
    } else {
      await guest();
    }
  } catch (e) {
    console.error("handler error", e);
  }
  return new Response("ok");
});
