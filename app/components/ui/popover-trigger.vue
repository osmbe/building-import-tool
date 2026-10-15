<template>
  <PopoverTrigger v-bind="$attrs">
    <slot />
  </PopoverTrigger>
</template>

<script setup lang="ts">
import { PopoverTrigger } from 'radix-vue'
</script>
