<template>
  <header
    class="fixed top-0 left-0 right-0 z-50 h-12 glass-panel border-t-0 border-l-0 border-r-0 flex items-center px-4 gap-4"
  >
    <!-- Logo mark -->
    <div class="flex items-center gap-2.5 shrink-0">
      <div
        class="w-7 h-7 rounded bg-primary/10 border border-primary/25 flex items-center justify-center"
      >
        <Map class="h-3.5 w-3.5 text-primary" />
      </div>
      <div class="flex items-baseline gap-2">
        <span class="text-sm font-semibold tracking-tight text-foreground"
          >be2osm</span
        >
        <span
          class="text-[10px] text-muted-foreground font-mono hidden sm:block opacity-60"
          >· belgique → osm</span
        >
      </div>
    </div>

    <!-- Search -->
    <div class="flex-1 max-w-md">
      <SearchBar @select="onSelect" />
    </div>

    <!-- Auth -->
    <div class="flex items-center gap-2 shrink-0 ml-auto">
      <template v-if="isAuthenticated">
        <UserMenu :user="user!" @sign-out="signOut" />
      </template>
      <template v-else>
        <button
          @click="openAuth = true"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75 transition-colors"
        >
          <LogIn class="h-3.5 w-3.5" />
          Sign in with OSM
        </button>
      </template>
      <AuthDialog
        :open="openAuth"
        @update:open="(v: boolean) => (openAuth = v)"
        :on-sign-in="signIn"
        :is-loading="isLoading"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
import { LogIn, Map } from "lucide-vue-next";
import { ref } from "vue";
import AuthDialog from "~/components/AuthDialog.vue";
import SearchBar from "~/components/SearchBar.vue";
import UserMenu from "~/components/UserMenu.vue";
import { useAuth } from "~/composables/useAuth";

const emit = defineEmits<{ (e: "location-select", result: any): void }>();

const { user, isAuthenticated, signIn, signOut, isLoading } = useAuth();
const openAuth = ref(false);

function onSelect(result: any) {
  emit("location-select", result);
}
</script>
