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

        const items = [
            { label: 'Schema', detail: 'Create a new schema in this database', query: `CREATE SCHEMA schema_name;` },
            { label: 'User', detail: 'Create a new user with login privileges', query: `CREATE USER username WITH\n    LOGIN\n    PASSWORD 'strong_password'\n    CREATEDB;` },
            { label: 'Role', detail: 'Create a new role', query: `CREATE ROLE role_name WITH\n    NOLOGIN\n    INHERIT;` },
            { label: 'Extension', detail: 'Enable a PostgreSQL extension', query: `CREATE EXTENSION IF NOT EXISTS extension_name;` }
        ];

        const selection = await vscode.window.showQuickPick(items, {
            title: 'Create in Database',
            placeHolder: 'Select what to create'
        });

        if (selection) {
            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `# Create New ${selection.label} in Database: ${item.databaseName}\n\nModify the definition below and execute the cell to create the ${selection.label.toLowerCase()}.`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    selection.query,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
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