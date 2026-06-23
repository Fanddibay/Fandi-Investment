import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sends a Telegram message via the Bot API.
// - Bot token comes from the TELEGRAM_BOT_TOKEN secret (never the client).
// - Chat id comes from the request body, or falls back to app_settings.
// - Every send is recorded in notif_log.
//
// Set the secret once:  supabase secrets set TELEGRAM_BOT_TOKEN=123:abc

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) {
    return json({ success: false, error: "TELEGRAM_BOT_TOKEN secret not set" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { message = "", chat_id: bodyChatId, type = "manual" } = await req
    .json()
    .catch(() => ({}));

  if (!message) {
    return json({ success: false, error: "message is required" }, 400);
  }

  // Prefer an explicit chat id; otherwise read the one saved in settings.
  let chatId = bodyChatId;
  if (!chatId) {
    const { data } = await supabase
      .from("app_settings")
      .select("telegram_chat_id")
      .eq("id", 1)
      .single();
    chatId = data?.telegram_chat_id;
  }

  if (!chatId) {
    return json({ success: false, error: "No Telegram chat id configured" }, 400);
  }

  let ok = false;
  let errMsg: string | null = null;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      },
    );
    const tg = await res.json();
    ok = res.ok && tg?.ok === true;
    if (!ok) errMsg = tg?.description ?? `Telegram responded ${res.status}`;
  } catch (err) {
    errMsg = String(err);
  }

  // Best-effort audit log; don't fail the response if logging fails.
  await supabase
    .from("notif_log")
    .insert({ type, message, success: ok })
    .then(() => {}, () => {});

  return json({ success: ok, error: errMsg }, ok ? 200 : 502);
});
