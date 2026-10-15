<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle class="text-base font-semibold">Set up JOSM</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground mt-1">
          Candidates open in JOSM, where you review and upload them. JOSM must be running with Remote Control enabled on
          this machine.
        </DialogDescription>
      </DialogHeader>

      <!-- Connection status -->
      <div
        class="mt-3 flex items-center justify-between rounded-md border border-white/[0.07] bg-white/[0.02] px-3 py-2"
      >
        <div class="flex items-center gap-2">
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :class="
              connected === true ? 'bg-emerald-400' : connected === false ? 'bg-red-400' : 'bg-muted-foreground/50'
            "
          ></span>
          <span class="text-xs text-foreground/80">
            {{
              connected === true ? 'JOSM connected' : connected === false ? 'JOSM not reachable' : 'Connection unknown'
            }}
          </span>
        </div>
        <button
          class="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-foreground/80 border border-white/[0.08] rounded hover:bg-white/[0.05] transition-colors disabled:opacity-50"
          :disabled="testing"
          @click="$emit('test')"
        >
          <Loader2 v-if="testing" class="h-3 w-3 animate-spin" />
          <RefreshCw v-else class="h-3 w-3" />
          Test connection
        </button>
      </div>

      <!-- Steps -->
      <ol class="mt-4 space-y-2">
        <li v-for="(step, i) in instructions" :key="i" class="flex gap-3 text-xs text-foreground/80 leading-relaxed">
          <span
            class="h-4 w-4 mt-0.5 shrink-0 rounded-full bg-primary/12 border border-primary/25 text-primary text-[9px] font-mono flex items-center justify-center"
          >
            {{ i + 1 }}
          </span>
          <span>{{ step }}</span>
        </li>
      </ol>

      <div class="flex items-center justify-between gap-2 mt-5">
        <a
          href="https://josm.openstreetmap.de/"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1.5 text-[11px] text-primary/80 hover:text-primary transition-colors"
        >
          <ExternalLink class="h-3 w-3" />
          Download JOSM
        </a>
        <button
          class="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/85 transition-colors"
          @click="$emit('update:open', false)"
        >
          Done
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ExternalLink, Loader2, RefreshCw } from 'lucide-vue-next'
import Dialog from '~/components/ui/dialog.vue'
import DialogContent from '~/components/ui/dialog-content.vue'
import DialogDescription from '~/components/ui/dialog-description.vue'
import DialogHeader from '~/components/ui/dialog-header.vue'
import DialogTitle from '~/components/ui/dialog-title.vue'

defineProps<{
  open: boolean
  connected: boolean | null
  testing: boolean
  instructions: string[]
}>()

defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'test'): void }>()
</script>
