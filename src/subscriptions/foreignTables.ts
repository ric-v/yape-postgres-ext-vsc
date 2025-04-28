import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../databaseTreeProvider';
import { closeClient, createAndShowNotebook, createMetadata, createPgClient, getConnectionWithPassword, validateItem } from './connection';

/**
 * SQL Queries for foreign table operations
 */

/**
 * FOREIGN_TABLE_INFO_QUERY - Query to get foreign table details including columns, server, and options
 */
const FOREIGN_TABLE_INFO_QUERY = `
SELECT 
    c.column_name,
    c.data_type,
    c.is_nullable,
    c.column_default,
    fs.srvname as server_name,
    fto.ftoptions as options
FROM information_schema.columns c
JOIN pg_class pc ON pc.relname = c.table_name
JOIN pg_foreign_table ft ON ft.ftrelid = pc.oid
JOIN pg_foreign_server fs ON fs.oid = ft.ftserver
LEFT JOIN pg_foreign_table_options fto ON fto.ftrelid = ft.ftrelid
WHERE c.table_schema = $1
AND c.table_name = $2
ORDER BY c.ordinal_position`;

/**
 * FOREIGN_TABLE_DEF_QUERY - Query to get foreign table definition for editing
 */
const FOREIGN_TABLE_DEF_QUERY = `
SELECT 
    c.relname as table_name,
    fs.srvname as server_name,
    array_agg(
        format('%I %s%s', 
            a.attname, 
            format_type(a.atttypid, a.atttypmod),
            CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
        ) ORDER BY a.attnum
    ) as columns,
    ftoptions as options
FROM pg_class c
JOIN pg_foreign_table ft ON c.oid = ft.ftrelid
JOIN pg_foreign_server fs ON fs.oid = ft.ftserver
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
LEFT JOIN pg_foreign_table_options fto ON fto.ftrelid = ft.ftrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = $1
AND n.nspname = $2
GROUP BY c.relname, fs.srvname, ftoptions`;

/**
 * cmdAllForeignTableOperations - Command to create a notebook with all foreign table operations
 * @param {DatabaseTreeItem} item - The selected foreign table item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdForeignTableOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const client = await createPgClient(connection, item.databaseName);

        try {
            const result = await client.query(FOREIGN_TABLE_INFO_QUERY, [item.schema, item.label]);
            if (result.rows.length === 0) {
                throw new Error('Foreign table not found');
            }

            const serverName = result.rows[0].server_name;
            const options = result.rows[0].options || [];
            const columnDefinitions = result.rows.map(row =>
                `    ${row.column_name} ${row.data_type}${row.is_nullable === 'NO' ? ' NOT NULL' : ''}${row.column_default ? ' DEFAULT ' + row.column_default : ''}`
            ).join(',\n');

            const createTableStatement = `CREATE FOREIGN TABLE ${item.schema}.${item.label} (\n${columnDefinitions}\n) SERVER ${serverName}${options.length > 0 ? '\nOPTIONS (' + options.map((opt: any) => `${opt}`).join(', ') + ')' : ''};`;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `# Foreign Table Operations: ${item.schema}.${item.label}\n\nThis notebook contains operations for managing the PostgreSQL foreign table:
- View table definition
- Query data
- Edit table definition
- Drop table`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Current table definition\n${createTableStatement}`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Query data
SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Edit table (requires dropping and recreating)
DROP FOREIGN TABLE IF EXISTS ${item.schema}.${item.label};

CREATE FOREIGN TABLE ${item.schema}.${item.label} (
    -- Define columns here
    column_name data_type
) SERVER server_name
OPTIONS (
    schema_name 'remote_schema',
    table_name 'remote_table'
);`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop table
DROP FOREIGN TABLE IF EXISTS ${item.schema}.${item.label};`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            await closeClient(client);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create foreign table operations notebook: ${err.message}`);
    }
}

/**
 * cmdEditForeignTable - Command to create a notebook for editing a foreign table
 * @param {DatabaseTreeItem} item - The selected foreign table item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdEditForeignTable(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const client = await createPgClient(connection, item.databaseName);

        try {
            const result = await client.query(FOREIGN_TABLE_DEF_QUERY, [item.label, item.schema]);
            if (result.rows.length === 0) {
                throw new Error('Foreign table not found');
            }

            const tableInfo = result.rows[0];
            const createStatement = `CREATE FOREIGN TABLE ${item.schema}.${item.label} (\n${tableInfo.columns.map((col: string) => '    ' + col).join(',\n')}\n) SERVER ${tableInfo.server_name}${tableInfo.options ? '\nOPTIONS (\n    ' + tableInfo.options.map((opt: string) => opt).join(',\n    ') + '\n)' : ''};`;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `# Edit Foreign Table: ${item.schema}.${item.label}\n\nModify the foreign table definition below and execute the cells to update it.`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop existing foreign table
DROP FOREIGN TABLE IF EXISTS ${item.schema}.${item.label};

-- Create foreign table with new definition
${createStatement}`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            await closeClient(client);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create foreign table edit notebook: ${err.message}`);
    }
}