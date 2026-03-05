<template>
  <div :class="cn('flex flex-col space-y-1.5 text-center sm:text-left', className)">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { cn } from '~/lib/utils'

const { class: className } = defineProps<{
  class?: string
}>()
</script>