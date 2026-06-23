<template>
  <div class="space-y-8 max-w-2xl">
    <div>
      <h1 class="text-2xl font-bold text-white">Settings</h1>
      <p class="text-slate-500 text-sm mt-1">Configure notifications and data sources</p>
    </div>

    <!-- Telegram Section -->
    <div class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-6">
      <div class="flex items-center gap-3 mb-5">
        <div class="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
          <svg class="w-5 h-5 text-sky-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
        </div>
        <div>
          <h2 class="font-semibold text-white text-sm">Telegram Notifications</h2>
          <p class="text-xs text-slate-500">Daily briefing + price alerts</p>
        </div>
        <div class="ml-auto">
          <span class="text-xs px-2 py-1 rounded-full"
            :class="telegramConfigured ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'">
            {{ telegramConfigured ? 'Connected' : 'Not configured' }}
          </span>
        </div>
      </div>

      <form @submit.prevent="saveTelegram" class="space-y-4">
        <div>
          <label class="text-xs text-slate-400 mb-1.5 block">Bot Token</label>
          <input v-model="telegram.botToken" type="password" placeholder="Paste your bot token here"
            class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
          <p class="text-xs text-slate-600 mt-1">Get this from @BotFather on Telegram</p>
        </div>
        <div>
          <label class="text-xs text-slate-400 mb-1.5 block">Chat ID</label>
          <input v-model="telegram.chatId" placeholder="Your Telegram chat ID"
            class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-sky-500 focus:outline-none transition-colors" />
          <p class="text-xs text-slate-600 mt-1">Send /start to @userinfobot to get your ID</p>
        </div>

        <!-- Alert threshold -->
        <div>
          <label class="text-xs text-slate-400 mb-1.5 block">Alert on daily move ≥</label>
          <div class="flex items-center gap-3">
            <input v-model.number="telegram.threshold" type="range" min="1" max="10" step="0.5" class="flex-1 accent-sky-500" />
            <span class="text-sm text-white font-medium w-12 text-right">{{ telegram.threshold }}%</span>
          </div>
        </div>

        <!-- Briefing time -->
        <div>
          <label class="text-xs text-slate-400 mb-1.5 block">Daily briefing time (WIB)</label>
          <input v-model="telegram.briefingTime" type="time"
            class="bg-[#0f1117] border border-[#2e3348] rounded-lg px-3 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none transition-colors" />
        </div>

        <div class="flex gap-3">
          <button type="button" @click="showPreview = !showPreview"
            class="px-4 py-2.5 rounded-lg border border-[#2e3348] text-slate-400 text-sm hover:border-slate-500 transition-colors">
            {{ showPreview ? 'Hide preview' : 'Preview briefing' }}
          </button>
          <button type="button" @click="sendManualBrief" :disabled="!telegram.chatId || sending"
            class="px-4 py-2.5 rounded-lg border border-sky-500/40 text-sky-400 text-sm hover:border-sky-500 hover:bg-sky-500/10 disabled:opacity-40 transition-all active:scale-95">
            {{ sending ? 'Sending…' : 'Send Manual Brief' }}
          </button>
          <button type="submit" :disabled="saving"
            class="flex-1 py-2.5 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-400 disabled:opacity-60 transition-all active:scale-95">
            {{ saving ? 'Saving…' : 'Save Settings' }}
          </button>
        </div>

        <!-- Live preview of the exact message Telegram will receive. Lets you
             verify wording before sending or scheduling. -->
        <Transition name="status">
          <div v-if="showPreview" class="bg-[#0f1117] border border-[#2e3348] rounded-xl p-4">
            <p class="text-xs text-slate-500 mb-3 flex items-center gap-2">
              <span class="text-sky-400">📊 PortfolioHQ Bot</span>
              <span>· this is what you'll receive</span>
            </p>
            <pre class="text-xs text-slate-200 whitespace-pre-wrap font-mono leading-relaxed">{{ previewText }}</pre>
          </div>
        </Transition>

        <!-- Inline status — fades in, no jarring alert() -->
        <Transition name="status">
          <p v-if="status.text" class="text-xs flex items-center gap-1.5"
            :class="status.ok ? 'text-green-400' : 'text-red-400'">
            <span class="w-1.5 h-1.5 rounded-full" :class="status.ok ? 'bg-green-400' : 'bg-red-400'" />
            {{ status.text }}
          </p>
        </Transition>
      </form>
    </div>

    <!-- Notification history -->
    <div class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-6">
      <div class="flex items-center gap-3 mb-5">
        <div class="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
          <svg class="w-4 h-4 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div>
          <h2 class="font-semibold text-white text-sm">Notification History</h2>
          <p class="text-xs text-slate-500">Recent daily &amp; manual briefs</p>
        </div>
        <button type="button" @click="loadHistory" :disabled="loadingHistory"
          class="ml-auto text-xs px-3 py-1.5 rounded-lg border border-[#2e3348] text-slate-400 hover:border-slate-500 disabled:opacity-40 transition-colors active:scale-95">
          {{ loadingHistory ? '…' : 'Refresh' }}
        </button>
      </div>

      <div v-if="history.length === 0" class="text-center py-6 text-slate-500 text-sm">
        No notifications sent yet.
      </div>
      <ul v-else class="space-y-2">
        <li v-for="row in history" :key="row.id"
          class="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-[#0f1117] border border-[#2e3348]">
          <span class="text-xs px-2 py-1 rounded-full font-medium shrink-0" :class="typeBadge(row.type).class">
            {{ typeBadge(row.type).label }}
          </span>
          <span class="text-xs text-slate-400 truncate flex-1">{{ briefSummary(row.message) }}</span>
          <span class="text-xs text-slate-500 shrink-0">{{ formatLogTime(row.sent_at) }}</span>
          <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="row.success ? 'bg-green-400' : 'bg-red-400'"
            :title="row.success ? 'Delivered' : 'Failed'" />
        </li>
      </ul>
    </div>

    <!-- Data sources -->
    <div class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-6">
      <h2 class="font-semibold text-white text-sm mb-4">Data Sources</h2>
      <div class="space-y-3">
        <div v-for="src in dataSources" :key="src.name" class="flex items-center justify-between py-2 border-b border-[#2e3348] last:border-0">
          <div>
            <p class="text-sm text-white">{{ src.name }}</p>
            <p class="text-xs text-slate-500">{{ src.desc }}</p>
          </div>
          <span class="text-xs px-2 py-1 rounded-full"
            :class="src.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-slate-500/10 text-slate-400'">
            {{ src.status }}
          </span>
        </div>
      </div>
    </div>

    <!-- Data Management: export / import / migrate -->
    <DataManagementCard />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { sendTelegramAlert } from '@/lib/telegram'
