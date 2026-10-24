import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { OSMUser } from '~/composables/useAuth'

// UseAuth runs its session check in onMounted. Outside a component, capture the hook and run it by hand.
const mounted = vi.hoisted(() => ({ hooks: [] as (() => Promise<void> | void)[] }))
vi.mock('vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue')>()),
  onMounted: (hook: () => Promise<void> | void) => {
    mounted.hooks.push(hook)
  }
}))

const { useAuth } = await import('~/composables/useAuth')

const alice: OSMUser = { changesets: 3, displayName: 'Alice', id: 1, joinDate: '2020-01-01', username: 'alice' }

const stubWindow = (search = '') => {
  const win = {
    history: { replaceState: vi.fn() },
    location: { href: '', pathname: '/map', search }
  }
  vi.stubGlobal('window', win)
  return win
}

const mount = async () => {
  const auth = useAuth()
  const hook = mounted.hooks.pop()
  if (!hook) throw new Error('onMounted hook not registered')
  await hook()
  return auth
}

describe('useAuth', () => {
  beforeEach(() => {
    mounted.hooks.length = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('starts loading and signed out', () => {
    stubWindow()
    vi.stubGlobal('$fetch', vi.fn())
    const auth = useAuth()
    expect(auth.isLoading.value).toBe(true)
    expect(auth.user.value).toBeNull()
    expect(auth.isAuthenticated.value).toBe(false)
  })

  it('loads the signed-in user from /api/auth/me', async () => {
    const win = stubWindow()
    const fetchMock = vi.fn().mockResolvedValue({ user: alice })
    vi.stubGlobal('$fetch', fetchMock)

    const auth = await mount()

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/auth/me')
    expect(auth.user.value).toEqual(alice)
    expect(auth.isAuthenticated.value).toBe(true)
    expect(auth.isLoading.value).toBe(false)
    expect(win.history.replaceState).not.toHaveBeenCalled()
  })

  it('stays signed out when there is no session', async () => {
    stubWindow()
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ user: null }))
    const auth = await mount()
    expect(auth.isAuthenticated.value).toBe(false)
    expect(auth.isLoading.value).toBe(false)
  })

  it('stops loading when the session check fails', async () => {
    stubWindow()
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const auth = await mount()
    expect(auth.user.value).toBeNull()
    expect(auth.isLoading.value).toBe(false)
    expect(console.error).toHaveBeenCalledWith('Failed to fetch user:', expect.any(Error))
  })

  it('reloads the user after the OAuth redirect and cleans the URL', async () => {
    const win = stubWindow('?auth=success')
    const fetchMock = vi.fn().mockResolvedValueOnce({ user: null }).mockResolvedValueOnce({ user: alice })
    vi.stubGlobal('$fetch', fetchMock)

    const auth = await mount()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(auth.user.value).toEqual(alice)
    expect(win.history.replaceState).toHaveBeenCalledWith({}, '', '/map')
  })

  it('still cleans the URL when the reload after OAuth fails or returns no user', async () => {
    const win = stubWindow('?auth=success')
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValueOnce({ user: alice }).mockRejectedValueOnce(new Error('boom')))
    const auth = await mount()
    expect(auth.user.value).toEqual(alice)
    expect(console.error).toHaveBeenCalledWith('Failed to fetch user after auth:', expect.any(Error))
    expect(win.history.replaceState).toHaveBeenCalledOnce()

    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ user: null }))
    const second = await mount()
    expect(second.user.value).toBeNull()
    expect(win.history.replaceState).toHaveBeenCalledTimes(2)
  })

  it('redirects to the OSM login on sign-in', () => {
    const win = stubWindow()
    vi.stubGlobal('$fetch', vi.fn())
    useAuth().signIn()
    expect(win.location.href).toBe('/api/auth/osm-login')
  })

  it('clears the user on sign-out and keeps it when sign-out fails', async () => {
    stubWindow()
    const fetchMock = vi.fn().mockResolvedValueOnce({ user: alice }).mockResolvedValueOnce({})
    vi.stubGlobal('$fetch', fetchMock)
    const auth = await mount()

    await auth.signOut()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/osm-logout', { method: 'POST' })
    expect(auth.user.value).toBeNull()

    auth.user.value = alice
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('500')))
    await auth.signOut()
    expect(auth.user.value).toEqual(alice)
    expect(console.error).toHaveBeenCalledWith('Failed to sign out:', expect.any(Error))
  })
})
