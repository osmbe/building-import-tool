<template>
  <PopoverRoot v-bind="$attrs">
    <slot />
  </PopoverRoot>
</template>

<script setup lang="ts">
import { PopoverRoot } from 'radix-vue'
</script>