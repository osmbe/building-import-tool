import { ref } from "vue";

export type ToastType = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
}

const toasts = ref<Toast[]>([]);
let nextId = 0;

function addToast(
  type: ToastType,
  title: string,
  message?: string,
  duration = 5000,
) {
  const id = nextId++;
  toasts.value.push({ duration, id, message, title, type });
}

function removeToast(id: number) {
  const idx = toasts.value.findIndex((t) => t.id === id);
  if (idx !== -1) toasts.value.splice(idx, 1);
}

export function useToast() {
  return {
    error: (title: string, message?: string, duration?: number) => {
      addToast("error", title, message, duration ?? 8000);
    },
    info: (title: string, message?: string, duration?: number) => {
      addToast("info", title, message, duration);
    },
    removeToast,
    success: (title: string, message?: string, duration?: number) => {
      addToast("success", title, message, duration);
    },
    toasts,
    warning: (title: string, message?: string, duration?: number) => {
      addToast("warning", title, message, duration);
    },
  };
}
