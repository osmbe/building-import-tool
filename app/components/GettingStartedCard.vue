<template>
  <Transition name="gs-fade">
    <div
      v-if="visible"
      class="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[min(92vw,30rem)]"
    >
      <div class="glass-panel rounded-lg overflow-hidden">
        <div class="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-white/[0.05]">
          <div class="flex items-center gap-2">
            <Compass class="h-3.5 w-3.5 text-primary" />
            <h3 class="text-xs font-semibold text-foreground">Find buildings missing from OSM</h3>
          </div>
          <button
            class="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss getting started"
            @click="dismiss"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>

        <ol class="px-4 py-3 space-y-2">
          <li v-for="(step, i) in steps" :key="i" class="flex gap-2.5 text-[11px] text-foreground/80 leading-relaxed">
            <span class="h-4 w-4 mt-px shrink-0 rounded-full bg-primary/12 border border-primary/25 text-primary text-[9px] font-mono flex items-center justify-center">
              {{ i + 1 }}
            </span>
            <span>{{ step }}</span>
          </li>
        </ol>

        <div class="px-4 pb-3 flex items-center justify-between">
          <span class="text-[10px] text-muted-foreground">You need JOSM running to upload.</span>
          <button
            class="px-2.5 py-1 text-[11px] font-medium text-primary border border-primary/25 rounded hover:bg-primary/10 transition-colors"
            @click="dismiss"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { Compass, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'

// Hide once the user has real work on screen (parent passes candidate presence).
const { hasCandidates = false } = defineProps<{ hasCandidates?: boolean }>()

const STORAGE_KEY = 'be2osm:onboarded'
const dismissed = ref(false)

if (import.meta.client) {
  try {
    dismissed.value = localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // localStorage unavailable (private mode) — just show the card this session
  }
}

const visible = computed(() => !dismissed.value && !hasCandidates)

const steps = [
  'Pan to an area, then turn on a source dataset (GRB, KNW, PICC or Urbis) plus OSM Buildings.',
  'Zoom in to street level so the building layers load.',
  'Run "Get Difference" to list buildings present in the source but missing from OSM.',
  'Review the candidates, then open them in JOSM to check and upload.',
]

const dismiss = () => {
  dismissed.value = true
  if (import.meta.client) {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // ignore persistence failure
    }
  }
}
</script>

<style scoped>
.gs-fade-enter-active,
.gs-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.gs-fade-enter-from,
.gs-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px);
}
@media (prefers-reduced-motion: reduce) {
  .gs-fade-enter-active,
  .gs-fade-leave-active {
    transition: none;
  }
}
</style>
