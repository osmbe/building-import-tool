<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from 'lucide-vue-next'
import { useToast, type ToastType } from '~/composables/useToast'

const { toasts, removeToast } = useToast()

const timers = new Map<number, ReturnType<typeof setTimeout>>()

function startTimer(id: number, duration: number) {
  if (timers.has(id)) return
  timers.set(id, setTimeout(() => {
    removeToast(id)
    timers.delete(id)
  }, duration))
}

function dismiss(id: number) {
  const timer = timers.get(id)
  if (timer) { clearTimeout(timer); timers.delete(id) }
  removeToast(id)
}

onBeforeUnmount(() => {
  timers.forEach(t => clearTimeout(t))
  timers.clear()
})

const icons: Record<ToastType, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
}

const accentColor: Record<ToastType, string> = {
  info:    'hsl(192 90% 46%)',
  success: 'hsl(152 68% 56%)',
  warning: 'hsl(38 92% 55%)',
  error:   'hsl(0 68% 56%)',
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :ref="() => startTimer(toast.id, toast.duration)"
          class="toast-item glass-panel"
          :style="{ '--accent': accentColor[toast.type] }"
          @click="dismiss(toast.id)"
        >
          <!-- Accent bar -->
          <span class="toast-accent" />

          <!-- Icon -->
          <component
            :is="icons[toast.type]"
            class="toast-icon"
            :size="18"
            :stroke-width="2"
          />

          <!-- Text -->
          <div class="toast-body">
            <p class="toast-title">{{ toast.title }}</p>
            <p v-if="toast.message" class="toast-message">{{ toast.message }}</p>
          </div>

          <!-- Close -->
          <button class="toast-close" @click.stop="dismiss(toast.id)">
            <X :size="14" />
          </button>

          <!-- Progress bar -->
          <span
            class="toast-progress"
            :style="{ animationDuration: toast.duration + 'ms' }"
          />
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: 1.25rem;
  right: 1.25rem;
  z-index: 9999;
  display: flex;
  flex-direction: column-reverse;
  gap: 0.5rem;
  max-width: 26rem;
  pointer-events: none;
}

.toast-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.75rem 0.875rem 0.75rem 1.125rem;
  border-radius: 0.375rem;
  overflow: hidden;
  cursor: pointer;
  pointer-events: auto;
  min-width: 20rem;
}

.toast-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}

.toast-icon {
  flex-shrink: 0;
  color: var(--accent);
  margin-top: 1px;
}

.toast-body {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: hsl(208 18% 88%);
  line-height: 1.35;
}

.toast-message {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: hsl(216 12% 52%);
  line-height: 1.45;
  white-space: pre-line;
}

.toast-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 0.25rem;
  color: hsl(216 12% 40%);
  transition: background 0.12s, color 0.12s;
}
.toast-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: hsl(210 18% 80%);
}

/* Progress bar */
.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: 100%;
  background: var(--accent);
  opacity: 0.35;
  transform-origin: left;
  animation: shrink linear forwards;
}
@keyframes shrink {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

/* Transition group */
.toast-enter-active {
  animation: toast-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.toast-leave-active {
  animation: toast-out 0.2s ease forwards;
}
.toast-move {
  transition: transform 0.25s ease;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(1.5rem) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}
@keyframes toast-out {
  to {
    opacity: 0;
    transform: translateX(1rem) scale(0.95);
  }
}
</style>
