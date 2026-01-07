-- Create osmbe database (be2osm database is created by default via POSTGRES_DB env var)
CREATE DATABASE osmbe;

-- Grant privileges (uses current user which is POSTGRES_USER)
GRANT ALL PRIVILEGES ON DATABASE osmbe TO CURRENT_USER;
