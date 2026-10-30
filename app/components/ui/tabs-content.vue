<template>
  <TabsContent
    :class="
      cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        props.class,
      )
    "
    v-bind="forwarded"
  >
    <slot />
  </TabsContent>
</template>

<script setup lang="ts">
import { TabsContent, type TabsContentProps, useForwardProps } from "radix-vue";
import { computed } from "vue";
import { cn } from "~/lib/utils";

const props = defineProps<TabsContentProps & { class?: string }>();

const forwarded = useForwardProps(
  computed(() => {
    const { class: _class, ...delegated } = props;
    return delegated;
  }),
);
</script>
