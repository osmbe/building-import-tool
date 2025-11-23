<template>
  <div class="absolute bottom-4 right-4 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border rounded-lg shadow-lg p-3">
    <div class="text-xs font-medium text-muted-foreground mb-2">Match Mode</div>
    <div class="flex gap-2">
      <Button
        :variant="matchMode === 'geometry' ? 'default' : 'outline'"
        size="sm"
        @click="setMatchMode('geometry')"
        class="flex-1"
      >
        <MapPin class="h-3.5 w-3.5 mr-1.5" />
        Geometry
      </Button>
      <Button
        :variant="matchMode === 'source' ? 'default' : 'outline'"
        size="sm"
        @click="setMatchMode('source')"
        class="flex-1"
      >
        <Tag class="h-3.5 w-3.5 mr-1.5" />
        Source Tag
      </Button>
    </div>
    <div class="text-xs text-muted-foreground mt-2 max-w-[250px]">
      <template v-if="matchMode === 'geometry'">
        Show all GRB buildings in view (spatial matching)
      </template>
      <template v-else>
        Show GRB buildings NOT yet in OSM (missing source:geometry:oidn)
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMatchMode } from '~/composables/useMatchMode'
import Button from '~/components/ui/button.vue'
import { MapPin, Tag } from 'lucide-vue-next'

const { matchMode, setMatchMode } = useMatchMode()
</script>
