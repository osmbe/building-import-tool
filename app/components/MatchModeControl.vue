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
      </div>
      <p class="text-[9px] text-muted-foreground mt-2 leading-relaxed">
        <template v-if="matchMode === 'geometry'">Spatial — all GRB buildings in view</template>
        <template v-else>Missing source:geometry:oidn tag</template>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown, MapPin, Tag } from 'lucide-vue-next'
import { ref } from 'vue'
import { useMatchMode } from '~/composables/useMatchMode'

const { matchMode, setMatchMode } = useMatchMode()
const collapsed = ref(false)
</script>
