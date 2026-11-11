<template>
  <div v-if="clickedFeatures.length > 0" class="absolute top-16 right-4 z-50 w-80">
    <div class="glass-panel rounded-lg overflow-hidden">
      <template v-if="clickedFeatures.length > 0">
        <!-- Feature switcher pills (shown when multiple features) -->
        <div v-if="clickedFeatures.length > 1" class="flex items-center gap-1.5 px-3 pt-3 pb-1">
          <button
            v-for="(feat, idx) in clickedFeatures"
            :key="idx"
            class="feature-pill"
            :class="{
              'feature-pill--grb': feat.source === 'grb-buildings',
              'feature-pill--knw': feat.source === 'knw-structures',
              'feature-pill--picc': feat.source === 'picc-buildings',
              'feature-pill--urbis': feat.source === 'urbis-buildings',
              'feature-pill--osm': feat.source === 'osm-buildings',
              'feature-pill--active': idx === activeFeatureIndex
            }"
            @click="activeFeatureIndex = idx"
          >
            <span class="feature-pill__dot" />
            <span>{{ feat.source }}</span>
            <span class="opacity-50 font-mono">
              {{ feat.source === 'osm-buildings' ? feat.properties.osm_id : candidateDisplayId(feat as any) }}
            </span>
          </button>
          <!-- Close button -->
          <button
            class="ml-auto text-muted-foreground hover:text-foreground transition-colors shrink-0"
            @click="closeTooltip"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Active feature content -->
        <div class="p-4 max-h-[30vh] overflow-y-auto" :key="activeFeatureIndex">
          <UiInfoPanelGrbBuilding
            v-if="currentFeature?.source === 'grb-buildings'"
            :feature="currentFeature"
            :count="clickedFeatures.length"
            @close="closeTooltip"
          />
          <UiInfoPanelKnwStructure
            v-else-if="currentFeature?.source === 'knw-structures'"
            :feature="currentFeature"
            :count="clickedFeatures.length"
            @close="closeTooltip"
          />
          <UiInfoPanelPiccBuilding
            v-else-if="currentFeature?.source === 'picc-buildings'"
            :feature="currentFeature"
            :count="clickedFeatures.length"
            @close="closeTooltip"
          />
          <UiInfoPanelUrbisBuilding
            v-else-if="currentFeature?.source === 'urbis-buildings'"
            :feature="currentFeature"
            :count="clickedFeatures.length"
            @close="closeTooltip"
          />
          <UiInfoPanelOsmBuilding
            v-else-if="currentFeature?.source === 'osm-buildings'"
            :feature="currentFeature"
            :count="clickedFeatures.length"
            @close="closeTooltip"
          />
          <div v-else>
            <div class="flex items-start justify-between mb-3">
              <div>
                <div
                  class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest border px-1.5 py-0.5 rounded mb-1.5"
                >
                  <Building2 class="h-2.5 w-2.5" />{{ currentFeature?.source }}
                </div>
              </div>
              <button
                class="text-muted-foreground hover:text-foreground transition-colors ml-2 mt-1"
                @click="closeTooltip"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </div>
            <div class="space-y-1 text-xs">
              <div v-for="(value, key) in currentFeature?.properties" :key="key" class="flex gap-3">
                <span class="text-muted-foreground w-20 shrink-0 truncate">{{ key }}</span>
                <span class="text-foreground font-medium font-mono truncate">{{ value }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Footer hints -->
      <div v-if="clickedFeatures.length > 1" class="px-4 py-1.5 border-t border-white/[0.05]">
        <p class="text-[9px] text-muted-foreground text-center tracking-wide">
          {{ activeFeatureIndex + 1 }} / {{ clickedFeatures.length }} features
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MapState } from '~/components/InteractiveMap.vue'
import { X } from 'lucide-vue-next'
import UiInfoPanelOsmBuilding from '~/components/ui/info-panel/osm-building.vue'
import UiInfoPanelKnwStructure from '~/components/ui/info-panel/knw-structure.vue'
import UiInfoPanelPiccBuilding from '~/components/ui/info-panel/picc-building.vue'
import UiInfoPanelUrbisBuilding from '~/components/ui/info-panel/urbis-building.vue'
import UiInfoPanelGrbBuilding from '~/components/ui/info-panel/grb-building.vue'

const { mapState } = defineProps<{ mapState: MapState }>()

const activeFeatureIndex = ref(0)

const { clickedFeatures } = mapState

const currentFeature = computed(() => clickedFeatures.value[activeFeatureIndex.value] || clickedFeatures.value[0])

// Close tooltip function
const closeTooltip = () => {
  activeFeatureIndex.value = 0
  clickedFeatures.value = []
}
</script>
