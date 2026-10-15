<template>
  <div v-if="isOpen && building" class="absolute right-4 top-16 w-[400px] animate-fade-up">
    <div class="glass-panel rounded-lg overflow-hidden">
      <!-- Header -->
      <div class="px-4 pt-4 pb-3 border-b border-white/[0.05]">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-sm font-semibold text-foreground">Building #{{ building.id }}</h2>
            <p class="text-[10px] text-muted-foreground mt-0.5">
              {{ building.properties.buildingType || '—' }}
              <span v-if="building.properties.levels" class="ml-2">· {{ building.properties.levels }} levels</span>
            </p>
          </div>
          <button class="text-muted-foreground hover:text-foreground transition-colors mt-1" @click="$emit('close')">
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <Tabs v-model="activeTab" class="w-full">
        <TabsList class="w-full rounded-none border-b border-white/[0.05] bg-transparent p-0 h-9">
          <TabsTrigger
            value="overview"
            class="flex-1 h-9 rounded-none text-[11px] font-medium data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_-1px_0_0_hsl(192_90%_46%)] data-[state=active]:bg-transparent text-muted-foreground hover:text-foreground/70 transition-colors"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="compare"
            class="flex-1 h-9 rounded-none text-[11px] font-medium data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_-1px_0_0_hsl(192_90%_46%)] data-[state=active]:bg-transparent text-muted-foreground hover:text-foreground/70 transition-colors"
          >
            Compare
          </TabsTrigger>
        </TabsList>

        <!-- Overview tab -->
        <TabsContent value="overview" class="p-4 mt-0">
          <div class="space-y-2 text-xs">
            <div class="flex gap-4">
              <span class="text-muted-foreground w-20 shrink-0 flex items-center gap-1.5"
                ><Building class="h-3 w-3" /> Type</span
              >
              <span class="text-foreground/80">{{ building.properties.buildingType || '—' }}</span>
            </div>
            <div class="flex gap-4">
              <span class="text-muted-foreground w-20 shrink-0 flex items-center gap-1.5"
                ><Ruler class="h-3 w-3" /> Height</span
              >
              <span class="text-foreground/80 font-mono">{{ building.properties.height ?? '—' }} m</span>
            </div>
            <div class="flex gap-4">
              <span class="text-muted-foreground w-20 shrink-0 flex items-center gap-1.5"
                ><Layers class="h-3 w-3" /> Levels</span
              >
              <span class="text-foreground/80 font-mono">{{ building.properties.levels ?? '—' }}</span>
            </div>
            <div class="flex gap-4">
              <span class="text-muted-foreground w-20 shrink-0 flex items-center gap-1.5"
                ><Calendar class="h-3 w-3" /> Source date</span
              >
              <span class="text-foreground/80 font-mono">{{ building.properties.sourceDate || '—' }}</span>
            </div>
          </div>
        </TabsContent>

        <!-- Compare tab -->
        <TabsContent value="compare" class="p-4 mt-0">
          <div class="space-y-4 text-xs">
            <div v-if="osmTagCount > 0">
              <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                OSM Tags ({{ osmTagCount }})
              </div>
              <div class="max-h-72 overflow-y-auto space-y-1 pr-1">
                <div
                  v-for="(value, key) in building.osmData?.tags"
                  :key="key"
                  class="flex gap-4 py-1 border-b border-white/[0.04] last:border-0"
                >
                  <span class="text-muted-foreground w-32 shrink-0 truncate font-mono" :title="String(key)">{{
                    key
                  }}</span>
                  <span class="text-foreground/80 break-words" :title="String(value)">{{ value || '—' }}</span>
                </div>
              </div>
            </div>

            <div v-if="hasAuthoritativeData">
              <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Authoritative Data
              </div>
              <div class="space-y-1.5">
                <div v-if="building.authoritativeData?.levels" class="flex gap-4">
                  <span class="text-muted-foreground w-20 shrink-0">Levels</span>
                  <span class="text-foreground/80 font-mono">{{ building.authoritativeData.levels }}</span>
                </div>
                <div v-if="building.authoritativeData?.height" class="flex gap-4">
                  <span class="text-muted-foreground w-20 shrink-0">Height</span>
                  <span class="text-foreground/80 font-mono">{{ building.authoritativeData.height }}</span>
                </div>
                <div v-if="building.authoritativeData?.buildingMaterial" class="flex gap-4">
                  <span class="text-muted-foreground w-20 shrink-0">Material</span>
                  <span class="text-foreground/80">{{ building.authoritativeData.buildingMaterial }}</span>
                </div>
                <div v-if="building.authoritativeData?.roofType" class="flex gap-4">
                  <span class="text-muted-foreground w-20 shrink-0">Roof</span>
                  <span class="text-foreground/80">{{ building.authoritativeData.roofType }}</span>
                </div>
              </div>
            </div>

            <div v-if="osmTagCount === 0 && !hasAuthoritativeData" class="text-muted-foreground text-center py-4">
              No comparison data available
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Building, Calendar, Layers, Ruler, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { BuildingData } from '~/composables/useBuildingData'
import Tabs from '~/components/ui/tabs.vue'
import TabsContent from '~/components/ui/tabs-content.vue'
import TabsList from '~/components/ui/tabs-list.vue'
import TabsTrigger from '~/components/ui/tabs-trigger.vue'

const { building, isOpen } = defineProps<{
  building: BuildingData | null
  isOpen: boolean
}>()
defineEmits<{ (e: 'close'): void }>()

const activeTab = ref('overview')

const osmTagCount = computed(() => {
  if (!building?.osmData?.tags) return 0
  return Object.keys(building.osmData.tags).length
})

const hasAuthoritativeData = computed(() => {
  const auth = building?.authoritativeData
  return auth?.levels || auth?.height || auth?.buildingMaterial || auth?.roofType
})
</script>