import { usePortfolioStore } from '@/stores/portfolio'
import { buildBriefingMessage } from '@/lib/briefing'
import DataManagementCard from '@/components/DataManagementCard.vue'

const store = usePortfolioStore()

// botToken is write-only here: it's saved to Supabase secrets via the CLI, not
// the DB, so we never load it back. chatId / threshold / time live in app_settings.
const telegram = ref({
  botToken: '',
  chatId: '',
  threshold: 2,
  briefingTime: '08:00',
})

const saving = ref(false)
const sending = ref(false)
const showPreview = ref(false)
const status = ref({ text: '', ok: true })
const history = ref([])
const loadingHistory = ref(false)

// "Connected" = we have a chat id saved. The bot token lives server-side.
const telegramConfigured = computed(() => !!telegram.value.chatId)

// The exact briefing message, built from live portfolio data — same builder the
// scheduled send-briefing function uses, so the preview is faithful.
const briefingMessage = computed(() =>
  buildBriefingMessage({
    holdings: store.holdingsWithSnapshot,
    total: store.grandTotal,
    displayCurrency: store.displayCurrency,
    fxRate: store.fxRate,
    now: new Date(),
  }),
)

// Strip the Telegram HTML tags / entities for the on-screen plain-text preview.
const previewText = computed(() =>
  briefingMessage.value
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&'),
)

