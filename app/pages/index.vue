<template>
  <div class="h-screen w-full overflow-hidden">
    <Navigation @location-select="onLocationSelect" />
    <main class="pt-16" style="height: calc(100vh - 4rem);">
      <InteractiveMap :selected-location="selectedLocation" />
    </main>
  </div>
</template>

<script setup lang="ts">
import InteractiveMap from '~/components/InteractiveMap.vue'
import Navigation from '~/components/Navigation.vue'
import type { SearchResult } from '~/composables/useSearch'
import { ref } from 'vue'

const selectedLocation = ref<SearchResult | null>(null)

function onLocationSelect(result: SearchResult) {
  selectedLocation.value = result
}
</script>
