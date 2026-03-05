<template>
  <div class="relative w-full">
    <div class="flex gap-2 items-center">
      <div class="flex-1 relative">
        <Input
          v-model="query"
          placeholder="Search locations"
          class="pl-9"
          @focus="open = true"
          @keydown.esc="open = false"
        />
        <Search class="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>
      <Button variant="outline" size="sm" disabled>OSM</Button>
      <Button variant="ghost" size="icon" v-if="query" @click="clear">
        <X class="h-4 w-4" />
      </Button>
    </div>

    <SearchResults
      v-if="open && (isLoading || results.length > 0 || (query.length < 3 && history.length > 0))"
      :results="results"
      :is-loading="isLoading"
      :search-history="history"
      :query="query"
      @close="open=false"
      @select="selectResult"
    />
  </div>
</template>

<script setup lang="ts">
import { type Provider, type SearchResult, addToSearchHistory, getSearchHistory, searchLocations } from '~/composables/useSearch'
import { Search, X } from 'lucide-vue-next'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import Button from '~/components/ui/button.vue'
import DropdownMenu from '~/components/ui/dropdown-menu.vue'
import DropdownMenuContent from '~/components/ui/dropdown-menu-content.vue'
import DropdownMenuItem from '~/components/ui/dropdown-menu-item.vue'
import DropdownMenuTrigger from '~/components/ui/dropdown-menu-trigger.vue'
import Input from '~/components/ui/input.vue'
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
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
})

function clear() {
  query.value = ''
  results.value = []
}

// Debounced search to avoid too many API calls
watch([query, provider], ([q, p]) => {
  // Clear previous timer
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }

  if (!q || q.trim().length < 3) {
    results.value = []
    isLoading.value = false
    return
  }

  // Show loading state immediately
  isLoading.value = true

  // Debounce the actual search
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
  }, 500) // 500ms debounce
})

function selectResult(result: SearchResult) {
  addToSearchHistory(result)
  history.value = getSearchHistory()
  emit('select', result)
  open.value = false
  query.value = result.displayName
}
</script>
