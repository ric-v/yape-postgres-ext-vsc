import * as vscode from 'vscode';
import { createPgClient, createMetadata, closeClient, createAndShowNotebook, validateItem, getConnectionWithPassword } from './connection';
import { DatabaseTreeItem } from '../databaseTreeProvider';

/**
 * SQL query to get the view definition from PostgreSQL.
 */

/**
 * VIEW_DEFINITION_QUERY - SQL query to get the view definition from PostgreSQL.
 * fetches - the view definition from the database.
 */
const VIEW_DEFINITION_QUERY = `SELECT pg_get_viewdef($1::regclass, true) as definition`;

/**
 * viewEditCmd - Command to edit a PostgreSQL view in a notebook.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdEditView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const client = await createPgClient(connection, item.databaseName);

        try {
            const viewResult = await client.query(VIEW_DEFINITION_QUERY, [`${item.schema}.${item.label}`]);
            if (!viewResult.rows[0]?.definition) {
                throw new Error('View definition not found');
            }

            const createViewStatement = `CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS\n${viewResult.rows[0].definition}`;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `# Edit View: ${item.schema}.${item.label}\n\nModify the view definition below and execute the cell to update the view.`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    createViewStatement,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            await closeClient(client);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create view edit notebook: ${err.message}`);
    }
}

/**
 * viewViewDataCmd - Command to view data from a PostgreSQL view in a notebook.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdViewData(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
                `-- View data
SELECT *
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

/**
 * viewDropCmd - Command to drop a PostgreSQL view in a notebook.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdDropView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Drop View: ${item.schema}.${item.label}\n\n⚠️ **Warning:** This action will permanently delete the view. This operation cannot be undone.`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Drop view
DROP VIEW IF EXISTS ${item.schema}.${item.label};`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create drop view notebook: ${err.message}`);
    }
}

/**
 * viewOperationsCmd - Command to create a notebook for common operations on a PostgreSQL view.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdAllViewOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const client = await createPgClient(connection, item.databaseName);

        try {
            const viewResult = await client.query(VIEW_DEFINITION_QUERY, [`${item.schema}.${item.label}`]);
            if (!viewResult.rows[0]?.definition) {
                throw new Error('View definition not found');
            }

            const viewDefinition = `CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS\n${viewResult.rows[0].definition}`;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `# View Operations: ${item.schema}.${item.label}\n\nThis notebook contains common operations for the PostgreSQL view:
- View definition
- Query view data
- Modify view definition
- Drop view`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- View definition\n${viewDefinition}`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Query view data
SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Modify view definition
CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS
SELECT * FROM source_table
WHERE condition;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop view
DROP VIEW ${item.schema}.${item.label};`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            await closeClient(client);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create view operations notebook: ${err.message}`);
    }
}