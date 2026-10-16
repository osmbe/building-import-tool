-- Cleanup (data plan P5), step 2: drop the foreign data wrapper from be2osm to osmbe (postgres/04-setup-fdw.sql
-- of older releases) and its cache. Nothing reads them: the API queries osmbe through its own pool
-- (server/utils/db.ts), and the previous release stopped refreshing the cache.
-- On a database that never had them (fresh volumes of this release) every statement is a no-op.
DROP FUNCTION IF EXISTS public.refresh_osm_cache();
DROP TABLE IF EXISTS public.osm_buildings_cache;
-- The foreign tables (osm.osm_buildings, osm.osm_addresses) and the user mapping, which holds the database password,
-- go with the server
DROP SERVER IF EXISTS osmbe_server CASCADE;
-- The osm schema of be2osm only held the foreign tables: dropped when it is empty, kept (with a notice) otherwise
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'osm') THEN
        IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'osm'::regnamespace)
            OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'osm'::regnamespace)
            OR EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'osm'::regnamespace) THEN
            RAISE NOTICE 'schema osm is not empty: kept';
        ELSE
            DROP SCHEMA osm;
        END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_foreign_server s JOIN pg_foreign_data_wrapper w ON w.oid = s.srvfdw
                   WHERE w.fdwname = 'postgres_fdw') THEN
        DROP EXTENSION IF EXISTS postgres_fdw;
    END IF;
END
$$;
