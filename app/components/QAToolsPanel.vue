<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <div class="text-sm text-muted-foreground">QA Operations</div>
      <Badge :class="issueBadgeClass">{{ issuesCount }} issues</Badge>
    </div>

    <div class="grid gap-2">
      <div v-for="op in operations" :key="op.id" class="border rounded-md p-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <component :is="op.icon" class="h-4 w-4 text-muted-foreground" />
            <div class="font-medium text-sm">{{ op.title }}</div>
          </div>
          <Badge :class="categoryColor(op.category)">{{ op.category }}</Badge>
        </div>
        <p class="text-xs text-muted-foreground mt-1">{{ op.description }}</p>
        <div class="flex items-center gap-2 mt-2">
          <Progress :model-value="op.progress" class="h-2" />
          <Button size="sm" @click="runOperation(op)">Run</Button>
        </div>
      </div>
    </div>

    <Dialog v-model:open="openSummary">
      <DialogContent class="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Operation Summary</DialogTitle>
          <DialogDescription>Results for the last operation</DialogDescription>
        </DialogHeader>
        <div class="text-sm">
          <div class="mb-2"><span class="font-medium">Operation:</span> {{ lastResult?.title }}</div>
          <div class="mb-2"><span class="font-medium">Status:</span> {{ lastResult?.status }}</div>
          <div class="mb-2"><span class="font-medium">Details:</span> {{ lastResult?.details }}</div>
        </div>
        <div class="flex justify-end">
          <Button @click="openSummary=false">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { Circle, Square, Triangle } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import Badge from '~/components/ui/badge.vue'
import type { BuildingData } from '~/composables/useBuildingData'
import Button from '~/components/ui/button.vue'
import Dialog from '~/components/ui/dialog.vue'
import DialogContent from '~/components/ui/dialog-content.vue'
import DialogDescription from '~/components/ui/dialog-description.vue'
import DialogHeader from '~/components/ui/dialog-header.vue'
import DialogTitle from '~/components/ui/dialog-title.vue'
import Progress from '~/components/ui/progress.vue'

const { building } = defineProps<{ building: BuildingData }>()

type Category = 'simplify' | 'fix' | 'validate'
interface Operation { id: string; title: string; description: string; icon: any; category: Category; progress: number }

const operations = ref<Operation[]>([
  { id: 'op1', title: 'Simplify geometry', description: 'Reduce node count while preserving shape.', icon: Square, category: 'simplify', progress: 0 },
  { id: 'op2', title: 'Fix self-intersections', description: 'Detect and fix invalid rings.', icon: Triangle, category: 'fix', progress: 0 },
  { id: 'op3', title: 'Validate metadata', description: 'Check height/levels consistency.', icon: Circle, category: 'validate', progress: 0 },
])

const issuesCount = computed(() => building.properties.qaIssues?.length || 0)

const issueBadgeClass = computed(() => {
  if (issuesCount.value === 0) return 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
  if (issuesCount.value < 3) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
  return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
})

function categoryColor(cat: Category) {
  switch (cat) {
    case 'simplify': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
    case 'fix': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
    case 'validate': return 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
    default: return 'bg-muted text-muted-foreground'
  }
}

const openSummary = ref(false)
const lastResult = ref<{ title: string; status: string; details: string } | null>(null)

async function runOperation(op: Operation) {
  op.progress = 10
  await new Promise(r => { setTimeout(r, 300) })
  op.progress = 60
  await new Promise(r => { setTimeout(r, 300) })
  op.progress = 100
  lastResult.value = { title: op.title, status: 'success', details: 'Operation completed successfully.' }
  openSummary.value = true
}
</script>
