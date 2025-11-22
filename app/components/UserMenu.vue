<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="sm" class="gap-2">
        <Avatar class="h-6 w-6">
          <AvatarImage :src="user.avatar || '/placeholder-user.jpg'" alt="user avatar" />
          <AvatarFallback>{{ initials }}</AvatarFallback>
        </Avatar>
        <span class="hidden sm:inline">{{ user.displayName }}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-64">
      <DropdownMenuLabel>
        <div class="flex items-center gap-3">
          <Avatar class="h-10 w-10">
            <AvatarImage :src="user.avatar || '/placeholder-user.jpg'" />
            <AvatarFallback>{{ initials }}</AvatarFallback>
          </Avatar>
          <div>
            <p class="text-sm font-medium">{{ user.displayName }}</p>
            <p class="text-xs text-muted-foreground">@{{ user.username }}</p>
            <div class="flex items-center gap-2 mt-1">
              <Badge variant="secondary" class="text-xs">{{ user.changesets.toLocaleString() }} changesets</Badge>
            </div>
          </div>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem as-child>
        <a :href="`https://www.openstreetmap.org/user/${user.username}`" target="_blank" class="flex items-center cursor-pointer">
          <User class="mr-2 h-4 w-4" /> Profile
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem as-child>
        <a :href="`https://www.openstreetmap.org/user/${user.username}/history`" target="_blank" class="flex items-center cursor-pointer">
          <History class="mr-2 h-4 w-4" /> History
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem as-child>
        <a href="https://www.openstreetmap.org/preferences" target="_blank" class="flex items-center cursor-pointer">
          <Settings class="mr-2 h-4 w-4" /> Preferences
        </a>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @click="$emit('sign-out')">
        <LogOut class="mr-2 h-4 w-4" /> Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Button from '~/components/ui/button.vue'
import DropdownMenu from '~/components/ui/dropdown-menu.vue'
import DropdownMenuContent from '~/components/ui/dropdown-menu-content.vue'
import DropdownMenuItem from '~/components/ui/dropdown-menu-item.vue'
import DropdownMenuLabel from '~/components/ui/dropdown-menu-label.vue'
import DropdownMenuSeparator from '~/components/ui/dropdown-menu-separator.vue'
import DropdownMenuTrigger from '~/components/ui/dropdown-menu-trigger.vue'
import Avatar from '~/components/ui/avatar.vue'
import AvatarFallback from '~/components/ui/avatar-fallback.vue'  
import AvatarImage from '~/components/ui/avatar-image.vue'
import Badge from '~/components/ui/badge.vue'
import { User, History, Settings, LogOut } from 'lucide-vue-next'
import type { OSMUser } from '~/composables/useAuth'

const props = defineProps<{ user: OSMUser }>()

const initials = computed(() => {
  const n = props.user.displayName || props.user.username
  return n.split(' ').map(p => p[0]).slice(0,2).join('').toUpperCase()
})
</script>
