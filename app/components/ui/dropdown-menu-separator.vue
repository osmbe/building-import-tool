<template>
  <DropdownMenuSeparator :class="cn('-mx-1 my-1 h-px bg-muted', props.class)" />
</template>

<script setup lang="ts">
import { DropdownMenuSeparator } from 'radix-vue'
import { cn } from '~/lib/utils'

const props = defineProps<{
  class?: string
}>()
</script>