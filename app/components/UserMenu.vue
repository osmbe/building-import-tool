<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        class="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/[0.06] transition-colors"
      >
        <Avatar class="h-6 w-6">
          <AvatarImage
            :src="user.avatar || '/placeholder-user.jpg'"
            alt="avatar"
          />
          <AvatarFallback
            class="text-[10px] bg-primary/15 text-primary border border-primary/25"
            >{{ initials }}</AvatarFallback
          >
        </Avatar>
        <span class="hidden sm:block text-xs text-foreground/80">{{
          user.displayName
        }}</span>
      </button>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="end" class="w-60">
      <!-- User info header -->
      <DropdownMenuLabel class="py-3">
        <div class="flex items-center gap-3">
          <Avatar class="h-9 w-9">
            <AvatarImage :src="user.avatar || '/placeholder-user.jpg'" />
            <AvatarFallback
              class="text-xs bg-primary/15 text-primary border border-primary/25"
              >{{ initials }}</AvatarFallback
            >
          </Avatar>
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">{{ user.displayName }}</p>
            <p class="text-[11px] text-muted-foreground">
              @{{ user.username }}
            </p>
            <p class="text-[10px] font-mono text-muted-foreground/70 mt-0.5">
              {{ user.changesets.toLocaleString() }} changesets
            </p>
          </div>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />

      <DropdownMenuItem as-child>
        <a
          :href="`https://www.openstreetmap.org/user/${user.username}`"
          target="_blank"
          class="flex items-center cursor-pointer text-xs"
        >
          <User class="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> Profile
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem as-child>
        <a
          :href="`https://www.openstreetmap.org/user/${user.username}/history`"
          target="_blank"
          class="flex items-center cursor-pointer text-xs"
        >
          <History class="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> Changeset
          history
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem as-child>
        <a
          href="https://www.openstreetmap.org/preferences"
          target="_blank"
          class="flex items-center cursor-pointer text-xs"
        >
          <Settings class="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> OSM
          preferences
        </a>
      </DropdownMenuItem>

      <DropdownMenuSeparator />
      <DropdownMenuItem
        class="text-destructive focus:text-destructive text-xs"
        @click="$emit('sign-out')"
      >
        <LogOut class="mr-2.5 h-3.5 w-3.5" /> Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { History, LogOut, Settings, User } from "lucide-vue-next";
import Avatar from "~/components/ui/avatar.vue";
import AvatarFallback from "~/components/ui/avatar-fallback.vue";
import AvatarImage from "~/components/ui/avatar-image.vue";
import DropdownMenu from "~/components/ui/dropdown-menu.vue";
import DropdownMenuContent from "~/components/ui/dropdown-menu-content.vue";
import DropdownMenuItem from "~/components/ui/dropdown-menu-item.vue";
import DropdownMenuLabel from "~/components/ui/dropdown-menu-label.vue";
import DropdownMenuSeparator from "~/components/ui/dropdown-menu-separator.vue";
import DropdownMenuTrigger from "~/components/ui/dropdown-menu-trigger.vue";
import type { OSMUser } from "~/composables/useAuth";
import { computed } from "vue";

const { user } = defineProps<{ user: OSMUser }>();
defineEmits<{ (e: "sign-out"): void }>();

const initials = computed(() => {
  const n = user.displayName || user.username;
  return n
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
});
</script>
