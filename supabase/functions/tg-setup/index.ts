import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Обновляет настройку вебхука бота (сообщения + нажатия кнопок). Безопасно вызывать повторно:
// всегда ставит одну и ту же фиксированную настройку и ничего секретного не возвращает.
// verify_jwt = false
async function secretFor(token: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("michurino:" + token));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

Deno.serve(async () => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return new Response("not configured");
  const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/tg-webhook`, secret_token: await secretFor(token), allowed_updates: ["message", "callback_query"] }),
  }).then((x) => x.json()).catch(() => ({ ok: false }));
  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((x) => x.json()).catch(() => null);
  return new Response(JSON.stringify({ ok: r.ok, allowed: info?.result?.allowed_updates ?? null, pending: info?.result?.pending_update_count ?? null, last_error: info?.result?.last_error_message ?? null }), { headers: { "Content-Type": "application/json" } });
});
