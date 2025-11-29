import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from '../commands/connection';
import { ConnectionManager } from '../services/ConnectionManager';

/**
 * SQL Queries for materialized view operations
 */

/**
 * MATVIEW_INFO_QUERY - Query to get materialized view details
 * fetches - definition, schema, name, owner, tablespace, indexes, populated status
 * from pg_matviews table
 */
const MATVIEW_INFO_QUERY = `
SELECT pg_get_viewdef($1::regclass, true) as definition,
       schemaname,
       matviewname,
       matviewowner,
       tablespace,
       hasindexes,
       ispopulated,
       pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, matviewname))) as size
FROM pg_matviews
WHERE schemaname = $2 AND matviewname = $3`;

/**
 * MATVIEW_DEF_QUERY - Query to get materialized view definition
 */
const MATVIEW_DEF_QUERY = `
SELECT pg_get_viewdef($1::regclass, true) as definition
FROM pg_matviews
WHERE schemaname = $2 AND matviewname = $3`;

export async function cmdRefreshMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Refresh Materialized View: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Execute the cell below to refresh the materialized view data.
</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔄 Refresh Command`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `REFRESH MATERIALIZED VIEW ${item.schema}.${item.label};`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create refresh materialized view notebook: ${err.message}`);
    }
}

export async function cmdEditMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const client = await ConnectionManager.getInstance().getConnection({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            database: item.databaseName,
            name: connection.name
        });

        try {
            const result = await client.query(MATVIEW_DEF_QUERY, [`${item.schema}.${item.label}`, item.schema, item.label]);
            if (!result.rows[0]?.definition) {
                throw new Error('Materialized view definition not found');
            }

            const createMatViewStatement = `CREATE MATERIALIZED VIEW ${item.schema}.${item.label} AS\n${result.rows[0].definition}`;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Edit Materialized View: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the materialized view definition below and execute the cell to update it.
</div>

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>⚠️ Warning:</strong> This will drop and recreate the materialized view.
</div>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 View Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};\n\n${createMatViewStatement}\nWITH DATA;`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create materialized view edit notebook: ${err.message}`);
    }
}

export async function cmdViewMatViewData(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### View Data: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the query below to filter or transform the data as needed.
</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📖 Query Data`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create view data notebook: ${err.message}`);
    }
}

export async function cmdViewMatViewProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const client = await ConnectionManager.getInstance().getConnection({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            database: item.databaseName,
            name: connection.name
        });

        try {
            const result = await client.query(MATVIEW_INFO_QUERY, [`${item.schema}.${item.label}`, item.schema, item.label]);
            if (result.rows.length === 0) {
                throw new Error('Materialized view not found');
            }

            const matview = result.rows[0];
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `# Materialized View Properties: ${item.schema}.${item.label}

**Basic Information:**
- Owner: ${matview.matviewowner}
- Size: ${matview.size}
- Has Indexes: ${matview.hasindexes ? 'Yes' : 'No'}
- Is Populated: ${matview.ispopulated ? 'Yes' : 'No'}
${matview.tablespace ? `- Tablespace: ${matview.tablespace}` : ''}

**Definition:**`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    matview.definition,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to show materialized view properties: ${err.message}`);
    }
}

export async function cmdDropMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Drop Materialized View: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>🛑 Caution:</strong> This action will permanently delete the materialized view. This operation cannot be undone.
</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ❌ Drop Command`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Drop materialized view
DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create drop materialized view notebook: ${err.message}`);
    }
}

export async function cmdMatViewOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const client = await ConnectionManager.getInstance().getConnection({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            database: item.databaseName,
            name: connection.name
        });

        try {
            const result = await client.query(MATVIEW_INFO_QUERY, [`${item.schema}.${item.label}`, item.schema, item.label]);
            if (result.rows.length === 0) {
                throw new Error('Materialized view not found');
            }

            const matview = result.rows[0];
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Materialized View Properties: \`${item.schema}.${item.label}\`

<table style="font-size: 11px; width: 100%; border-collapse: collapse; margin-bottom: 15px;">
    <tr><td style="font-weight: bold; width: 120px;">Owner:</td><td>${matview.matviewowner}</td></tr>
    <tr><td style="font-weight: bold;">Size:</td><td>${matview.size}</td></tr>
    <tr><td style="font-weight: bold;">Has Indexes:</td><td>${matview.hasindexes ? 'Yes' : 'No'}</td></tr>
    <tr><td style="font-weight: bold;">Is Populated:</td><td>${matview.ispopulated ? 'Yes' : 'No'}</td></tr>
    ${matview.tablespace ? `<tr><td style="font-weight: bold;">Tablespace:</td><td>${matview.tablespace}</td></tr>` : ''}
</table>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    matview.definition,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📖 Query Data`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Query materialized view data
SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔄 Refresh Data`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Refresh materialized view data
REFRESH MATERIALIZED VIEW ${item.schema}.${item.label};`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop View`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop materialized view
DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create materialized view operations notebook: ${err.message}`);
    }
}

/**
 * cmdCreateMaterializedView - Command to create a new materialized view in the database.
 */
export async function cmdCreateMaterializedView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Create New Materialized View in Schema: \`${item.schema}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the definition below and execute the cell to create the materialized view.
</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 Materialized View Definition`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create new materialized view
CREATE MATERIALIZED VIEW ${item.schema}.matview_name AS
SELECT 
    column1, 
    column2
FROM 
    source_table
WHERE 
    condition
WITH DATA;

-- Add index (recommended for materialized views)
CREATE INDEX idx_matview_name_column1 ON ${item.schema}.matview_name(column1);

-- Add comment
COMMENT ON MATERIALIZED VIEW ${item.schema}.matview_name IS 'Materialized view description';`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create materialized view notebook: ${err.message}`);
    }
}