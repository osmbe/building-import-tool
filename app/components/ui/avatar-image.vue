<template>
  <AvatarImage
    :class="cn('aspect-square h-full w-full', props.class)"
    v-bind="$attrs"
  />
</template>

<script setup lang="ts">
import { AvatarImage } from 'radix-vue'
import { cn } from '~/lib/utils'

const props = defineProps<{
  class?: string
}>()
</script>