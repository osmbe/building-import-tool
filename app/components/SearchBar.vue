<template>
  <div class="relative w-full">
    <div class="relative">
      <Search
        class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
      />
      <input
        v-model="query"
        type="text"
        placeholder="Search locations in Belgium…"
        class="w-full h-8 pl-8 pr-7 text-xs bg-white/[0.05] border border-white/[0.07] rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 focus:bg-white/[0.08] transition-all font-[inherit]"
        @focus="open = true"
        @keydown.esc="open = false"
      />
      <button
        v-if="query"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        @click="clear"
      >
        <X class="h-3 w-3" />
      </button>
    </div>

    <SearchResults
      v-if="open && (isLoading || results.length > 0 || (query.length < 3 && history.length > 0))"
      :results="results"
      :is-loading="isLoading"
      :search-history="history"
      :query="query"
      @close="open = false"
      @select="selectResult"
    />
  </div>
</template>

<script setup lang="ts">
import {
  type Provider,
  type SearchResult,
  addToSearchHistory,
  getSearchHistory,
  searchLocations
} from '~/composables/useSearch'
import { Search, X } from 'lucide-vue-next'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import SearchResults from '~/components/SearchResults.vue'

const emit = defineEmits<{ (e: 'select', result: SearchResult): void }>()

const query = ref('')
const provider = ref<Provider>('osm')
const results = ref<SearchResult[]>([])
const isLoading = ref(false)
const open = ref(false)
const history = ref<SearchResult[]>([])

let debounceTimer: NodeJS.Timeout | null = null

onMounted(() => {
  history.value = getSearchHistory()
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

function clear() {
  query.value = ''
  results.value = []
}

watch([query, provider], ([q, p]) => {
  if (debounceTimer) clearTimeout(debounceTimer)

  if (!q || q.trim().length < 3) {
    results.value = []
    isLoading.value = false
    return
  }

  isLoading.value = true

  debounceTimer = setTimeout(async () => {
    try {
      const searchResults = await searchLocations(q, p)
      results.value = searchResults
    } catch (e) {
      console.error('Search error:', e)
      results.value = []
    } finally {
      isLoading.value = false
    }
  }, 500)
})

function selectResult(result: SearchResult) {
  addToSearchHistory(result)
  history.value = getSearchHistory()
  emit('select', result)
  open.value = false
  query.value = result.displayName
}
</script>
