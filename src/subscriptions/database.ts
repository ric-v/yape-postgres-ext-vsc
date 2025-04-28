import { Client } from 'pg';
import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../databaseTreeProvider';
import { closeClient, createAndShowNotebook, createMetadata, createPgClient, getConnectionWithPassword, validateItem } from './connection';

/**
 * SQL Queries for database dashboard
 */

/**
 * DATABASE_STATS_QUERY - Query to get overall database statistics.
 * Fetches:
 * - Database size
 * - Active connections count
 * - User tables count
 * - Total indexes count
 */
const DATABASE_STATS_QUERY = `
SELECT
    pg_size_pretty(pg_database_size(current_database())) as "Database Size",
    (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as "Active Connections",
    (SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as "User Tables",
    (SELECT count(*) FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as "Indexes";`;

/**
 * TABLE_STATS_QUERY - Query to get table size and usage statistics.
 * Shows top 10 tables by total size.
 * Fetches:
 * - Schema name
 * - Table name
 * - Total size (table + indexes)
 * - Table size
 * - Index size
 * - Live row count
 */
const TABLE_STATS_QUERY = `
SELECT 
    schemaname as "Schema",
    relname as "Table",
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) as "Total Size",
    pg_size_pretty(pg_table_size(schemaname || '.' || relname)) as "Table Size",
    pg_size_pretty(pg_indexes_size(schemaname || '.' || relname)) as "Index Size",
    n_live_tup as "Live Rows"
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC
LIMIT 10;`;

/**
 * INDEX_STATS_QUERY - Query to get index usage statistics.
 * Shows top 10 indexes by scan count.
 * Fetches:
 * - Schema name
 * - Table name
 * - Index name
 * - Number of index scans
 * - Number of tuples read
 * - Number of tuples fetched
 */
const INDEX_STATS_QUERY = `
SELECT 
    schemaname as "Schema",
    relname as "Table",
    indexrelname as "Index",
    idx_scan as "Index Scans",
    idx_tup_read as "Tuples Read",
    idx_tup_fetch as "Tuples Fetched"
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC
LIMIT 10;`;

/**
 * CACHE_STATS_QUERY - Query to get cache hit ratios.
 * Fetches:
 * - Index cache hit rate
 * - Table cache hit rate
 */
const CACHE_STATS_QUERY = `
SELECT 
    'Index Hit Rate' as "Metric",
    round(100 * sum(idx_blks_hit) / nullif(sum(idx_blks_hit + idx_blks_read), 0), 2) as "Ratio %"
FROM pg_statio_user_indexes
UNION ALL
SELECT 
    'Table Hit Rate',
    round(100 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit + heap_blks_read), 0), 2)
FROM pg_statio_user_tables;`;

/**
 * cmdShowDatabaseDashboard - Creates a notebook with database statistics and performance metrics.
 * Shows:
 * - Database size and general statistics
 * - Table sizes and row counts
 * - Index usage statistics
 * - Cache hit ratios
 * 
 * @param {DatabaseTreeItem} item - The selected database item from the tree view
 * @param {vscode.ExtensionContext} context - The extension context
 * @returns {Promise<void>} - A promise that resolves when the dashboard is displayed
 * 
 * @example
 * await cmdShowDatabaseDashboard(databaseItem, context);
 * // Dashboard notebook is now displayed
 */
