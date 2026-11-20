import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

// Новый пользователь запросил доступ → письмо (если есть RESEND_API_KEY) и сообщение в Telegram
// с кнопками «Подтвердить / Отклонить» (их обрабатывает tg-webhook).
// verify_jwt = true
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const adminEmail = Deno.env.get("ADMIN_EMAIL") ?? "madiyarman13@gmail.com";
  const site = Deno.env.get("SITE_URL") ?? "https://michurino.asia";

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const db = createClient(url, service);
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return json({ error: "unauthorized" }, 401);

  // шлём только если у этого пользователя есть свежий запрос
  const { data: r } = await db.from("admin_requests").select("id, email, created_at")
    .eq("user_id", user.id).eq("status", "pending")
    .gte("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!r) return json({ sent: false, reason: "no_fresh_request" });

  const link = `${site}/admin.html#access`;
  let emailOk = false, tgOk = false;

  if (resendKey) {
    const html = `<div style="font-family:Arial,sans-serif;font-size:16px;color:#1E2A1F">
      <h2 style="color:#1F3A24">Запрос доступа к админке Мичурино</h2>
      <p><b>${esc(r.email)}</b> просит доступ к админке сайта.</p>
      <p><a href="${link}" style="display:inline-block;background:#2F5A35;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Открыть запросы</a></p>
      <p style="color:#5B665A;font-size:13px">Без вашего подтверждения доступа не будет.</p></div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Мичурино <onboarding@resend.dev>", to: [adminEmail], subject: `Запрос доступа: ${r.email}`, html }),
    }).catch(() => null);
    emailOk = !!res?.ok;
  }

  if (tgToken) {
    const { data: chats } = await db.from("tg_chats").select("chat_id");
    const text = `<b>🔐 Запрос доступа к админке</b>\n\n<b>${esc(r.email)}</b> просит доступ.\nЕсли не знаете, кто это — отклоните.`;
    const reply_markup = { inline_keyboard: [
      [{ text: "✅ Подтвердить", callback_data: `acc:ok:${r.id}` }, { text: "❌ Отклонить", callback_data: `acc:no:${r.id}` }],
      [{ text: "📒 Открыть админку", url: link }],
    ] };
    const rs = await Promise.all((chats ?? []).map((c) => fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: c.chat_id, text, parse_mode: "HTML", reply_markup }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, description: String(e) }))));
    rs.forEach((x) => { if (!x.ok) console.error("telegram error", x.description); });
    tgOk = rs.some((x) => x.ok);
  }
  return json({ sent: emailOk || tgOk, email: emailOk, telegram: tgOk });
});
