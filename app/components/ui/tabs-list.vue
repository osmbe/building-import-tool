<template>
  <TabsList
    :class="cn('inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground', className)"
    v-bind="$attrs"
  >
    <slot />
  </TabsList>
</template>

<script setup lang="ts">
import { TabsList } from 'radix-vue'
import { cn } from '~/lib/utils'

const { class: className } = defineProps<{
  class?: string
}>()
</script>