export async function cmdDatabaseDashboard(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        if (!item) {
            throw new Error('No database selected');
        }
        if (!item.connectionId || !item.databaseName) {
            throw new Error('Invalid database selection - missing connection or database name');
        }
        // Remove validateItem() call since it requires schema which isn't needed for database operations
        
        const connection = await getConnectionWithPassword(item.connectionId, context);
        
        if (!connection) {
            throw new Error('Failed to get database connection');
        }

        const metadata = createMetadata(connection, item.databaseName);
        
        if (!metadata) {
            throw new Error('Failed to create metadata for notebook');
        }

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Database Dashboard: ${item.label}\n\nThis dashboard provides an overview of your database:\n- Database size and statistics\n- Active connections\n- Table sizes and row counts\n- Index usage statistics\n- Cache hit ratios`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Database size and statistics\n${DATABASE_STATS_QUERY}`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Table sizes and row counts\n${TABLE_STATS_QUERY}`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Index usage statistics\n${INDEX_STATS_QUERY}`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Cache hit ratios\n${CACHE_STATS_QUERY}`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        let errorMessage = 'Failed to show dashboard';
        if (err instanceof Error) {
            errorMessage += `: ${err.message}`;
        }
        vscode.window.showErrorMessage(errorMessage);
    }
}

/**
 * cmdAddInDatabase - Command to create a new object in the database.
 * Prompts the user to select the type of object to create (schema, user, role, or extension).
 * Creates a notebook with a template for the selected object type.
 * 
 * @param {DatabaseTreeItem} item - The selected database item from the tree view
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdAddObjectInDatabase(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        if (!item) {
            throw new Error('No database selected');
        }
        if (!item.connectionId || !item.databaseName) {
            throw new Error('Invalid database selection - missing connection or database name');
        }
        // Remove validateItem() call since it requires schema which isn't needed for database operations
        
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const metadata = createMetadata(connection, item.databaseName);

        const schemaTemplate = {
            label: 'Schema',
            detail: 'Create a new schema in this database',
            cells: [
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "# Create New Schema",
                        "",
                        "This notebook guides you through creating a new schema and setting up appropriate permissions. Each cell focuses on a specific aspect of schema creation and management.",
                        "",
                        "Execute the cells in order as needed for your use case."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 1. Create Schema",
                        "Create a new schema with optional ownership settings."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Basic schema creation",
                        "CREATE SCHEMA schema_name;",
                        "",
                        "-- OR create with specific owner",
                        "-- CREATE SCHEMA schema_name AUTHORIZATION role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 2. Basic Permissions",
                        "Grant basic usage permissions to roles that need to access the schema."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant basic schema usage",
                        "GRANT USAGE ON SCHEMA schema_name TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 3. Object Permissions",
                        "Grant permissions for existing tables and sequences in the schema."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant permissions on all tables",
                        "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA schema_name TO role_name;",
                        "",
                        "-- Grant permissions on all sequences",
                        "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA schema_name TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 4. Default Privileges",
                        "Set up default privileges for objects that will be created in the future."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Set default privileges for future tables",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name",
                        "    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_name;",
                        "",
                        "-- Set default privileges for future sequences",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name",
                        "    GRANT USAGE, SELECT ON SEQUENCES TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## Example: Complete Schema Setup",
                        "Here's a practical example of creating an application schema with specific privileges."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Example: Create application schema with specific privileges",
                        "CREATE SCHEMA app_schema;",
                        "",
                        "-- Grant read-only access to app_readonly role",
                        "GRANT USAGE ON SCHEMA app_schema TO app_readonly;",
                        "GRANT SELECT ON ALL TABLES IN SCHEMA app_schema TO app_readonly;",
                        "",
                        "-- Grant full access to app_admin role",
                        "GRANT ALL PRIVILEGES ON SCHEMA app_schema TO app_admin;",
                        "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app_schema TO app_admin;"
                    ].join('\n')
                }
            ]
        };

        const userTemplate = {
            label: 'User',
            detail: 'Create a new user with login privileges',
            cells: [
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "# Create New Database User",
                        "",
                        "This notebook guides you through creating a new PostgreSQL user and setting up appropriate privileges.",
                        "Execute the cells as needed for your specific use case."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 1. Create User",
                        "Create a new user with basic attributes. Uncomment and modify additional attributes as needed."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Create new user with basic attributes",
                        "CREATE USER username WITH",
                        "    LOGIN",
                        "    PASSWORD 'strong_password'",
                        "    -- Additional optional attributes:",
                        "    -- CREATEDB                    -- Can create new databases",
                        "    -- SUPERUSER                   -- Has all database privileges",
                        "    -- CREATEROLE                  -- Can create new roles",
                        "    -- REPLICATION                 -- Can initiate streaming replication",
                        "    -- CONNECTION LIMIT 5          -- Maximum concurrent connections",
                        "    -- VALID UNTIL '2025-12-31'   -- Password expiration date",
                        ";"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 2. Database Privileges",
                        "Grant database-level privileges to the new user."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant database connection privileges",
                        "GRANT CONNECT ON DATABASE database_name TO username;",
                        "",
                        "-- Allow creating temporary tables",
                        "GRANT TEMP ON DATABASE database_name TO username;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 3. Schema Privileges",
                        "Grant schema-level privileges. Repeat for each schema as needed."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant schema privileges",
                        "GRANT USAGE ON SCHEMA schema_name TO username;",
                        "",
                        "-- Optional: allow creating new objects in schema",
                        "-- GRANT CREATE ON SCHEMA schema_name TO username;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 4. Table Privileges",
                        "Grant table-level privileges within schemas."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant table privileges",
                        "GRANT SELECT, INSERT, UPDATE, DELETE ",
                        "ON ALL TABLES IN SCHEMA schema_name ",
                        "TO username;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 5. Default Privileges",
                        "Set up default privileges for future objects."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Set default privileges for future tables",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name",
                        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES",
                        "TO username;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## Example: Read-only User",
                        "Here's a practical example of creating a read-only user."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Create read-only user",
                        "CREATE USER readonly_user WITH",
                        "    LOGIN",
                        "    PASSWORD 'strong_password'",
                        "    CONNECTION LIMIT 10;",
                        "",
                        "-- Grant minimal privileges",
                        "GRANT CONNECT ON DATABASE database_name TO readonly_user;",
                        "GRANT USAGE ON SCHEMA public TO readonly_user;",
                        "GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;",
                        "",
                        "-- Set up default privileges for future tables",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA public",
                        "    GRANT SELECT ON TABLES TO readonly_user;"
                    ].join('\n')
                }
            ]
        };

        const roleTemplate = {
            label: 'Role',
            detail: 'Create a new role',
            cells: [
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "# Create New Role",
                        "",
                        "This notebook guides you through creating a new PostgreSQL role and configuring its privileges.",
                        "Execute the cells you need for your specific use case."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 1. Create Role",
                        "Create a new role with basic attributes. Uncomment and modify additional attributes as needed."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Create new role with basic attributes",
                        "CREATE ROLE role_name WITH",
                        "    NOLOGIN                     -- Cannot login (use LOGIN for login capability)",
                        "    INHERIT                     -- Inherit privileges from parent roles",
                        "    -- Additional optional attributes:",
                        "    -- SUPERUSER               -- Has all database privileges",
                        "    -- CREATEDB               -- Can create new databases",
                        "    -- CREATEROLE            -- Can create new roles",
                        "    -- REPLICATION           -- Can initiate streaming replication",
                        "    -- CONNECTION LIMIT 5    -- Maximum concurrent connections",
                        "    -- IN GROUP role1, role2 -- Add role to existing groups",
                        ";"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 2. Database Privileges",
                        "Grant database-level privileges to the role."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant database privileges",
                        "GRANT CONNECT ON DATABASE database_name TO role_name;",
                        "GRANT CREATE ON DATABASE database_name TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 3. Schema Privileges",
                        "Grant schema-level privileges to the role."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant schema privileges",
                        "GRANT USAGE ON SCHEMA schema_name TO role_name;",
                        "GRANT CREATE ON SCHEMA schema_name TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 4. Object Privileges",
                        "Grant privileges on tables, functions, and sequences."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant table privileges",
                        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA schema_name TO role_name;",
                        "",
                        "-- Grant function privileges",
                        "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA schema_name TO role_name;",
                        "",
                        "-- Grant sequence privileges",
                        "GRANT USAGE ON ALL SEQUENCES IN SCHEMA schema_name TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 5. Default Privileges",
                        "Set up default privileges for future objects."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Set default privileges for future objects",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name",
                        "    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_name;",
                        "",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name",
                        "    GRANT EXECUTE ON FUNCTIONS TO role_name;",
                        "",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name",
                        "    GRANT USAGE ON SEQUENCES TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## Example: Application Role",
                        "Here's a practical example of creating an application role with read-only access."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Create application role",
                        "CREATE ROLE app_readonly WITH",
                        "    NOLOGIN",
                        "    INHERIT",
                        "    CONNECTION LIMIT 100;",
                        "",
                        "-- Grant minimal privileges",
                        "GRANT CONNECT ON DATABASE app_db TO app_readonly;",
                        "GRANT USAGE ON SCHEMA public TO app_readonly;",
                        "GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;",
                        "",
                        "-- Set up default privileges",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA public",
                        "    GRANT SELECT ON TABLES TO app_readonly;"
                    ].join('\n')
                }
            ]
        };

        const extensionTemplate = {
            label: 'Extension',
            detail: 'Enable a PostgreSQL extension',
            cells: [
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "# Enable PostgreSQL Extension",
                        "",
                        "This notebook helps you enable and manage PostgreSQL extensions.",
                        "Choose the cells you need based on your requirements."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 1. View Available Extensions",
                        "List extensions that can be installed but aren't yet enabled."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- List available extensions",
                        "SELECT name as \"Name\",",
                        "       default_version as \"Version\",",
                        "       installed_version as \"Installed\",",
                        "       comment as \"Description\"",
                        "FROM pg_available_extensions ",
                        "WHERE installed_version IS NULL ",
                        "ORDER BY name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 2. Enable Extension",
                        "Enable a specific extension. Uncomment the extension you want to enable."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Enable your chosen extension",
                        "CREATE EXTENSION IF NOT EXISTS extension_name;",
                        "",
                        "-- Common extensions (uncomment to use):",
                        "-- CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";     -- UUID generation",
                        "-- CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";      -- Cryptographic functions",
                        "-- CREATE EXTENSION IF NOT EXISTS \"hstore\";        -- Key-value store",
                        "-- CREATE EXTENSION IF NOT EXISTS \"postgis\";       -- Spatial database",
                        "-- CREATE EXTENSION IF NOT EXISTS \"pg_stat_statements\"; -- Query statistics",
                        "-- CREATE EXTENSION IF NOT EXISTS \"pg_trgm\";       -- Trigram text search",
                        "-- CREATE EXTENSION IF NOT EXISTS \"tablefunc\";     -- Table functions",
                        "-- CREATE EXTENSION IF NOT EXISTS \"ltree\";         -- Hierarchical tree structures",
                        "-- CREATE EXTENSION IF NOT EXISTS \"isn\";           -- Product number standards",
                        "-- CREATE EXTENSION IF NOT EXISTS \"citext\";        -- Case-insensitive text"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 3. Verify Installation",
                        "Check if the extension was successfully installed."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Verify extension installation",
                        "SELECT * FROM pg_extension WHERE extname = 'extension_name';"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "## 4. List Installed Extensions",
                        "View all currently installed extensions in the database."
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- List all installed extensions",
                        "SELECT extname as \"Name\",",
                        "       extversion as \"Version\",",
                        "       obj_description(oid, 'pg_extension') as \"Description\"",
                        "FROM pg_extension",
                        "ORDER BY extname;"
                    ].join('\n')
                }
            ]
        };

        const items = [
            schemaTemplate,
            userTemplate,
            roleTemplate,
            extensionTemplate
        ];

        const selection = await vscode.window.showQuickPick(items, {
            title: 'Create in Database',
            placeHolder: 'Select what to create'
        });

        if (selection) {
            // Create notebook cells with correct language identifiers for both SQL and markdown
            const notebookCells = selection.cells.map(cell => 
                new vscode.NotebookCellData(
                    cell.cell_type === "code" ? vscode.NotebookCellKind.Code : vscode.NotebookCellKind.Markup,
                    cell.value,
                    cell.cell_type === "code" ? 'sql' : 'markdown'  // Use appropriate language for each cell type
                )
            );

            // Create notebook with only the essential metadata
            const notebookData = new vscode.NotebookData(notebookCells);
            notebookData.metadata = {
                connectionId: metadata.connectionId,
                databaseName: metadata.databaseName,
                host: metadata.host,
                port: metadata.port,
                username: metadata.username
            };

            const document = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
            await vscode.window.showNotebookDocument(document);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create notebook: ${err.message}`);
    }
}

