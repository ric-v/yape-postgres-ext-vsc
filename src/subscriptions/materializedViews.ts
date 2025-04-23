import * as vscode from 'vscode';
import { closeClient, createAndShowNotebook, createMetadata, createPgClient, getConnectionWithPassword, validateItem } from './connection';
import { DatabaseTreeItem } from '../databaseTreeProvider';

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
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Refresh Materialized View: ${item.schema}.${item.label}\n\nExecute the cell below to refresh the materialized view data.`,
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
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const client = await createPgClient(connection, item.databaseName);

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
                    `# Edit Materialized View: ${item.schema}.${item.label}\n\nModify the materialized view definition below and execute the cell to update it. Note that this will drop and recreate the materialized view.`,
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
            await closeClient(client);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create materialized view edit notebook: ${err.message}`);
    }
}

export async function cmdViewMatViewData(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# View Data: ${item.schema}.${item.label}\n\nModify the query below to filter or transform the data as needed.`,
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
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const client = await createPgClient(connection, item.databaseName);

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
            await closeClient(client);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to show materialized view properties: ${err.message}`);
    }
}

export async function cmdDropMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Drop Materialized View: ${item.schema}.${item.label}\n\n⚠️ **Warning:** This action will permanently delete the materialized view. This operation cannot be undone.`,
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

export async function cmdAllOperationsMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const client = await createPgClient(connection, item.databaseName);

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
                    `# Materialized View Operations: ${item.schema}.${item.label}

**Properties:**
- Owner: ${matview.matviewowner}
- Size: ${matview.size}
- Has Indexes: ${matview.hasindexes ? 'Yes' : 'No'}
- Is Populated: ${matview.ispopulated ? 'Yes' : 'No'}
${matview.tablespace ? `- Tablespace: ${matview.tablespace}` : ''}

Below are common operations for this materialized view:
- View/edit definition
- Query data
- Refresh data
- Drop materialized view`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Current materialized view definition
CREATE MATERIALIZED VIEW ${item.schema}.${item.label} AS
${matview.definition};`,
                    'sql'
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
                    vscode.NotebookCellKind.Code,
                    `-- Refresh materialized view data
REFRESH MATERIALIZED VIEW ${item.schema}.${item.label};`,
                    'sql'
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
            await closeClient(client);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create materialized view operations notebook: ${err.message}`);
    }
}