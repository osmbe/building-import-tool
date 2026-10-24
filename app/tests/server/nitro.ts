// Test doubles for the Nitro/h3 auto-imports used by the server handlers. Handlers run without the Nuxt
// Runtime: `defineEventHandler` returns the handler itself and the h3 helpers read/write a FakeEvent.
import { vi } from 'vite-plus/test'

export class HttpError extends Error {
  statusCode: number
  statusMessage: string | undefined

  constructor(opts: { statusCode: number; statusMessage?: string; message?: string }) {
    super(opts.message ?? opts.statusMessage ?? '')
    this.statusCode = opts.statusCode
    this.statusMessage = opts.statusMessage
  }
}

export interface FakeEvent {
  body?: unknown
  query: Record<string, unknown>
  cookies: Record<string, string>
  headers: Record<string, string>
  params: Record<string, string>
  setCookies: Record<string, { value: string; opts: Record<string, unknown> }>
  deletedCookies: string[]
  responseHeaders: Record<string, string>
  status?: number
  redirect?: string
  sentError?: HttpError
}

export function createEvent(init: Partial<FakeEvent> = {}): FakeEvent {
  return {
    cookies: {},
    deletedCookies: [],
    headers: {},
    params: {},
    query: {},
    responseHeaders: {},
    setCookies: {},
    ...init
  }
}

export const runtimeConfig = {
  dbHost: '',
  dbPassword: '',
  dbPort: '',
  dbUser: '',
  osmClientSecret: 'secret',
  public: { osmClientId: 'client-id', osmRedirectUri: 'https://be2osm.test/api/auth/osm-callback' }
}

/** Stub the Nitro globals. Call in beforeEach: `unstubGlobals` restores them after every test. */
export function stubNitro(config: unknown = runtimeConfig) {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('readBody', async (event: FakeEvent) => event.body)
  vi.stubGlobal('getQuery', (event: FakeEvent) => event.query)
  vi.stubGlobal('getCookie', (event: FakeEvent, name: string) => event.cookies[name])
  vi.stubGlobal('setCookie', (event: FakeEvent, name: string, value: string, opts: Record<string, unknown>) => {
    event.setCookies[name] = { opts, value }
  })
  vi.stubGlobal('deleteCookie', (event: FakeEvent, name: string) => {
    event.deletedCookies.push(name)
  })
  vi.stubGlobal('sendRedirect', (event: FakeEvent, url: string) => {
    event.redirect = url
    return url
  })
  vi.stubGlobal(
    'createError',
    (opts: { statusCode: number; statusMessage?: string; message?: string }) => new HttpError(opts)
  )
  vi.stubGlobal('sendError', (event: FakeEvent, error: HttpError) => {
    event.sentError = error
    return error
  })
  vi.stubGlobal('useRuntimeConfig', () => config)
  vi.stubGlobal('setResponseStatus', (event: FakeEvent, status: number) => {
    event.status = status
  })
  vi.stubGlobal('setResponseHeader', (event: FakeEvent, name: string, value: string) => {
    event.responseHeaders[name] = value
  })
  vi.stubGlobal('setResponseHeaders', (event: FakeEvent, headers: Record<string, string>) => {
    Object.assign(event.responseHeaders, headers)
  })
  vi.stubGlobal('getRequestHeader', (event: FakeEvent, name: string) => event.headers[name])
  vi.stubGlobal('getRouterParam', (event: FakeEvent, name: string) => event.params[name])
}

export type TestHandler = (event: FakeEvent) => Promise<any>

/** View a handler module's default export as a function of a FakeEvent. */
export const asHandler = (mod: { default: unknown }): TestHandler => {
  const handler = mod.default as (event: FakeEvent) => unknown
  return async (event) => await handler(event)
}

/** Await a rejected handler call and return the HttpError it threw. */
export async function expectHttpError(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof HttpError) return error
    throw error
  }
  throw new Error('Expected the handler to throw an HttpError')
}
