<template>
  <Card class="absolute top-full left-0 right-0 mt-1 p-2 z-[100] bg-background shadow-lg border">
    <div v-if="isLoading" class="flex items-center justify-center py-6">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      <span class="ml-2 text-sm text-muted-foreground">Searching Nominatim...</span>
    </div>

    <template v-else>
      <div v-if="!query && searchHistory.length" class="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-2">
        <Clock class="h-3 w-3" /> Recent searches
      </div>
      <div v-if="query && query.length < 3" class="px-3 py-4 text-sm text-muted-foreground">
        Type at least 3 characters to search...
      </div>
      <div class="space-y-1 max-h-[420px] overflow-auto">
        <template v-if="query && query.length >= 3 && results.length === 0">
          <div class="px-3 py-6 text-sm text-muted-foreground">No results found for "{{ query }}"</div>
        </template>
        <template v-else>
          <div v-for="item in (query && query.length >= 3 ? results : searchHistory)" :key="item.id"
               class="flex items-center justify-between px-2 py-2 rounded hover:bg-accent transition cursor-pointer"
               @click="$emit('select', item)">
            <div class="flex items-center gap-2">
              <component :is="iconFor(item.type)" class="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div class="flex flex-col">
                <span class="text-sm">{{ item.displayName }}</span>
                <span class="text-xs text-muted-foreground">{{ item.details?.postcode || item.details?.region || item.provider.toUpperCase() }}</span>
              </div>
            </div>
            <Badge variant="secondary" class="text-[10px]">{{ item.provider.toUpperCase() }}</Badge>
          </div>
        </template>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Card from '~/components/ui/card.vue'
import Badge from '~/components/ui/badge.vue'
import { MapPin, Building, Home, Star, Clock } from 'lucide-vue-next'
import type { SearchResult } from '~/composables/useSearch'

const props = defineProps<{
  results: SearchResult[]
  isLoading: boolean
  searchHistory: SearchResult[]
  query: string
}>()

const iconFor = (type: SearchResult['type']) => {
  switch (type) {
    case 'city': return MapPin
    case 'building': return Building
    case 'address': return Home
    default: return Star
  }
}
</script>
