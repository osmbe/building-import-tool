// Import timestamps of the official datasets (Issue #59).
// Each schema has a one-row `<schema>.import_meta` table written by the processing recipes.

export type DataDates = Record<'grb' | 'knw' | 'picc' | 'urbis', string | null>

type QueryFn = (sql: string) => Promise<Record<string, unknown>[]>

const SCHEMAS = ['grb', 'picc', 'urbis'] as const

// Returns an ISO timestamp, or null when the table is missing (older deployment), empty or unreadable.
async function readImportedAt(query: QueryFn, schema: (typeof SCHEMAS)[number]): Promise<string | null> {
  try {
    const rows = await query(`SELECT max(imported_at) AS imported_at FROM ${schema}.import_meta`)
    const value = rows[0]?.imported_at
    if (!value) return null
    let date: Date | null = null
    if (value instanceof Date) date = value
    else if (typeof value === 'string' || typeof value === 'number') date = new Date(value)
    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
  } catch {
    return null
  }
}

export async function fetchDataDates(query: QueryFn): Promise<DataDates> {
  const [grb = null, picc = null, urbis = null] = await Promise.all(
    SCHEMAS.map( async (schema) => readImportedAt(query, schema))
  )
  // KNW (kunstwerken) is imported from the GRB products, so it shares the GRB date.
  return { grb, knw: grb, picc, urbis }
}
