<template>
  <DropdownMenuTrigger v-bind="$attrs">
    <slot />
  </DropdownMenuTrigger>
</template>

<script setup lang="ts">
import { DropdownMenuTrigger } from 'radix-vue'
</script>
