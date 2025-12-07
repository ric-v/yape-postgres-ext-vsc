/**
 * SQL Templates for User and Role Operations
 */

export const UsersRolesSQL = {
    /**
     * View role attributes
     */
    roleAttributes: (roleName: string) =>
        `-- View role attributes
SELECT 
    r.rolname as "Name",
    r.rolsuper as "Superuser",
    r.rolinherit as "Inherit",
    r.rolcreaterole as "Create Role",
    r.rolcreatedb as "Create DB",
    r.rolcanlogin as "Can Login",
    r.rolreplication as "Replication",
    r.rolconnlimit as "Connection Limit",
    r.rolvaliduntil as "Valid Until",
    r.rolbypassrls as "Bypass RLS"
FROM pg_roles r
WHERE r.rolname = '${roleName}';`,

    /**
     * Role memberships
     */
    roleMemberships: (roleName: string) =>
        `-- View role memberships (roles this role belongs to)
SELECT 
    r.rolname as "Role",
    m.rolname as "Member Of",
    g.rolname as "Granted By",
    am.admin_option as "Admin Option"
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.member
JOIN pg_roles m ON m.oid = am.roleid
JOIN pg_roles g ON g.oid = am.grantor
WHERE r.rolname = '${roleName}';

-- View members of this role
SELECT 
    r.rolname as "Role",
    m.rolname as "Has Member",
    g.rolname as "Granted By",
    am.admin_option as "Admin Option"
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
JOIN pg_roles g ON g.oid = am.grantor
WHERE r.rolname = '${roleName}';`,

    /**
     * Granted privileges
     */
    grantedPrivileges: (roleName: string) =>
        `-- View granted privileges
SELECT 
    grantor,
    table_schema,
    table_name,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges
WHERE grantee = '${roleName}'
ORDER BY table_schema, table_name, privilege_type;`,

    /**
     * CREATE USER template
     */
    createUser: (databaseName: string) =>
        `-- Create a new user with login privileges
CREATE USER new_username WITH
    LOGIN
    PASSWORD 'strong_password_here'
    -- Uncomment and modify as needed:
    -- CREATEDB
    -- CREATEROLE
    -- SUPERUSER
    -- REPLICATION
    -- CONNECTION LIMIT 10
    -- VALID UNTIL '2025-12-31'
;

-- Grant connect privilege to specific database
GRANT CONNECT ON DATABASE ${databaseName} TO new_username;

-- Optional: Grant role membership
-- GRANT existing_role TO new_username;

-- Optional: Grant schema usage
-- GRANT USAGE ON SCHEMA public TO new_username;`,

    /**
     * CREATE ROLE template
     */
    createRole: () =>
        `-- Create a new role (without login)
CREATE ROLE new_role_name WITH
    NOLOGIN
    INHERIT
    -- Uncomment and modify as needed:
    -- CREATEDB
    -- CREATEROLE
    -- SUPERUSER
;

-- Grant privileges to the role
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO new_role_name;
-- GRANT USAGE ON SCHEMA public TO new_role_name;

-- Grant role to users
-- GRANT new_role_name TO some_user;`,

    /**
     * ALTER ROLE template
     */
    alterRole: (roleName: string) =>
        `-- Modify role attributes
ALTER ROLE ${roleName}
    -- Uncomment and modify the attributes you want to change:
    -- WITH PASSWORD 'new_password'
    -- SUPERUSER | NOSUPERUSER
    -- CREATEDB | NOCREATEDB
    -- CREATEROLE | NOCREATEROLE
    -- LOGIN | NOLOGIN
    -- INHERIT | NOINHERIT
    -- REPLICATION | NOREPLICATION
    -- CONNECTION LIMIT 5
    -- VALID UNTIL '2025-12-31'
;

-- Rename role
-- ALTER ROLE ${roleName} RENAME TO new_role_name;

-- Set role-specific configuration
-- ALTER ROLE ${roleName} SET search_path TO public, my_schema;
-- ALTER ROLE ${roleName} SET statement_timeout TO '30s';`,

    /**
     * Change password
     */
    changePassword: (roleName: string) =>
        `-- Change role password
ALTER ROLE ${roleName} WITH PASSWORD 'new_secure_password';

-- Set password with expiration
-- ALTER ROLE ${roleName} WITH PASSWORD 'new_password' VALID UNTIL '2025-12-31';`,

    /**
     * GRANT/REVOKE privileges templates
     */
    privileges: {
        database: (roleName: string, dbName: string) =>
            `-- Grant database privileges
GRANT CONNECT ON DATABASE ${dbName} TO ${roleName};
-- GRANT CREATE ON DATABASE ${dbName} TO ${roleName};
-- GRANT TEMP ON DATABASE ${dbName} TO ${roleName};

-- Revoke database privileges
-- REVOKE CONNECT ON DATABASE ${dbName} FROM ${roleName};`,

        schema: (roleName: string) =>
            `-- Grant schema privileges
GRANT USAGE ON SCHEMA public TO ${roleName};
-- GRANT CREATE ON SCHEMA public TO ${roleName};
-- GRANT ALL ON SCHEMA public TO ${roleName};

-- Revoke schema privileges
-- REVOKE USAGE ON SCHEMA public FROM ${roleName};`,

        table: (roleName: string) =>
            `-- Grant table privileges (all tables in schema)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${roleName};
-- GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${roleName};
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO ${roleName};

-- Grant on specific table
-- GRANT SELECT, INSERT ON public.table_name TO ${roleName};

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO ${roleName};

-- Revoke table privileges
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${roleName};`,

        function: (roleName: string) =>
            `-- Grant function privileges
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${roleName};
-- GRANT EXECUTE ON FUNCTION public.function_name() TO ${roleName};

-- Grant sequence privileges
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${roleName};
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${roleName};

-- Set default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO ${roleName};
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE ON SEQUENCES TO ${roleName};`,

        roleMembership: (roleName: string) =>
            `-- Grant role membership
-- GRANT other_role TO ${roleName};
-- GRANT other_role TO ${roleName} WITH ADMIN OPTION;

-- Revoke role membership
-- REVOKE other_role FROM ${roleName};`
    },

    /**
     * DROP ROLE with owned objects check
     */
    dropRole: (roleName: string) =>
        `-- Step 1: View objects owned by this role
SELECT 
    n.nspname as schema,
    c.relname as name,
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'S' THEN 'sequence'
        WHEN 'f' THEN 'foreign table'
        ELSE c.relkind::text
    END as type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_roles r ON r.oid = c.relowner
WHERE r.rolname = '${roleName}'
ORDER BY n.nspname, c.relname;

-- Step 2: Reassign owned objects to another role
-- REASSIGN OWNED BY ${roleName} TO postgres;

-- Step 3: Drop owned objects (if not needed)
-- DROP OWNED BY ${roleName};

-- Step 4: Drop the role
-- DROP ROLE ${roleName};

-- Alternative: Drop role if exists
-- DROP ROLE IF EXISTS ${roleName};`,

    /**
     * Role dependencies
     */
    roleDependencies: (roleName: string) =>
        `-- Objects owned by this role
SELECT 
    n.nspname as "Schema",
    c.relname as "Name",
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'S' THEN 'sequence'
        WHEN 'f' THEN 'foreign table'
        WHEN 'i' THEN 'index'
        ELSE c.relkind::text
    END as "Type"
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_roles r ON r.oid = c.relowner
WHERE r.rolname = '${roleName}'
AND n.nspname NOT LIKE 'pg_%'
ORDER BY n.nspname, c.relname;

-- Functions owned by this role
SELECT 
    n.nspname as "Schema",
    p.proname as "Function",
    pg_get_function_identity_arguments(p.oid) as "Arguments"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE r.rolname = '${roleName}'
AND n.nspname NOT LIKE 'pg_%'
ORDER BY n.nspname, p.proname;

-- Databases owned by this role
SELECT 
    d.datname as "Database"
FROM pg_database d
JOIN pg_roles r ON r.oid = d.datdba
WHERE r.rolname = '${roleName}';`
};
