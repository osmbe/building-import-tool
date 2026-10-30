<template>
  <div
    class="absolute top-full left-0 right-0 mt-1 z-[100] glass-panel rounded-lg overflow-hidden animate-fade-up"
  >
    <!-- Loading -->
    <div v-if="isLoading" class="flex items-center justify-center gap-2 py-6">
      <div
        class="h-3.5 w-3.5 rounded-full border-2 border-primary/25 border-t-primary animate-spin"
      ></div>
      <span class="text-[11px] text-muted-foreground"
        >Searching Nominatim…</span
      >
    </div>

    <template v-else>
      <!-- Recent header -->
      <div
        v-if="!query && searchHistory.length"
        class="px-3 pt-3 pb-1 flex items-center gap-1.5"
      >
        <Clock class="h-3 w-3 text-muted-foreground" />
        <span
          class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground"
          >Recent</span
        >
      </div>

      <!-- Min chars hint -->
      <div
        v-if="query && query.length < 3"
        class="px-3 py-4 text-[11px] text-muted-foreground text-center"
      >
        Type at least 3 characters…
      </div>

      <!-- Results list -->
      <div class="max-h-80 overflow-auto">
        <template v-if="query && query.length >= 3 && results.length === 0">
          <div class="px-3 py-6 text-[11px] text-muted-foreground text-center">
            No results for "{{ query }}"
          </div>
        </template>
        <template v-else>
          <button
            v-for="item in query && query.length >= 3 ? results : searchHistory"
            :key="item.id"
            class="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/[0.05] transition-colors group border-t border-white/[0.04] first:border-t-0"
            @click="$emit('select', item)"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <div
                class="h-6 w-6 rounded flex items-center justify-center bg-white/[0.04] text-muted-foreground shrink-0"
              >
                <component :is="iconFor(item.type)" class="h-3.5 w-3.5" />
              </div>
              <div class="min-w-0">
                <div class="text-xs text-foreground/90 truncate">
                  {{ item.displayName }}
                </div>
                <div class="text-[10px] text-muted-foreground truncate mt-0.5">
                  {{ item.details?.postcode || item.details?.region || "" }}
                </div>
              </div>
            </div>
            <span
              class="text-[9px] font-mono text-muted-foreground/50 ml-2 shrink-0 group-hover:text-muted-foreground/80 transition-colors"
            >
              {{ item.provider.toUpperCase() }}
            </span>
          </button>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Building, Clock, Home, MapPin, Star } from "lucide-vue-next";
import type { SearchResult } from "~/composables/useSearch";

const { results, isLoading, searchHistory, query } = defineProps<{
  results: SearchResult[];
  isLoading: boolean;
  searchHistory: SearchResult[];
  query: string;
}>();

defineEmits<{ (e: "select", item: SearchResult): void }>();

const iconFor = (type: SearchResult["type"]) => {
  switch (type) {
    case "city":
      return MapPin;
    case "building":
      return Building;
    case "address":
      return Home;
    default:
      return Star;
  }
};
</script>
