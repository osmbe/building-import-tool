import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { asHandler, createEvent, expectHttpError, stubNitro } from './nitro'

beforeEach(() => {
  stubNitro()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/auth/me', () => {
  const load = async () => asHandler(await import('~/server/api/auth/me.get'))

  it('returns no user without the cookie', async () => {
    expect(await (await load())(createEvent())).toEqual({ user: null })
  })

  it('returns the user stored in the cookie', async () => {
    const event = createEvent({ cookies: { osm_user: JSON.stringify({ id: 1, username: 'mapper' }) } })
    expect(await (await load())(event)).toEqual({ user: { id: 1, username: 'mapper' } })
  })

  it('returns no user when the cookie is not valid JSON', async () => {
    expect(await (await load())(createEvent({ cookies: { osm_user: '{nope' } }))).toEqual({ user: null })
  })
})

describe('GET /api/auth/osm-login', () => {
  const load = async () => asHandler(await import('~/server/api/auth/osm-login.get'))

  it('stores a CSRF state cookie and redirects to the OSM authorize URL', async () => {
    const event = createEvent()
    await (
      await load()
    )(event)

    const state = event.setCookies.oauth_state
    expect(state?.value).toMatch(/^[a-z0-9]+$/)
    expect(state?.opts).toMatchObject({ httpOnly: true, secure: false, sameSite: 'lax', path: '/', maxAge: 600 })

    const url = new URL(event.redirect ?? '')
    expect(url.origin + url.pathname).toBe('https://www.openstreetmap.org/oauth2/authorize')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client-id',
      redirect_uri: 'https://be2osm.test/api/auth/osm-callback',
      response_type: 'code',
      scope: 'read_prefs',
      state: state?.value
    })
  })

  it('marks the state cookie secure in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const event = createEvent()
    await (
      await load()
    )(event)
    expect(event.setCookies.oauth_state?.opts.secure).toBe(true)
  })
})

describe('POST /api/auth/osm-logout', () => {
  it('deletes both auth cookies', async () => {
    const handler = asHandler(await import('~/server/api/auth/osm-logout.post'))
    const event = createEvent()
    expect(await handler(event)).toEqual({ success: true })
    expect(event.deletedCookies).toEqual(['osm_token', 'osm_user'])
  })
})

describe('GET /api/auth/osm-callback', () => {
  const load = async () => asHandler(await import('~/server/api/auth/osm-callback.get'))
  const callbackEvent = (query: Record<string, string>, storedState = 'abc') =>
    createEvent({ query, cookies: { oauth_state: storedState } })

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('rejects a state that does not match the cookie (CSRF)', async () => {
    const error = await expectHttpError((await load())(callbackEvent({ code: 'c', state: 'other' })))
    expect(error.statusCode).toBe(400)
  })

  it('rejects a missing state', async () => {
    const error = await expectHttpError((await load())(callbackEvent({ code: 'c' })))
    expect(error.statusCode).toBe(400)
  })

  it('rejects a missing code after clearing the state cookie', async () => {
    const event = callbackEvent({ state: 'abc' })
    const error = await expectHttpError((await load())(event))
    expect(error.statusCode).toBe(400)
    expect(error.message).toBe('No authorization code received')
    expect(event.deletedCookies).toEqual(['oauth_state'])
  })

  it('exchanges the code, stores the token and user cookies and redirects', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ access_token: 'tok' })
      .mockResolvedValueOnce({
        user: {
          id: 42,
          display_name: 'mapper',
          img: { href: 'https://img/avatar.png' },
          changesets: { count: 12 },
          account_created: '2020-01-01T00:00:00Z'
        }
      })
    vi.stubGlobal('$fetch', fetchMock)

    const event = callbackEvent({ code: 'the-code', state: 'abc' })
    expect(await (await load())(event)).toBe('/?auth=success')

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [string, { method: string; body: string }]
    expect(tokenUrl).toBe('https://www.openstreetmap.org/oauth2/token')
    expect(tokenInit.method).toBe('POST')
    expect(Object.fromEntries(new URLSearchParams(tokenInit.body))).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      client_id: 'client-id',
      client_secret: 'secret',
      redirect_uri: 'https://be2osm.test/api/auth/osm-callback'
    })
    const [, userInit] = fetchMock.mock.calls[1] as [string, { headers: Record<string, string> }]
    expect(userInit.headers.Authorization).toBe('Bearer tok')

    expect(event.setCookies.osm_token?.value).toBe('tok')
    expect(event.setCookies.osm_token?.opts.httpOnly).toBe(true)
    expect(JSON.parse(event.setCookies.osm_user?.value ?? '')).toEqual({
      id: 42,
      username: 'mapper',
      displayName: 'mapper',
      avatar: 'https://img/avatar.png',
      changesets: 12,
      joinDate: '2020-01-01T00:00:00Z'
    })
    expect(event.setCookies.osm_user?.opts.httpOnly).toBe(false)
  })

  it('defaults the avatar and changeset count when OSM omits them', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubGlobal(
      '$fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ access_token: 'tok' })
        .mockResolvedValueOnce({ user: { id: 1, display_name: 'new', account_created: 'x' } })
    )
    const event = callbackEvent({ code: 'c', state: 'abc' })
    await (
      await load()
    )(event)
    expect(JSON.parse(event.setCookies.osm_user?.value ?? '')).toMatchObject({ avatar: null, changesets: 0 })
    expect(event.setCookies.osm_token?.opts.secure).toBe(true)
  })

  it('answers 500 when the OSM token exchange fails', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('network')))
    const error = await expectHttpError((await load())(callbackEvent({ code: 'c', state: 'abc' })))
    expect(error.statusCode).toBe(500)
    expect(error.message).toBe('Authentication failed')
  })
})
