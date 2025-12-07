/**
 * SQL Templates for Schema Operations
 */

export const SchemaSQL = {
    /**
     * CREATE SCHEMA templates
     */
    create: {
        basic: () =>
            `-- Create basic schema
CREATE SCHEMA schema_name;

-- Add comment
COMMENT ON SCHEMA schema_name IS 'Description of the schema purpose';

-- Grant basic usage (modify as needed)
GRANT USAGE ON SCHEMA schema_name TO PUBLIC;
-- GRANT CREATE ON SCHEMA schema_name TO role_name;`,

        withPermissions: () =>
            `-- Create schema with owner
CREATE SCHEMA schema_name
    AUTHORIZATION owner_role;

-- Grant permissions to roles
GRANT USAGE ON SCHEMA schema_name TO app_role;
GRANT CREATE ON SCHEMA schema_name TO app_role;

-- Grant privileges on all existing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA schema_name TO app_role;

-- Grant privileges on all sequences
GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA schema_name TO app_role;

-- Grant execute on all functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA schema_name TO app_role;`,

        defaultPrivileges: () =>
            `-- Set default privileges for future objects
-- This ensures new objects automatically get the right permissions

-- Default privileges on tables
ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;

-- Default privileges on sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name
    GRANT SELECT, USAGE ON SEQUENCES TO app_role;

-- Default privileges on functions
ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name
    GRANT EXECUTE ON FUNCTIONS TO app_role;

-- Default privileges on types
ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name
    GRANT USAGE ON TYPES TO app_role;`,

        multiTenant: () =>
            `-- Create schema for tenant isolation
CREATE SCHEMA tenant_123;

-- Grant tenant-specific access
GRANT USAGE ON SCHEMA tenant_123 TO tenant_123_role;

-- Grant privileges on all objects
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA tenant_123 TO tenant_123_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA tenant_123 TO tenant_123_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tenant_123 TO tenant_123_role;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA tenant_123
    GRANT ALL ON TABLES TO tenant_123_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tenant_123
    GRANT ALL ON SEQUENCES TO tenant_123_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tenant_123
    GRANT EXECUTE ON FUNCTIONS TO tenant_123_role;`,

        reporting: () =>
            `-- Create schema for reporting/analytics
CREATE SCHEMA reporting;

-- Grant read-only access to reporting role
GRANT USAGE ON SCHEMA reporting TO reporting_role;

-- Grant SELECT on all tables and views
GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO reporting_role;

-- Set default privileges for future objects (read-only)
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting
    GRANT SELECT ON TABLES TO reporting_role;

-- Create materialized views in reporting schema
-- CREATE MATERIALIZED VIEW reporting.sales_summary AS ...;`
    },

    /**
     * Search path configuration
     */
    searchPath: () =>
        `-- Set search path for current session
SET search_path TO schema_name, public;

-- Set search path for a role (persistent)
ALTER ROLE role_name SET search_path = schema_name, public;

-- Set search path for a database (affects all connections)
ALTER DATABASE database_name SET search_path = schema_name, public;

-- View current search path
SHOW search_path;`,

    /**
     * List schema objects
     */
    listObjects: (schema: string) =>
        `-- List all objects in schema with sizes
SELECT 
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'i' THEN 'index'
        WHEN 'S' THEN 'sequence'
        WHEN 's' THEN 'special'
        WHEN 'f' THEN 'foreign table'
        WHEN 'p' THEN 'partitioned table'
END as object_type,
    c.relname as object_name,
    pg_size_pretty(pg_total_relation_size(quote_ident('${schema}') || '.' || quote_ident(c.relname))) as size,
    CASE WHEN c.relkind = 'r' THEN
        (SELECT reltuples::bigint FROM pg_class WHERE oid = c.oid)
    ELSE NULL END as estimated_row_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '${schema}'
AND c.relkind in ('r', 'v', 'm', 'S', 'f', 'p')
ORDER BY c.relkind, pg_total_relation_size(c.oid) DESC;`,

    /**
     * Schema privileges
     */
    privileges: (schema: string) =>
        `-- List schema privileges
SELECT grantee, string_agg(privilege_type, ', ') as privileges
FROM(
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema = '${schema}'
    UNION
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = '${schema}'
    UNION
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.usage_privileges
    WHERE object_schema = '${schema}'
) p
GROUP BY grantee
ORDER BY grantee;`,

    /**
     * Grant privileges template
     */
    grantPrivileges: (schema: string) =>
        `-- Grant privileges (modify as needed)
GRANT USAGE ON SCHEMA ${schema} TO role_name;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO role_name;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} TO role_name;
GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA ${schema} TO role_name;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema}
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_name;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema}
    GRANT EXECUTE ON FUNCTIONS TO role_name;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema}
    GRANT SELECT, USAGE ON SEQUENCES TO role_name;`,

    /**
     * DROP SCHEMA
     */
    drop: (schema: string) =>
        `-- Drop schema (BE CAREFUL!)
DROP SCHEMA ${schema}; -- This will fail if schema is not empty

-- To force drop schema and all objects:
-- DROP SCHEMA ${schema} CASCADE;`
};
