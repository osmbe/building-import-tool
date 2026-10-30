<template>
  <ProgressRoot
    :class="
      cn(
        'relative h-4 w-full overflow-hidden rounded-full bg-secondary',
        className,
      )
    "
    :model-value="modelValue"
    v-bind="$attrs"
  >
    <ProgressIndicator
      class="h-full w-full flex-1 bg-primary transition-all"
      :style="{ transform: `translateX(-${100 - (modelValue || 0)}%)` }"
    />
  </ProgressRoot>
</template>

<script setup lang="ts">
import { ProgressIndicator, ProgressRoot } from "radix-vue";
import { cn } from "~/lib/utils";

const { modelValue, class: className } = defineProps<{
  modelValue?: number;
  class?: string;
}>();
</script>
