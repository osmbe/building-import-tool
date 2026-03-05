<template>
  <AvatarImage
    :class="cn('aspect-square h-full w-full', className)"
    v-bind="$attrs"
  />
</template>

<script setup lang="ts">
import { AvatarImage } from 'radix-vue'
import { cn } from '~/lib/utils'

const { class: className } = defineProps<{
  class?: string
}>()
</script>