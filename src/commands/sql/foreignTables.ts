/**
 * SQL Templates for Foreign Table Operations
 */

export const ForeignTableSQL = {
    /**
     * Query foreign table data
     */
    queryData: (schema: string, tableName: string) =>
        `-- Query data
SELECT *
FROM ${schema}.${tableName}
LIMIT 100;`,

    /**
     * Edit foreign table
     */
    edit: (schema: string, tableName: string) =>
        `-- Edit table (requires dropping and recreating)
DROP FOREIGN TABLE IF EXISTS ${schema}.${tableName};

CREATE FOREIGN TABLE ${schema}.${tableName} (
    -- Define columns here
    column_name data_type
) SERVER server_name
OPTIONS (
    schema_name 'remote_schema',
    table_name 'remote_table'
);`,

    /**
     * Drop foreign table
     */
    drop: (schema: string, tableName: string) =>
        `-- Drop table
DROP FOREIGN TABLE IF EXISTS ${schema}.${tableName};`,

    /**
     * CREATE FOREIGN TABLE templates
     */
    create: {
        basic: (schemaName: string) =>
            `-- Create foreign server first (if not exists)
CREATE SERVER foreign_server_name
FOREIGN DATA WRAPPER postgres_fdw
OPTIONS (
    host 'remote_host',
    port '5432',
    dbname 'remote_database'
);

-- Create user mapping
CREATE USER MAPPING FOR CURRENT_USER
SERVER foreign_server_name
OPTIONS (
    user 'remote_user',
    password 'remote_password'
);

-- Create foreign table
CREATE FOREIGN TABLE ${schemaName}.foreign_table_name (
    id integer,
    name text,
    created_at timestamp
)
SERVER foreign_server_name
OPTIONS (
    schema_name 'remote_schema',
    table_name 'remote_table'
);

-- Add comment
COMMENT ON FOREIGN TABLE ${schemaName}.foreign_table_name IS 'Foreign table description';`,

        postgresRemote: (schemaName: string) =>
            `-- Enable postgres_fdw extension
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- Create foreign server
CREATE SERVER remote_postgres_server
FOREIGN DATA WRAPPER postgres_fdw
OPTIONS (
    host '192.168.1.100',
    port '5432',
    dbname 'remote_db'
);

-- Create user mapping
CREATE USER MAPPING FOR CURRENT_USER
SERVER remote_postgres_server
OPTIONS (
    user 'remote_user',
    password 'remote_password'
);

-- Create foreign table
CREATE FOREIGN TABLE ${schemaName}.remote_table (
    id serial,
    name varchar(100),
    email varchar(255),
    created_at timestamptz DEFAULT now()
)
SERVER remote_postgres_server
OPTIONS (
    schema_name 'public',
    table_name 'users'
);`,

        fileBased: (schemaName: string) =>
            `-- Enable file_fdw extension
CREATE EXTENSION IF NOT EXISTS file_fdw;

-- Create foreign server
CREATE SERVER file_server
FOREIGN DATA WRAPPER file_fdw;

-- Create foreign table for CSV file
CREATE FOREIGN TABLE ${schemaName}.csv_data (
    id integer,
    name text,
    value numeric,
    date date
)
SERVER file_server
OPTIONS (
    filename '/path/to/data.csv',
    format 'csv',
    header 'true'
);`
    },

    /**
     * Query with join to local tables
     */
    queryWithJoin: (schemaName: string) =>
        `-- Query foreign table (works like regular table)
SELECT * FROM ${schemaName}.foreign_table_name
WHERE condition
LIMIT 100;

-- Join with local tables
SELECT 
    lt.local_column,
    ft.remote_column
FROM local_table lt
JOIN ${schemaName}.foreign_table_name ft ON lt.id = ft.id;`,

    /**
     * Manage foreign server
     */
    manageForeignServer: () =>
        `-- List foreign servers
SELECT 
    srvname as server_name,
    srvoptions as options
FROM pg_foreign_server;

-- List user mappings
SELECT 
    um.srvname as server_name,
    um.usename as user_name,
    um.umoptions as options
FROM pg_user_mappings um;

-- Drop user mapping
-- DROP USER MAPPING FOR CURRENT_USER SERVER foreign_server_name;

-- Drop foreign server
-- DROP SERVER foreign_server_name CASCADE;`
};
