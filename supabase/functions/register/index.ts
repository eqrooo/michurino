import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

// Регистрация для админки без письма-подтверждения. Прав не даёт: доступ всё равно подтверждает админ.
// verify_jwt = false
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { email, password } = await req.json().catch(() => ({}));
  const em = String(email ?? "").trim().toLowerCase();
  const pw = String(password ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || em.length > 200) return json({ error: "bad_email" }, 400);
  if (pw.length < 8 || pw.length > 72) return json({ error: "weak_password" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // защита от спама: не больше 10 новых аккаунтов в час
  const { data: recent } = await db.rpc("recent_signups");
  if (typeof recent === "number" && recent >= 10) return json({ error: "too_many" }, 429);

  const { error } = await db.auth.admin.createUser({ email: em, password: pw, email_confirm: true });
  if (error) {
    const m = (error.message || "").toLowerCase();
    if (m.includes("already") || m.includes("exists") || m.includes("registered")) return json({ error: "exists" }, 409);
    if (m.includes("password")) return json({ error: "weak_password" }, 400);
    console.error("createUser", error);
    return json({ error: "failed" }, 500);
  }
  return json({ ok: true });
});
