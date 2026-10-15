import { computed, onMounted, ref } from 'vue'

export interface OSMUser {
  id: number
  username: string
  displayName: string
  avatar?: string | null
  changesets: number
  joinDate: string
}

export function useAuth() {
  const user = ref<OSMUser | null>(null)
  const isLoading = ref(true)

  onMounted(async () => {
    // Check if user is authenticated via cookie
    try {
      const response = await $fetch<{ user: OSMUser | null }>('/api/auth/me')
      if (response.user) {
        user.value = response.user
      }
    } catch (error) {
      console.error('Failed to fetch user:', error)
    } finally {
      isLoading.value = false
    }

    // Check for auth success redirect
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('auth') === 'success') {
      // Reload user data after successful auth
      try {
        const response = await $fetch<{ user: OSMUser | null }>('/api/auth/me')
        if (response.user) {
          user.value = response.user
        }
      } catch (error) {
        console.error('Failed to fetch user after auth:', error)
      }
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  })

  function signIn(): void {
    // Redirect to OSM OAuth flow
    window.location.href = '/api/auth/osm-login'
  }

  async function signOut() {
    try {
      await $fetch('/api/auth/osm-logout', { method: 'POST' })
      user.value = null
    } catch (error) {
      console.error('Failed to sign out:', error)
    }
  }

  return {
    user,
    isLoading,
    isAuthenticated: computed(() => Boolean(user.value)),
    signIn,
    signOut
  }
}
