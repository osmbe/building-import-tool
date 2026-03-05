<template>
  <header class="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <div class="container mx-auto px-4 h-16 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <Map class="h-5 w-5 text-orange-500" />
          <h1 class="text-xl font-semibold text-foreground">Buildings Mapping Tool</h1>
        </div>
      </div>

      <div class="flex-1 max-w-lg">
        <SearchBar @select="onSelect" />
      </div>

      <div class="flex items-center gap-3">
        <template v-if="isAuthenticated">
          <UserMenu :user="user!" @sign-out="signOut" />
        </template>
        <template v-else>
          <Button @click="openAuth = true" variant="outline" size="sm" class="bg-orange-500 text-white border-orange-500 hover:bg-orange-600">
            Sign in with OSM
          </Button>
        </template>

        <AuthDialog :open="openAuth" @update:open="(v:boolean)=>openAuth=v" :on-sign-in="signIn" :is-loading="isLoading" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Download, HelpCircle, History as HistoryIcon, Laptop, Layers, Map, Moon, Settings, Sun, User as UserIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import AuthDialog from '~/components/AuthDialog.vue'
import Button from '~/components/ui/button.vue'
import DropdownMenu from '~/components/ui/dropdown-menu.vue'
import DropdownMenuContent from '~/components/ui/dropdown-menu-content.vue'
import DropdownMenuItem from '~/components/ui/dropdown-menu-item.vue'
import DropdownMenuTrigger from '~/components/ui/dropdown-menu-trigger.vue'
import SearchBar from '~/components/SearchBar.vue'
import UserMenu from '~/components/UserMenu.vue'
import { useAuth } from '~/composables/useAuth'

const emit = defineEmits<{ (e: 'location-select', result: any): void }>()

const { user, isAuthenticated, signIn, signOut, isLoading } = useAuth()
const openAuth = ref(false)

function onSelect(result: any) {
  emit('location-select', result)
}

const isDark = computed(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))

function setTheme(mode: 'light'|'dark'|'system') {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (mode === 'system') {
    root.classList.remove('dark')
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark')
    }
  } else if (mode === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

// Set light theme by default on component mount
if (typeof document !== 'undefined') {
  document.documentElement.classList.remove('dark')
}
</script>
