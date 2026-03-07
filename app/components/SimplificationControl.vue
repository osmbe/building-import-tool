<template>
  <div class="glass-panel rounded-lg p-3 animate-fade-up">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <SlidersHorizontal class="h-3.5 w-3.5 text-primary/70" />
        <h3 class="text-xs font-medium text-foreground">Simplify Geometry</h3>
      </div>
      <button class="text-muted-foreground hover:text-foreground transition-colors p-0.5" @click="$emit('close')">
        <X class="h-3.5 w-3.5" />
      </button>
    </div>

    <div class="space-y-4">
      <!-- Slider -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Tolerance</span>
          <span class="text-[11px] font-mono text-primary">{{ tolerance.toFixed(4) }}</span>
        </div>
        <Slider
          :model-value="[tolerance]"
          @update:model-value="(value) => handleToleranceChange(value[0])"
          :min="0.0001"
          :max="0.001"
          :step="0.0001"
          class="w-full"
        />
        <div class="flex justify-between text-[9px] text-muted-foreground mt-1.5">
          <span>Preserve detail</span>
          <span>Simplify more</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-1.5">
        <button
          class="flex-1 py-1.5 text-xs font-medium text-muted-foreground border border-white/[0.07] rounded hover:bg-white/[0.04] hover:text-foreground/80 transition-all"
          @click="resetTolerance"
        >
          Reset
        </button>
        <button
          class="flex-1 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded hover:bg-primary/85 active:bg-primary/75 transition-colors"
          @click="applySimplification"
        >
          Apply
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SlidersHorizontal, X } from 'lucide-vue-next'
import Slider from '~/components/ui/slider.vue'
import { ref } from 'vue'

const emit = defineEmits<{
  close: []
  apply: [tolerance: number]
}>()

const tolerance = ref(0.0001)
const DEFAULT_TOLERANCE = 0.0001

const handleToleranceChange = (value: number) => {
  tolerance.value = value
}

const resetTolerance = () => {
  tolerance.value = DEFAULT_TOLERANCE
}

const applySimplification = () => {
  emit('apply', tolerance.value)
}
</script>
