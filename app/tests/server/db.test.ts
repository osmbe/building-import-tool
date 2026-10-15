import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { closeDbConnections, getGrbPool, getOsmPool, queryGrb, queryOsm } from '~/server/utils/db'

const pg = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() }
  const pool = { connect: vi.fn(async () => client), end: vi.fn(async () => {}) }
  // A regular function so it can be called with `new`
  const Pool = vi.fn(function Pool(_config: unknown) {
    return pool
  })
  return { client, pool, Pool }
})

vi.mock('pg', () => ({ Pool: pg.Pool, default: { Pool: pg.Pool } }))

const ENV_KEYS = ['POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_USER', 'POSTGRES_PASSWORD'] as const
let config: Record<string, string>

beforeEach(() => {
  config = { dbHost: '', dbPort: '', dbUser: '', dbPassword: '' }
  vi.stubGlobal('useRuntimeConfig', () => config)
  for (const key of ENV_KEYS) vi.stubEnv(key, '')
  pg.Pool.mockClear()
  pg.client.query.mockReset()
  pg.client.release.mockReset()
  pg.pool.end.mockClear()
})

afterEach(async () => {
  await closeDbConnections()
  vi.unstubAllEnvs()
})

const poolConfig = (call = 0): unknown => pg.Pool.mock.calls[call]?.[0]

describe('database pools', () => {
  it('defaults to a local connection (password from .pgpass)', () => {
    getGrbPool()
    getOsmPool()
    expect(poolConfig(0)).toEqual({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: undefined,
      database: 'be2osm'
    })
    expect(poolConfig(1)).toMatchObject({ database: 'osmbe' })
  })

  it('prefers the runtime config over the POSTGRES_* environment', () => {
    vi.stubEnv('POSTGRES_HOST', 'env-host')
    vi.stubEnv('POSTGRES_PORT', '6543')
    config = { dbHost: 'cfg-host', dbPort: '15432', dbUser: 'cfg-user', dbPassword: 'cfg-pw' }
    getOsmPool()
    expect(poolConfig()).toEqual({
      host: 'cfg-host',
      port: 15432,
      user: 'cfg-user',
      password: 'cfg-pw',
      database: 'osmbe'
    })
  })

  it('falls back to the POSTGRES_* environment', () => {
    vi.stubEnv('POSTGRES_HOST', 'db')
    vi.stubEnv('POSTGRES_PORT', '6543')
    vi.stubEnv('POSTGRES_USER', 'be2osm')
    vi.stubEnv('POSTGRES_PASSWORD', 'pw')
    getGrbPool()
    expect(poolConfig()).toEqual({ host: 'db', port: 6543, user: 'be2osm', password: 'pw', database: 'be2osm' })
  })

  it('reuses one pool per database until the connections are closed', async () => {
    expect(getGrbPool()).toBe(getGrbPool())
    expect(getOsmPool()).toBe(getOsmPool())
    expect(pg.Pool).toHaveBeenCalledTimes(2)

    await closeDbConnections()
    expect(pg.pool.end).toHaveBeenCalledTimes(2)
    getGrbPool()
    expect(pg.Pool).toHaveBeenCalledTimes(3)
  })

  it('closing without open pools is a no-op', async () => {
    await closeDbConnections()
    expect(pg.pool.end).not.toHaveBeenCalled()
  })
})

describe('queryGrb / queryOsm', () => {
  it.each([
    ['queryGrb', queryGrb],
    ['queryOsm', queryOsm]
  ])('%s returns the rows and releases the client', async (_name, query) => {
    pg.client.query.mockResolvedValue({ rows: [{ n: 1 }] })
    expect(await query('SELECT $1::int AS n', [1])).toEqual([{ n: 1 }])
    expect(pg.client.query).toHaveBeenCalledWith('SELECT $1::int AS n', [1])
    expect(pg.client.release).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['queryGrb', queryGrb],
    ['queryOsm', queryOsm]
  ])('%s releases the client when the query fails', async (_name, query) => {
    pg.client.query.mockRejectedValue(new Error('syntax error'))
    await expect(query('SELEC')).rejects.toThrow('syntax error')
    expect(pg.client.release).toHaveBeenCalledTimes(1)
  })
})
