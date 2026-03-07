<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <span class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">QA Operations</span>
      <span
        class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
        :class="issuesCount === 0
          ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20'
          : issuesCount < 3
            ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
            : 'bg-red-400/10 text-red-400 border border-red-400/20'"
      >
        {{ issuesCount }} issue{{ issuesCount !== 1 ? 's' : '' }}
      </span>
    </div>

    <div class="space-y-2">
      <div v-for="op in operations" :key="op.id" class="border border-white/[0.06] rounded-lg p-2.5 bg-white/[0.02]">
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2">
            <component :is="op.icon" class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="text-xs font-medium text-foreground/85">{{ op.title }}</span>
          </div>
          <span
            class="text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded"
            :class="categoryColor(op.category)"
          >
            {{ op.category }}
          </span>
        </div>
        <p class="text-[10px] text-muted-foreground mb-2 ml-5">{{ op.description }}</p>
        <div class="flex items-center gap-2 ml-5">
          <div class="flex-1 h-1 bg-white/[0.05] rounded-full overflow-hidden">
            <div class="h-full bg-primary/70 rounded-full transition-all duration-500" :style="{ width: op.progress + '%' }"></div>
          </div>
          <button
            class="px-2 py-1 text-[10px] font-medium bg-primary/15 text-primary border border-primary/25 rounded hover:bg-primary/25 transition-colors"
            @click="runOperation(op)"
          >
            Run
          </button>
        </div>
      </div>
    </div>

    <Dialog v-model:open="openSummary">
      <DialogContent class="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle class="text-sm font-semibold">Operation Result</DialogTitle>
          <DialogDescription class="text-xs text-muted-foreground">Summary for the last QA operation</DialogDescription>
        </DialogHeader>
        <div class="text-xs space-y-2 mt-2">
          <div class="flex gap-3">
            <span class="text-muted-foreground w-20 shrink-0">Operation</span>
            <span class="text-foreground/80">{{ lastResult?.title }}</span>
          </div>
          <div class="flex gap-3">
            <span class="text-muted-foreground w-20 shrink-0">Status</span>
            <span class="text-emerald-400">{{ lastResult?.status }}</span>
          </div>
          <div class="flex gap-3">
            <span class="text-muted-foreground w-20 shrink-0">Details</span>
            <span class="text-foreground/80">{{ lastResult?.details }}</span>
          </div>
        </div>
        <div class="flex justify-end mt-4">
          <button
            class="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/85 transition-colors"
            @click="openSummary = false"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { Circle, Square, Triangle } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { BuildingData } from '~/composables/useBuildingData'
import Dialog from '~/components/ui/dialog.vue'
import DialogContent from '~/components/ui/dialog-content.vue'
import DialogDescription from '~/components/ui/dialog-description.vue'
import DialogHeader from '~/components/ui/dialog-header.vue'
import DialogTitle from '~/components/ui/dialog-title.vue'

const { building } = defineProps<{ building: BuildingData }>()

type Category = 'simplify' | 'fix' | 'validate'
interface Operation { id: string; title: string; description: string; icon: any; category: Category; progress: number }

const operations = ref<Operation[]>([
  { id: 'op1', title: 'Simplify geometry',      description: 'Reduce node count while preserving shape.', icon: Square,   category: 'simplify',  progress: 0 },
  { id: 'op2', title: 'Fix self-intersections', description: 'Detect and fix invalid polygon rings.',    icon: Triangle, category: 'fix',       progress: 0 },
  { id: 'op3', title: 'Validate metadata',      description: 'Check height/levels consistency.',          icon: Circle,   category: 'validate',  progress: 0 },
])

const issuesCount = computed(() => building.properties.qaIssues?.length || 0)

function categoryColor(cat: Category) {
  switch (cat) {
    case 'simplify': return 'bg-sky-400/10 text-sky-400 border border-sky-400/20'
    case 'fix':      return 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
    case 'validate': return 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20'
    default:         return 'text-muted-foreground border border-white/10'
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
