import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

// Telegram-мини-приложение для гостей (book.html): свободные даты, «регистрация» (имя + телефон), заявка, мои заявки.
// Плюс событие от базы: админ сменил статус заявки → пишем гостю в Telegram.
// verify_jwt = false (гость входит по подписи Telegram initData)
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
const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };
async function checkInitData(initData: string, token: string): Promise<TgUser | null> {
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if (!hash) return null;
  p.delete("hash");
  const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = await hmac(enc.encode("WebAppData"), token);
  if (!same(hex(await hmac(secret, dcs)), hash)) return null;
  const age = Date.now() / 1000 - Number(p.get("auth_date") ?? 0);
  if (!(age >= -300 && age < 2 * 24 * 3600)) return null;
  try { const u = JSON.parse(p.get("user") ?? "null"); return u && Number.isInteger(u.id) ? u : null; } catch { return null; }
}

const OBJ: Record<string, string> = { cottage: "🏡 Коттедж", hall: "🎉 Банкетный зал", banya: "🧖 Баня", complex: "🌲 Весь комплекс" };
const SITE = "https://michurino.asia";
const PHONE = "+7 (775) 454-26-00";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dayOk = (s: unknown) => typeof s === "string" && ISO.test(s) && new Date(Date.parse(s + "T00:00:00Z")).toISOString().slice(0, 10) === s;
const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10); // время Казахстана
const addDays = (s: string, n: number) => new Date(Date.parse(s + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);
const ru = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const when = (b: { object: string; date_in: string; date_out: string | null; hours: number | null }) =>
  b.object === "cottage" || b.object === "complex"
    ? `${ru(b.date_in)}, 12:00 → ${ru(b.date_out ?? b.date_in)}, 12:00`
    : `${ru(b.date_in)}${b.hours ? ` · ${b.hours} ч` : ""}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return json({ error: "not_configured" }, 500);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const tg = (method: string, payload: unknown) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }).then((r) => r.json()).catch((e) => ({ ok: false, description: String(e) }));
  const body = await req.json().catch(() => ({}));

  // ---------- событие от базы: статус заявки изменился ----------
  if (body.event === "status") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return json({ error: "bad" }, 400);
    const { data: cur } = await db.from("bookings").select("status, tg_status_sent").eq("id", id).not("tg_user_id", "is", null).maybeSingle();
    if (!cur || !["confirmed", "cancelled"].includes(cur.status) || cur.tg_status_sent === cur.status) return json({ skip: true });
    // помечаем заранее, чтобы при повторном вызове не написать дважды
    const { data: b } = await db.from("bookings").update({ tg_status_sent: cur.status }).eq("id", id).eq("status", cur.status)
      .or(`tg_status_sent.is.null,tg_status_sent.neq.${cur.status}`).select("*").maybeSingle();
    if (!b) return json({ skip: true });
    const text = b.status === "confirmed"
      ? `✅ <b>Бронь подтверждена!</b>\n\n${OBJ[b.object] ?? ""}\n📅 ${when(b)}\n👥 Гостей: ${b.guests}\n\nЖдём вас в «Мичурино» 🌲\nс. Тепличное, ул. Пионеров, 82\nВопросы: ${PHONE}`
      : `❌ <b>Заявка отменена</b>\n\n${OBJ[b.object] ?? ""}\n📅 ${when(b)}\n\nЕсли это ошибка или хотите другие даты — позвоните: ${PHONE} или отправьте новую заявку.`;
    const r = await tg("sendMessage", { chat_id: b.tg_user_id, text, parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "📅 Забронировать ещё", web_app: { url: `${SITE}/book.html` } }]] } });
    if (!r.ok) console.error("guest notify", r.description);
    return json({ sent: !!r.ok });
  }

  // ---------- запросы из мини-приложения ----------
  const u = await checkInitData(String(body.initData ?? ""), token);
  if (!u) return json({ error: "bad_signature" }, 401);

  const state = async () => {
    const [{ data: profile }, { data: rows }, { data: mine }, { data: st }] = await Promise.all([
      db.from("tg_guests").select("name, phone").eq("tg_user_id", u.id).maybeSingle(),
      db.from("booked_dates").select("day, object").gte("day", addDays(today(), -31)).order("day").limit(3000),
      db.from("bookings").select("id, created_at, object, date_in, date_out, hours, guests, status").eq("tg_user_id", u.id)
        .order("created_at", { ascending: false }).limit(10),
      db.from("site_settings").select("value").eq("key", "show_dates").maybeSingle(),
    ]);
    const showDates = st?.value === true; // админ включает в админке → вкладка «Даты»
    return { profile: profile ?? { name: [u.first_name, u.last_name].filter(Boolean).join(" ").slice(0, 100), phone: "" }, rows: showDates ? rows ?? [] : [], showDates, mine: mine ?? [] };
  };

  try {
    if (body.action === "book") {
      const f = body.booking ?? {};
      const object = String(f.object ?? "");
      if (!OBJ[object]) return json({ error: "bad_object" }, 400);
      const stay = object === "cottage" || object === "complex";
      const name = String(f.name ?? "").trim().slice(0, 100);
      const phone = String(f.phone ?? "").trim().slice(0, 30);
      const comment = String(f.comment ?? "").trim().slice(0, 1000) || null;
      const guests = Math.trunc(Number(f.guests));
      const hours = object === "banya" ? Math.trunc(Number(f.hours)) : null;
      if (!name) return json({ error: "bad_name" }, 400);
      if (phone.replace(/\D/g, "").length < 10) return json({ error: "bad_phone" }, 400);
      if (!dayOk(f.date_in) || f.date_in < today() || f.date_in > addDays(today(), 760)) return json({ error: "bad_date" }, 400);
      const date_out = stay ? f.date_out : null;
      if (stay && (!dayOk(date_out) || date_out <= f.date_in || date_out > addDays(f.date_in, 60))) return json({ error: "bad_date_out" }, 400);
      if (!(guests >= 1 && guests <= 150)) return json({ error: "bad_guests" }, 400);
      if (object === "banya" && !(hours! >= 3 && hours! <= 24)) return json({ error: "bad_hours" }, 400);

      // лимит: 3 заявки за 10 минут и 8 в сутки с одного Telegram
      const since = (ms: number) => new Date(Date.now() - ms).toISOString();
      const [{ count: c10 }, { count: c24 }] = await Promise.all([
        db.from("bookings").select("id", { count: "exact", head: true }).eq("tg_user_id", u.id).gte("created_at", since(600_000)),
        db.from("bookings").select("id", { count: "exact", head: true }).eq("tg_user_id", u.id).gte("created_at", since(86400_000)),
      ]);
      if ((c10 ?? 0) >= 3 || (c24 ?? 0) >= 8) return json({ error: "too_many" }, 429);

      const username = typeof u.username === "string" ? u.username.slice(0, 64) : null;
      await db.from("tg_guests").upsert({ tg_user_id: u.id, name, phone, username, updated_at: new Date().toISOString() });
      const { error } = await db.from("bookings").insert({
        object, name, phone, date_in: f.date_in, date_out, hours, guests, comment, tg_user_id: u.id, tg_username: username,
      });
      if (error) { console.error("insert booking", error); return json({ error: "failed" }, 500); }

      const r = await tg("sendMessage", { chat_id: u.id, parse_mode: "HTML",
        text: `📨 <b>Заявка отправлена!</b>\n\n${OBJ[object]}\n📅 ${when({ object, date_in: f.date_in, date_out, hours })}\n👥 Гостей: ${guests}\n👤 ${esc(name)}, ${esc(phone)}\n\nХозяин скоро свяжется с вами. Когда бронь подтвердят — придёт сообщение сюда.` });
      if (!r.ok) console.error("guest receipt", r.description);
      return json({ ok: true, ...(await state()) });
    }
    if (body.action === "profile") {
      const name = String(body.name ?? "").trim().slice(0, 100), phone = String(body.phone ?? "").trim().slice(0, 30);
      await db.from("tg_guests").upsert({ tg_user_id: u.id, name, phone, username: u.username?.slice(0, 64) ?? null, updated_at: new Date().toISOString() });
      return json({ ok: true });
    }
    return json(await state());
  } catch (e) {
    console.error("tg-guest", e);
    return json({ error: "failed" }, 500);
  }
});
