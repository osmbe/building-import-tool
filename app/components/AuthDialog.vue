<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[460px]">
      <DialogHeader>
        <DialogTitle class="text-base font-semibold">Sign in with OpenStreetMap</DialogTitle>
        <DialogDescription class="text-xs text-muted-foreground mt-1">
          Connect your OSM account so your imports are attributed to you.
        </DialogDescription>
      </DialogHeader>

      <div class="mt-3 grid grid-cols-[1fr_auto] gap-4 items-start">
        <!-- Benefits list -->
        <div class="space-y-3">
          <div v-for="item in benefits" :key="item.text" class="flex items-start gap-3">
            <div class="h-6 w-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              <component :is="item.icon" class="h-3 w-3 text-primary" />
            </div>
            <span class="text-xs text-foreground/80 leading-relaxed">{{ item.text }}</span>
          </div>
        </div>

        <!-- OSM brand mark -->
        <div class="h-20 w-20 rounded-lg bg-primary/8 border border-primary/15 flex flex-col items-center justify-center gap-1.5 shrink-0">
          <MapIcon class="h-9 w-9 text-primary/60" />
          <span class="text-[8px] font-mono text-primary/50 uppercase tracking-widest">OAuth 2.0</span>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 mt-5">
        <button
          class="px-3 py-1.5 text-xs font-medium text-muted-foreground border border-white/[0.08] rounded hover:bg-white/[0.04] transition-colors"
          @click="$emit('update:open', false)"
        >
          Cancel
        </button>
        <button
          :disabled="isLoading"
          class="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded hover:bg-primary/85 active:bg-primary/75 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          @click="handleSignIn"
        >
          <Loader2 v-if="isLoading" class="h-3.5 w-3.5 animate-spin" />
          <ExternalLink v-else class="h-3.5 w-3.5" />
          Continue with OSM
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ExternalLink, Loader2, Map as MapIcon, MapPin, Shield, Users } from 'lucide-vue-next'
import Dialog from '~/components/ui/dialog.vue'
import DialogContent from '~/components/ui/dialog-content.vue'
import DialogDescription from '~/components/ui/dialog-description.vue'
import DialogHeader from '~/components/ui/dialog-header.vue'
import DialogTitle from '~/components/ui/dialog-title.vue'

const { open, onSignIn, isLoading } = defineProps<{
  open: boolean
  onSignIn: () => Promise<void>
  isLoading: boolean
}>()

const benefits = [
  { icon: MapPin,  text: 'Your imports are attributed to your OSM account' },
  { icon: Users,   text: 'Track your contribution history and changesets' },
  { icon: Shield,  text: 'Edits go through JOSM, where you review before upload' },
]

function handleSignIn() {
  onSignIn?.()
}
</script>
