import { ref, computed } from 'vue'

// "Read Later" — a tiny localStorage-backed set of saved article urls. News is
// ephemeral; this gives an item a lifespan beyond the scroll. Module-level
// state so every component shares one reactive source (star a card here, the
// "Saved" filter count updates instantly).
const STORAGE_KEY = 'news.readLater'

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

const saved = ref(load())

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.value))
}

export function useReadLater() {
  const savedSet = computed(() => new Set(saved.value))
  const count = computed(() => saved.value.length)

  function isSaved(url) {
    return savedSet.value.has(url)
  }

  function toggle(url) {
    if (!url) return
    saved.value = savedSet.value.has(url)
      ? saved.value.filter((u) => u !== url)
      : [...saved.value, url]
    persist()
  }

  return { saved, savedSet, count, isSaved, toggle }
}