const dataSources = [
  { name: 'Yahoo Finance', desc: 'QQQ, SPY, ANTM.JK prices', status: 'active' },
  { name: 'Logam Mulia Antam', desc: 'Gold bar prices (IDR/gram)', status: 'active' },
  { name: 'Reksa Dana / Obligasi', desc: 'Manual input — no public API', status: 'manual' },
]

function flash(text, ok = true) {
  status.value = { text, ok }
  setTimeout(() => (status.value = { text: '', ok }), 4000)
}

onMounted(async () => {
  // Make sure the preview has live portfolio data even if Settings is the first
  // page opened (cheap cached read — no Yahoo call).
  if (!store.holdings.length) store.loadCached()
  loadHistory()

  const { data } = await supabase
    .from('app_settings')
    .select('telegram_chat_id, alert_threshold, briefing_time')
    .eq('id', 1)
    .single()
  if (data) {
    telegram.value.chatId = data.telegram_chat_id ?? ''
    telegram.value.threshold = Number(data.alert_threshold ?? 2)
    telegram.value.briefingTime = data.briefing_time ?? '08:00'
  }
})

async function saveTelegram() {
  saving.value = true
  const { error } = await supabase.from('app_settings').upsert({
    id: 1,
    telegram_chat_id: telegram.value.chatId || null,
    alert_threshold: telegram.value.threshold,
    briefing_time: telegram.value.briefingTime,
    telegram_enabled: !!telegram.value.chatId,
    updated_at: new Date().toISOString(),
  })
  saving.value = false
  if (error) {
    flash('Could not save: ' + error.message, false)
  } else if (telegram.value.botToken) {
    flash('Saved. Remember to store the bot token as a Supabase secret.', true)
  } else {
    flash('Settings saved.', true)
  }
}

// Manual Brief: send the REAL briefing on demand, any number of times. Logs as
// type 'manual' so it's independent of the daily schedule — testing never
// blocks (or is blocked by) the automatic daily send.
async function sendManualBrief() {
  sending.value = true
  const { ok, error } = await sendTelegramAlert(briefingMessage.value, {
    chatId: telegram.value.chatId,
    type: 'manual',
  })
  sending.value = false
  flash(ok ? 'Manual brief sent to Telegram!' : 'Send failed: ' + (error ?? 'check bot token'), ok)
  loadHistory()
}

// --- Notification history -------------------------------------------------
async function loadHistory() {
  loadingHistory.value = true
  const { data } = await supabase
    .from('notif_log')
    .select('id, type, message, sent_at, success')
    .order('sent_at', { ascending: false })
    .limit(20)
  history.value = data ?? []
  loadingHistory.value = false
}

// Map a log type to a readable label + badge colour. Legacy types from earlier
// builds fall back gracefully.
function typeBadge(type) {
  const daily = { label: 'Daily Brief', class: 'bg-sky-500/10 text-sky-400' }
  const manual = { label: 'Manual Brief', class: 'bg-slate-500/10 text-slate-300' }
  const map = {
    daily,
    manual,
    // Legacy types from earlier builds, mapped so history reads consistently.
    briefing: daily,
    'briefing-test': manual,
    test: manual,
  }
  return map[type] ?? { label: type ?? 'Other', class: 'bg-slate-500/10 text-slate-400' }
}

// First meaningful line of the message (strip HTML tags + emoji header noise).
function briefSummary(message) {
  if (!message) return '—'
  const plain = message.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
  return plain.split('\n')[0]
}

function formatLogTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Jakarta',
    ...(sameDay ? {} : { day: '2-digit', month: 'short' }),
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}
</script>

<style scoped>
.status-enter-active, .status-leave-active { transition: opacity .25s ease, transform .25s ease; }
.status-enter-from, .status-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
