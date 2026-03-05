<template>
  <div v-if="isOpen && building" class="absolute right-4 top-20 w-[420px]">
    <Card class="p-4 shadow-xl bg-slate-800 text-gray-100 border-slate-600">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-lg font-semibold">Building #{{ building.id }}</h2>
          <div class="text-xs text-gray-300 mt-1">
            {{ building.properties.buildingType || '—' }} • Levels: {{ building.properties.levels ?? '—' }}
          </div>
        </div>
        <Button variant="ghost" size="icon" @click="$emit('close')">
          <X class="h-4 w-4" />
        </Button>
      </div>

      <Tabs v-model="activeTab" class="mt-3">
        <TabsList class="grid grid-cols-3 bg-slate-700 text-gray-300">
          <TabsTrigger value="overview" class="data-[state=active]:bg-slate-600 data-[state=active]:text-white">Overview</TabsTrigger>
          <TabsTrigger value="compare" class="data-[state=active]:bg-slate-600 data-[state=active]:text-white">Compare</TabsTrigger>
          <TabsTrigger value="qa" class="data-[state=active]:bg-slate-600 data-[state=active]:text-white">QA</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" class="mt-3">
          <div class="space-y-2 text-sm">
            <div class="flex items-center gap-2"><Building class="h-4 w-4" /> Type: {{ building.properties.buildingType || '—' }}</div>
            <div class="flex items-center gap-2"><Ruler class="h-4 w-4" /> Height: {{ building.properties.height ?? '—' }} m</div>
            <div class="flex items-center gap-2"><Layers class="h-4 w-4" /> Levels: {{ building.properties.levels ?? '—' }}</div>
            <div class="flex items-center gap-2"><Calendar class="h-4 w-4" /> Source date: {{ building.properties.sourceDate || '—' }}</div>
          </div>
        </TabsContent>

        <TabsContent value="compare" class="mt-3">
          <div class="text-sm space-y-2">
            <div v-if="osmTagCount > 0">
              <div class="font-medium mb-2">OSM Tags ({{ osmTagCount }})</div>
              <div class="max-h-96 overflow-y-auto space-y-1">
                <div v-for="(value, key) in building.osmData.tags" :key="key" class="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 py-1 border-b border-slate-700/50">
                  <div class="text-gray-400 truncate" :title="String(key)">{{ key }}</div>
                  <div class="text-gray-100 break-words" :title="String(value)">{{ value || '—' }}</div>
                </div>
              </div>
            </div>

            <div v-if="hasAuthoritativeData">
              <div class="font-medium mt-4 mb-2">Authoritative</div>
              <div class="grid grid-cols-2 gap-x-3 gap-y-1">
                <template v-if="building.authoritativeData?.levels">
                  <div>Levels</div><div>{{ building.authoritativeData.levels }}</div>
                </template>
                <template v-if="building.authoritativeData?.height">
                  <div>Height</div><div>{{ building.authoritativeData.height }}</div>
                </template>
                <template v-if="building.authoritativeData?.buildingMaterial">
                  <div>Material</div><div>{{ building.authoritativeData.buildingMaterial }}</div>
                </template>
                <template v-if="building.authoritativeData?.roofType">
                  <div>Roof</div><div>{{ building.authoritativeData.roofType }}</div>
                </template>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="qa" class="mt-3">
          <QAToolsPanel :building="building" @operation-complete="$emit('operation-complete', $event)" />
        </TabsContent>
      </Tabs>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { Building, Calendar, Layers, Ruler, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { BuildingData } from '~/composables/useBuildingData'
import Button from '~/components/ui/button.vue'
import Card from '~/components/ui/card.vue'
import QAToolsPanel from '~/components/QAToolsPanel.vue'
import Tabs from '~/components/ui/tabs.vue'
import TabsContent from '~/components/ui/tabs-content.vue'
import TabsList from '~/components/ui/tabs-list.vue'
import TabsTrigger from '~/components/ui/tabs-trigger.vue'

const { building, isOpen } = defineProps<{
  building: BuildingData | null
  isOpen: boolean
}>()
defineEmits<{ (e: 'close'): void; (e: 'operation-complete', payload: any): void }>()

const activeTab = ref('overview')

// Count OSM tags
const osmTagCount = computed(() => {
  if (!building?.osmData?.tags) return 0
  return Object.keys(building.osmData.tags).length
})

// Check if authoritative data section has any data to display
const hasAuthoritativeData = computed(() => {
  const auth = building?.authoritativeData
  return auth?.levels || auth?.height || auth?.buildingMaterial || auth?.roofType
})
</script>
