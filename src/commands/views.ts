import * as vscode from 'vscode';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from '../commands/connection';
import { ConnectionManager } from '../services/ConnectionManager';
import { TablePropertiesPanel } from '../tableProperties';

/**
 * SQL query to get the view definition from PostgreSQL.
 */

/**
 * VIEW_DEFINITION_QUERY - SQL query to get the view definition from PostgreSQL.
 * fetches - the view definition from the database.
 */
const VIEW_DEFINITION_QUERY = `SELECT pg_get_viewdef($1:: regclass, true) as definition`;

/**
 * viewEditCmd - Command to edit a PostgreSQL view in a notebook.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdEditView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const viewResult = await client.query(VIEW_DEFINITION_QUERY, [`${item.schema}.${item.label} `]);
            if (!viewResult.rows[0]?.definition) {
                throw new Error('View definition not found');
            }

            const createViewStatement = `CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS\n${viewResult.rows[0].definition} `;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Edit View: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the view definition below and execute the cell to update the view.
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
                    createViewStatement,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create view edit notebook: ${err.message} `);
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
                `-- View data
SELECT *
    FROM ${item.schema}.${item.label}
LIMIT 100; `,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create view data notebook: ${err.message} `);
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
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Drop View: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>🛑 Caution:</strong> This action will permanently delete the view. This operation cannot be undone.
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
                `-- Drop view
DROP VIEW IF EXISTS ${item.schema}.${item.label}; `,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create drop view notebook: ${err.message} `);
    }
}

/**
 * viewOperationsCmd - Command to create a notebook for common operations on a PostgreSQL view.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdViewOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const viewResult = await client.query(VIEW_DEFINITION_QUERY, [`${item.schema}.${item.label} `]);
            if (!viewResult.rows[0]?.definition) {
                throw new Error('View definition not found');
            }

            const viewDefinition = `CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS\n${viewResult.rows[0].definition} `;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### View Operations: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> This notebook contains common operations for the PostgreSQL view. Run the cells below to execute the operations.
</div>

#### 🎯 Available Operations

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Operation</th><th style="text-align: left;">Description</th></tr>
    <tr><td><strong>View Definition</strong></td><td>Show the CREATE VIEW statement</td></tr>
    <tr><td><strong>Query Data</strong></td><td>Select the first 100 rows</td></tr>
    <tr><td><strong>Modify Definition</strong></td><td>Template for updating the view</td></tr>
    <tr><td><strong>Drop</strong></td><td>Delete the view (Warning: Irreversible)</td></tr>
</table>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 View Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- View definition\n${viewDefinition} `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📖 Query Data`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Query view data
SELECT *
    FROM ${item.schema}.${item.label}
LIMIT 100; `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ✏️ Modify Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Modify view definition
CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS
SELECT * FROM source_table
WHERE condition; `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop View`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop view
DROP VIEW ${item.schema}.${item.label}; `,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create view operations notebook: ${err.message} `);
    }
}

/**
 * Show properties of a PostgreSQL view.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the properties are shown.
 */
export async function cmdShowViewProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            await TablePropertiesPanel.show(client, item.schema, item.label, true);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to show view properties: ${err.message} `);
    }
}

/**
 * cmdRefreshView - Refreshes the view item in the tree view.
 */
export async function cmdRefreshView(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    databaseTreeProvider?.refresh(item);
}

/**
 * cmdCreateView - Command to create a new view in the database.
 */
export async function cmdCreateView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Create New View in Schema: \`${item.schema}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the view definition below and execute the cell to create the view.
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
                `-- Create new view
CREATE OR REPLACE VIEW ${item.schema}.view_name AS
SELECT 
    column1, 
    column2
FROM 
    source_table
WHERE 
    condition;

-- Add comment
COMMENT ON VIEW ${item.schema}.view_name IS 'View description';`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create view notebook: ${err.message}`);
    }
}