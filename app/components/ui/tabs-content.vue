<template>
  <TabsContent
    :class="cn('mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)"
    v-bind="$attrs"
  >
    <slot />
  </TabsContent>
</template>

<script setup lang="ts">
import { TabsContent } from 'radix-vue'
import { cn } from '~/lib/utils'

const { class: className } = defineProps<{
  class?: string
}>()
</script>