<template>
  <div class="glass-panel rounded-lg overflow-hidden">
    <!-- Header -->
    <div
      class="flex items-center justify-between px-2.5 py-2 cursor-pointer select-none"
      :class="!collapsed ? 'border-b border-white/[0.05]' : ''"
      @click="collapsed = !collapsed"
    >
      <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Match Mode</div>
      <ChevronDown class="h-3 w-3 text-muted-foreground transition-transform duration-200" :class="collapsed ? '-rotate-90' : ''" />
    </div>

    <!-- Collapsible body -->
    <div v-show="!collapsed" class="p-2.5">
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
        <button
          class="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium transition-all duration-150 whitespace-nowrap"
          :class="matchMode === 'both'
            ? 'bg-primary/18 text-primary border border-primary/30'
            : 'text-muted-foreground hover:text-foreground/70'"
          @click="setMatchMode('both')"
        >
          <Layers class="h-3 w-3 shrink-0" />
          Both
        </button>
      </div>
      <p class="text-[9px] text-muted-foreground mt-2 leading-relaxed">
        <template v-if="matchMode === 'geometry'">Spatial — unmatched buildings in view (GRB, PICC, or Urbis)</template>
        <template v-else-if="matchMode === 'source'">Missing source:geometry:oidn tag (GRB only)</template>
        <template v-else>Spatially unmatched AND missing source tag (GRB only)</template>
      </p>

      <div v-if="matchMode === 'geometry' || matchMode === 'both'" class="mt-2.5 space-y-1.5">
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-muted-foreground">Match strictness</span>
          <span class="font-mono text-foreground/70">{{ Math.round(geometryThreshold * 100) }}%</span>
        </div>
        <input
          type="range"
          min="30"
          max="95"
          step="5"
          class="w-full accent-primary"
          :value="Math.round(geometryThreshold * 100)"
          @input="onThresholdInput"
        >
        <p class="text-[9px] text-muted-foreground leading-relaxed">
          Requires both footprints to overlap by at least this percentage.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown, Layers, MapPin, Tag } from 'lucide-vue-next'
import { ref } from 'vue'
import { useMatchMode } from '~/composables/useMatchMode'

const { matchMode, geometryThreshold, setMatchMode, setGeometryThreshold } = useMatchMode()
const collapsed = ref(false)

const onThresholdInput = (event: Event) => {
  const target = event.target as HTMLInputElement | null
  if (!target) return

  const value = Number(target.value)
  if (Number.isNaN(value)) return

  setGeometryThreshold(value / 100)
}
</script>
