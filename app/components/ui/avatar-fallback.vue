<template>
  <AvatarFallback
    :class="
      cn(
        'flex h-full w-full items-center justify-center rounded-full bg-muted',
        className,
      )
    "
    v-bind="$attrs"
  >
    <slot />
  </AvatarFallback>
</template>

<script setup lang="ts">
import { AvatarFallback } from "radix-vue";
import { cn } from "~/lib/utils";

const { class: className } = defineProps<{
  class?: string;
}>();
</script>