/**
 * cmdAllDatabaseOperations - Command to create a notebook with various database operations.
 * 
 * @param {DatabaseTreeItem} item - The selected database item from the tree view
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdDatabaseOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        if (!item) {
            throw new Error('No database selected');
        }
        if (!item.connectionId || !item.databaseName) {
            throw new Error('Invalid database selection - missing connection or database name');
        }
        // Remove validateItem() call since it requires schema which isn't needed for database operations
        
        const connection = await getConnectionWithPassword(item.connectionId, context);
        let client: Client | undefined;

        try {
            client = await createPgClient(connection, item.databaseName);
            const metadata = createMetadata(connection, item.databaseName);

            // Get database info
            const dbInfoQuery = `
                SELECT 
                    d.datname as "Database",
                    pg_size_pretty(pg_database_size(d.datname)) as "Size",
                    u.usename as "Owner",
                    (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as "Active Connections",
                    (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('pg_catalog', 'information_schema')) as "Schemas",
                    (SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as "Tables",
                    (SELECT count(*) FROM pg_roles) as "Roles"
                FROM pg_database d
                JOIN pg_user u ON d.datdba = u.usesysid
                WHERE d.datname = current_database();`;

            const dbInfo = await client.query(dbInfoQuery);
            const info = dbInfo.rows[0];

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `# Database Operations: ${item.label}

## Database Information
- **Size**: ${info.Size}
- **Owner**: ${info.Owner}
- **Active Connections**: ${info["Active Connections"]}
- **Schemas**: ${info.Schemas}
- **Tables**: ${info.Tables}
- **Roles**: ${info.Roles}

This notebook contains operations for managing the database. Execute the cells below to perform operations.`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- List schemas and sizes
SELECT schema_name,
       pg_size_pretty(sum(table_size)::bigint) as "Size",
       count(table_name) as "Tables"
FROM (
    SELECT pg_tables.schemaname as schema_name,
           tablename as table_name,
           pg_total_relation_size(pg_tables.schemaname || '.' || tablename) as table_size
    FROM pg_tables
) t
GROUP BY schema_name
ORDER BY sum(table_size) DESC;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- List users and roles
SELECT r.rolname as "Role",
       r.rolsuper as "Superuser",
       r.rolcreatedb as "Create DB",
       r.rolcreaterole as "Create Role",
       r.rolcanlogin as "Can Login",
       r.rolconnlimit as "Connection Limit",
       r.rolvaliduntil as "Valid Until"
FROM pg_roles r
ORDER BY r.rolname;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Show active connections
SELECT pid as "Process ID",
       usename as "User",
       datname as "Database",
       client_addr as "Client Address",
       application_name as "Application",
       state as "State",
       query as "Last Query",
       backend_start as "Connected Since"
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY backend_start;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- List installed extensions
SELECT name as "Extension",
       default_version as "Default Version",
       installed_version as "Installed Version",
       comment as "Description"
FROM pg_available_extensions
WHERE installed_version IS NOT NULL
ORDER BY name;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Database maintenance
-- Note: These operations require appropriate privileges

-- Analyze all tables (updates statistics)
ANALYZE VERBOSE;

-- List tables that might need vacuuming
SELECT schemaname, relname, n_dead_tup, last_vacuum, last_autovacuum,
       pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) as total_size
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY n_dead_tup DESC;

-- To vacuum a specific table (uncomment and modify):
-- VACUUM ANALYZE schema_name.table_name;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Terminate connections (BE CAREFUL!)
-- List commands to terminate other connections to this database
SELECT format(
    'SELECT pg_terminate_backend(%s) /* %s %s %s */;',
    pid,
    usename,
    application_name,
    query
)
FROM pg_stat_activity
WHERE datname = current_database()
AND pid <> pg_backend_pid();`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            await closeClient(client);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create database operations notebook: ${err.message}`);
    }
}