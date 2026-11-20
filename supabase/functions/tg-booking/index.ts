import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

// Вызывается триггером базы при новой заявке. Шлёт только реальную заявку и только один раз (tg_sent).
// verify_jwt = false
const OBJ: Record<string, string> = { cottage: "🏡 Коттедж", hall: "🎉 Банкетный зал", banya: "🧖 Баня", complex: "🌲 Весь комплекс" };
const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
const d = (s: string) => { try { return new Date(s + "T00:00:00Z").toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short", timeZone: "UTC" }); } catch { return s; } };

Deno.serve(async (req) => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return new Response("tg not configured", { status: 200 });
  let id: number;
  try { id = Number((await req.json()).id); } catch { return new Response("bad", { status: 400 }); }
  if (!Number.isInteger(id)) return new Response("bad", { status: 400 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: b, error: e1 } = await db.from("bookings").update({ tg_sent: true }).eq("id", id).eq("tg_sent", false).select("*").maybeSingle();
  if (e1) console.error("update error", e1);
  if (!b) return new Response("skip", { status: 200 });
  const { data: chats } = await db.from("tg_chats").select("chat_id");
  if (!chats?.length) return new Response("no chats", { status: 200 });

  const phoneDigits = String(b.phone).replace(/\D/g, "").replace(/^8(\d{10})$/, "7$1");
  const when = b.date_out ? `${d(b.date_in)} → ${d(b.date_out)}` : d(b.date_in);
  const text = [
    `<b>🔔 Новая заявка!</b>`,
    ``,
    `${OBJ[b.object] ?? esc(b.object)}`,
    `📅 ${when}${b.hours ? ` · ${b.hours} ч` : ""}`,
    `👥 Гостей: ${b.guests}`,
    `👤 ${esc(b.name)}`,
    `📞 ${esc(b.phone)}`,
    b.comment ? `💬 ${esc(b.comment)}` : null,
  ].filter((x) => x !== null).join("\n");
  const row = [{ text: "📒 Открыть админку", url: "https://michurino.asia/admin.html" }];
  if (phoneDigits.length >= 10) row.unshift({ text: "💬 WhatsApp", url: `https://wa.me/${phoneDigits}` });
  const reply_markup = { inline_keyboard: [row] };

  const sendTo = async (chat_id: number) => {
    const call = (payload: unknown) => fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }).then((r) => r.json()).catch((e) => ({ ok: false, description: String(e) }));
    let r = await call({ chat_id, text, parse_mode: "HTML", reply_markup });
    if (!r.ok) {
      console.error("telegram error", chat_id, r.description);
      r = await call({ chat_id, text: text.replace(/<[^>]+>/g, "") }); // запасной вариант без разметки
      if (!r.ok) console.error("telegram fallback error", chat_id, r.description);
    }
    return r.ok;
  };
  const res = await Promise.all(chats.map((c) => sendTo(c.chat_id)));
  return new Response(res.some(Boolean) ? "ok" : "telegram_failed", { status: 200 });
});
