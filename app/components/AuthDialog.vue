<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>Sign in with OpenStreetMap</DialogTitle>
        <DialogDescription>Connect your OSM account to save edits and access QA tools.</DialogDescription>
      </DialogHeader>

      <div class="grid grid-cols-2 gap-4">
        <div class="border rounded-lg p-4">
          <div class="flex items-center gap-2 mb-3">
            <MapPin class="h-4 w-4 text-primary" />
            <span>Save your map edits</span>
          </div>
          <div class="flex items-center gap-2 mb-3">
            <Users class="h-4 w-4 text-primary" />
            <span>Track your contribution history</span>
          </div>
          <div class="flex items-center gap-2">
            <Shield class="h-4 w-4 text-primary" />
            <span>Access quality assurance tools</span>
          </div>
        </div>
        <div class="border rounded-lg p-4 flex flex-col items-center justify-center bg-gradient-to-br from-orange-50 to-green-50 dark:from-orange-950 dark:to-green-950">
          <MapIcon class="h-20 w-20 text-orange-500 mb-3" />
          <div class="flex items-center gap-2 text-xs text-muted-foreground text-center">
            <Badge variant="secondary">Secure</Badge>
            <span>OAuth 2.0</span>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="$emit('update:open', false)">Cancel</Button>
        <Button :disabled="isLoading" @click="handleSignIn">
          <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
          Continue with OSM
          <ExternalLink class="ml-2 h-4 w-4" />
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import Button from '~/components/ui/button.vue'
import Dialog from '~/components/ui/dialog.vue'
import DialogContent from '~/components/ui/dialog-content.vue'
import DialogDescription from '~/components/ui/dialog-description.vue'
import DialogHeader from '~/components/ui/dialog-header.vue'
import DialogTitle from '~/components/ui/dialog-title.vue'
import Badge from '~/components/ui/badge.vue'
import { ExternalLink, Shield, Users, MapPin, Loader2, Map as MapIcon } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  onSignIn: () => Promise<void>
  isLoading: boolean
}>()

function handleSignIn() {
  props.onSignIn?.()
}
</script>
