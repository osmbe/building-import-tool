<template>
  <div class="h-screen w-full overflow-hidden">
    <Navigation @location-select="onLocationSelect" />
    <main class="pt-16" style="height: calc(100vh - 4rem);">
      <InteractiveMap :selected-location="selectedLocation" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Navigation from '~/components/Navigation.vue'
import InteractiveMap from '~/components/InteractiveMap.vue'
import type { SearchResult } from '~/composables/useSearch'

const selectedLocation = ref<SearchResult | null>(null)

function onLocationSelect(result: SearchResult) {
  selectedLocation.value = result
}
</script>
