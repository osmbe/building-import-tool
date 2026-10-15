<template>
  <AvatarImage :class="cn('aspect-square h-full w-full', props.class)" v-bind="forwarded" />
</template>

<script setup lang="ts">
import { AvatarImage, type AvatarImageProps, useForwardProps } from 'radix-vue'
import { computed } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<AvatarImageProps & { class?: string }>()

const forwarded = useForwardProps(
  computed(() => {
    const { class: _class, ...delegated } = props
    return delegated
  })
)
</script>
