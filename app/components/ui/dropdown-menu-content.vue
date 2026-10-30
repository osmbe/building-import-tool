<template>
  <DropdownMenuPortal>
    <DropdownMenuContent
      :class="
        cn(
          'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
          className,
        )
      "
      :align="align"
      :side-offset="sideOffset"
      v-bind="$attrs"
    >
      <slot />
    </DropdownMenuContent>
  </DropdownMenuPortal>
</template>

<script setup lang="ts">
import { DropdownMenuContent, DropdownMenuPortal } from "radix-vue";
import { cn } from "~/lib/utils";

const {
  class: className,
  align,
  sideOffset,
} = defineProps<{
  class?: string;
  align?: "start" | "center" | "end";
  sideOffset?: number;
}>();
</script>
