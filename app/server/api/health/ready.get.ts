import { queryGrb } from '../../utils/db'

/**
 * Readiness for deploys (webhook/deploy.sh waits for it): the git SHA the image was built from, whether the
 * be2osm database answers, and the migrations applied per scope (processing/sql/migrate.sh tracks them in
 * <schema>.schema_migrations, and in public.schema_migrations for the "common" scope).
 */
export default defineEventHandler(async (event) => {
  const sha = String(useRuntimeConfig().gitSha || 'dev')
  try {
    const tables = (await queryGrb(
      `SELECT n.nspname AS schema FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relname = 'schema_migrations' AND c.relkind = 'r' ORDER BY 1`
    )) as { schema: string }[]
    const migrations: Record<string, string[]> = {}
    for (const { schema } of tables) {
      // Schema names come from the catalog; quoted as identifiers all the same
      const rows = (await queryGrb(
        `SELECT version FROM "${schema.replaceAll('"', '""')}".schema_migrations ORDER BY version`
      )) as { version: string }[]
      migrations[schema === 'public' ? 'common' : schema] = rows.map((row) => row.version)
    }
    return { ready: true, sha, migrations }
  } catch (error) {
    setResponseStatus(event, 503)
    return { ready: false, sha, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})
