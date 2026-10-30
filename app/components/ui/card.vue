<template>
  <div
    :class="
      cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)
    "
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { cn } from "~/lib/utils";

const { class: className } = defineProps<{
  class?: string;
}>();
</script>
