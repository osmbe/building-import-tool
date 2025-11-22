<template>
  <DropdownMenuLabel
    :class="cn('px-2 py-1.5 text-sm font-semibold', props.class)"
    v-bind="$attrs"
  >
    <slot />
  </DropdownMenuLabel>
</template>

<script setup lang="ts">
import { DropdownMenuLabel } from 'radix-vue'
import { cn } from '~/lib/utils'

const props = defineProps<{
  class?: string
}>()
</script>