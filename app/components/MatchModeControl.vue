<template>
  <div class="glass-panel rounded-lg overflow-hidden">
    <!-- Header -->
    <div
      class="flex items-center justify-between px-2.5 py-2 cursor-pointer select-none"
      :class="!collapsed ? 'border-b border-white/[0.05]' : ''"
      @click="collapsed = !collapsed"
    >
      <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Match Mode</div>
      <ChevronDown
        class="h-3 w-3 text-muted-foreground transition-transform duration-200"
        :class="collapsed ? '-rotate-90' : ''"
      />
    </div>

    <!-- Collapsible body -->
    <div v-show="!collapsed" class="p-2.5">
      <div class="grid grid-cols-3 gap-1 bg-white/[0.03] rounded p-0.5">
        <button
          class="flex items-center justify-center px-1 py-1.5 rounded text-[11px] font-medium transition-all duration-150 whitespace-nowrap"
          :class="
            matchMode === 'geometry'
              ? 'bg-primary/18 text-primary border border-primary/30'
              : 'text-muted-foreground hover:text-foreground/70'
          "
          @click="setMatchMode('geometry')"
        >
          Geometry
        </button>
        <button
          class="flex items-center justify-center px-1 py-1.5 rounded text-[11px] font-medium transition-all duration-150 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          :class="
            matchMode === 'source'
              ? 'bg-primary/18 text-primary border border-primary/30'
              : 'text-muted-foreground hover:text-foreground/70'
          "
          :disabled="!sourceSupportsTags"
          :title="sourceSupportsTags ? undefined : tagsUnavailableMessage"
          @click="setMatchMode('source')"
        >
          Source
        </button>
        <button
          class="flex items-center justify-center px-1 py-1.5 rounded text-[11px] font-medium transition-all duration-150 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          :class="
            matchMode === 'both'
              ? 'bg-primary/18 text-primary border border-primary/30'
              : 'text-muted-foreground hover:text-foreground/70'
          "
          :disabled="!sourceSupportsTags"
          :title="sourceSupportsTags ? undefined : tagsUnavailableMessage"
          @click="setMatchMode('both')"
        >
          Both
        </button>
      </div>
      <p class="text-[9px] text-muted-foreground mt-2 leading-relaxed">
        <template v-if="matchMode === 'geometry'">Spatial: unmatched buildings in view (GRB, PICC, or Urbis)</template>
        <template v-else-if="matchMode === 'source'">Missing source:geometry:oidn tag (GRB only)</template>
        <template v-else>Spatially unmatched AND missing source tag (GRB only)</template>
      </p>

      <p v-if="!sourceSupportsTags" class="text-[9px] text-amber-400/90 mt-1.5 leading-relaxed">
        {{ tagsUnavailableMessage }}
        <template v-if="matchMode !== 'geometry'">Using geometry matching instead.</template>
      </p>

      <div v-if="matchMode === 'geometry' || matchMode === 'both' || !sourceSupportsTags" class="mt-2.5 space-y-1.5">
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
        />
        <p class="text-[9px] text-muted-foreground leading-relaxed">
          Requires both footprints to overlap by at least this percentage.
        </p>
      </div>

      <!-- Issue #9: opt-in to live OSM data from Overpass (GRB only) -->
      <div class="mt-3 pt-2.5 border-t border-white/[0.05]">
        <label class="flex items-center justify-between gap-2 cursor-pointer select-none">
          <span class="flex items-center gap-1.5 text-[10px] text-foreground/80">
            <Radio class="h-3 w-3 text-primary/70" />
            Live OSM data
          </span>
          <input
            type="checkbox"
            class="accent-primary h-3 w-3"
            :checked="useOverpass"
            @change="setUseOverpass(($event.target as HTMLInputElement).checked)"
          />
        </label>
        <p class="text-[9px] text-muted-foreground/80 mt-1.5 leading-relaxed">
          Queries OpenStreetMap live for this view instead of our daily copy. Slower, but reflects edits from the last
          day. GRB only.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown, Radio } from 'lucide-vue-next'
import { ref } from 'vue'
import { useMatchMode } from '~/composables/useMatchMode'

withDefaults(defineProps<{ sourceSupportsTags?: boolean }>(), { sourceSupportsTags: true })

const tagsUnavailableMessage = 'Source and Both modes need GRB data (PICC, Urbis and KNW have no source tags in OSM).'

const { matchMode, geometryThreshold, useOverpass, setMatchMode, setGeometryThreshold, setUseOverpass } = useMatchMode()
const collapsed = ref(false)

const onThresholdInput = (event: Event) => {
  const target = event.target as HTMLInputElement | null
  if (!target) return

  const value = Number(target.value)
  if (Number.isNaN(value)) return

  setGeometryThreshold(value / 100)
}
</script>
