import { supabase } from './supabase'

// Sends a message through the send-telegram edge function.
// Pass `chatId` to override the saved one (used by "Send Test" before save).
export async function sendTelegramAlert(message, { chatId, type = 'manual' } = {}) {
  const { data, error } = await supabase.functions.invoke('send-telegram', {
    body: { message, chat_id: chatId, type },
  })
  if (error) console.error('Telegram send failed:', error)
  return { ok: !error && data?.success, error: error?.message ?? data?.error ?? null }
}
