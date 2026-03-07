<template>
  <div class="glass-panel rounded-lg p-2.5">
    <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Match Mode</div>
    <div class="flex gap-1 bg-white/[0.03] rounded p-0.5">
      <button
        class="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium transition-all duration-150 whitespace-nowrap"
        :class="matchMode === 'geometry'
          ? 'bg-primary/18 text-primary border border-primary/30'
          : 'text-muted-foreground hover:text-foreground/70'"
        @click="setMatchMode('geometry')"
      >
        <MapPin class="h-3 w-3 shrink-0" />
        Geometry
      </button>
      <button
        class="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium transition-all duration-150 whitespace-nowrap"
        :class="matchMode === 'source'
          ? 'bg-primary/18 text-primary border border-primary/30'
          : 'text-muted-foreground hover:text-foreground/70'"
        @click="setMatchMode('source')"
      >
        <Tag class="h-3 w-3 shrink-0" />
        Source Tag
      </button>
    </div>
    <p class="text-[9px] text-muted-foreground mt-2 leading-relaxed">
      <template v-if="matchMode === 'geometry'">Spatial — all GRB buildings in view</template>
      <template v-else>Missing source:geometry:oidn tag</template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { MapPin, Tag } from 'lucide-vue-next'
import { useMatchMode } from '~/composables/useMatchMode'

const { matchMode, setMatchMode } = useMatchMode()
</script>
