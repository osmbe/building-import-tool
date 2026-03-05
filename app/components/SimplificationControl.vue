<template>
  <Card class="p-3 bg-slate-800 text-gray-100 shadow-xl border-slate-600">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-medium">Simplify Geometry</h3>
      <Button variant="ghost" size="icon" class="h-5 w-5 p-0" @click="$emit('close')">
        <X class="h-3 w-3" />
      </Button>
    </div>

    <div class="space-y-3">
      <div class="space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-400">Tolerance</span>
          <Badge variant="secondary" class="text-xs">{{ tolerance.toFixed(4) }}</Badge>
        </div>
        <Slider
          :model-value="[tolerance]"
          @update:model-value="(value) => handleToleranceChange(value[0])"
          :min="0.0001"
          :max="0.001"
          :step="0.0001"
          class="w-full"
        />
        <div class="flex justify-between text-xs text-gray-500">
          <span>Less</span>
          <span>More</span>
        </div>
      </div>

      <div class="text-xs text-gray-400 pt-2 border-t border-slate-600">
        <p class="mb-2">Adjust the slider to simplify building geometries:</p>
        <ul class="space-y-1 ml-2">
          <li>• <strong>Less:</strong> Keep original detail</li>
          <li>• <strong>More:</strong> Simplify to fewer points</li>
        </ul>
      </div>

      <div class="flex gap-2 pt-2 border-t border-slate-600">
        <Button
          variant="outline"
          size="sm"
          class="w-full text-xs h-7"
          @click="resetTolerance"
        >
          Reset
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="w-full text-xs h-7 bg-orange-500 hover:bg-orange-600 text-white border-orange-500"
          @click="applySimplification"
        >
          Apply
        </Button>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import Badge from '~/components/ui/badge.vue'
import Button from '~/components/ui/button.vue'
import Card from '~/components/ui/card.vue'
import Slider from '~/components/ui/slider.vue'
import { X } from 'lucide-vue-next'
import { ref } from 'vue'

const emit = defineEmits<{
  close: []
  apply: [tolerance: number]
}>()

// Default tolerance: 0.0001 degrees (~10 meters)
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