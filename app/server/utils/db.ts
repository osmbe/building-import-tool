import { Pool } from 'pg'

// Connection pools for both databases
let grbPool: Pool | null = null
let osmPool: Pool | null = null

export function getGrbPool(): Pool {
  if (!grbPool) {
    const config = useRuntimeConfig()

    const poolConfig = {
      host: config.dbHost || process.env.DB_HOST || 'localhost',
      port: parseInt(config.dbPort || process.env.DB_PORT || '5432'),
      user: config.dbUsername || process.env.DB_USERNAME || 'postgres',
      // Password will be read from .pgpass file automatically if not provided
      password: config.dbPassword || process.env.DB_PASSWORD || undefined,
      database: 'be2osm'
    }

    console.log('GRB Pool Config:', {
      host: poolConfig.host,
      port: poolConfig.port,
      user: poolConfig.user,
      database: poolConfig.database
    })

    grbPool = new Pool(poolConfig)
  }
  return grbPool
}

export function getOsmPool(): Pool {
  if (!osmPool) {
    const config = useRuntimeConfig()

    const poolConfig = {
      host: config.dbHost || process.env.DB_HOST || 'localhost',
      port: parseInt(config.dbPort || process.env.DB_PORT || '5432'),
      user: config.dbUsername || process.env.DB_USERNAME || 'postgres',
      // Password will be read from .pgpass file automatically if not provided
      password: config.dbPassword || process.env.DB_PASSWORD || undefined,
      database: 'osmbe'
    }

    console.log('OSM Pool Config:', {
      host: poolConfig.host,
      port: poolConfig.port,
      user: poolConfig.user,
      database: poolConfig.database
    })

    osmPool = new Pool(poolConfig)
  }
  return osmPool
}

// Execute query on GRB database
export async function queryGrb(sql: string, params?: any[]) {
  const client = await getGrbPool().connect()
  try {
    const result = await client.query(sql, params)
    return result.rows
  } finally {
    client.release()
  }
}

// Execute query on OSM database
export async function queryOsm(sql: string, params?: any[]) {
  const client = await getOsmPool().connect()
  try {
    const result = await client.query(sql, params)
    return result.rows
  } finally {
    client.release()
  }
}

// Close all connections
export async function closeDbConnections() {
  if (grbPool) {
    await grbPool.end()
    grbPool = null
  }
  if (osmPool) {
    await osmPool.end()
    osmPool = null
  }
}
