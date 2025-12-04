import * as vscode from 'vscode';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from '../commands/connection';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { ConnectionManager } from '../services/ConnectionManager';

/**
 * cmdEnableExtension - Command to create a notebook for enabling a PostgreSQL extension'
 * @param {DatabaseTreeItem} item - The selected extension item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdEnableExtension(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        // Get the connection details (not the pg.Client) for metadata
        const connectionDetails = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connectionDetails, item.databaseName);

        // Get the pg.Client from ConnectionManager
        const client = await ConnectionManager.getInstance().getConnection({
            id: connectionDetails.id,
            host: connectionDetails.host,
            port: connectionDetails.port,
            username: connectionDetails.username,
            database: item.databaseName,
            name: connectionDetails.name
        });

        try {
            // Extract extension name from label (removes version info)
            const extensionName = item.label.split(' ')[0];

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Enable Extension: \`${extensionName}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Execute the cell below to enable the PostgreSQL extension. This will install the extension in the current database.
</div>
${item.comment ? `<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;"><strong>ℹ️ Description:</strong> ${item.comment}</div>` : ''}`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔌 Enable Command`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Enable extension\nCREATE EXTENSION IF NOT EXISTS "${extensionName}"; `,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager, no need to close explicitly here
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create extension notebook: ${err.message} `);
    }
}

/**
 * cmdExtensionOperations - Command to create a notebook for common operations on a PostgreSQL extension.
 * @param {DatabaseTreeItem} item - The selected extension item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdExtensionOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connectionDetails = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connectionDetails, item.databaseName);

        const client = await ConnectionManager.getInstance().getConnection({
            id: connectionDetails.id,
            host: connectionDetails.host,
            port: connectionDetails.port,
            username: connectionDetails.username,
            database: item.databaseName,
            name: connectionDetails.name
        });

        try {
            // Extract extension name from label (removes version info)
            const extensionName = item.label.split(' ')[0];

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Extension Operations: \`${extensionName}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> This notebook contains common operations for managing PostgreSQL extensions. Run the cells below to execute the operations.
</div>
${item.comment ? `<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;"><strong>ℹ️ Description:</strong> ${item.comment}</div>` : ''}

#### 🎯 Available Operations

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Operation</th><th style="text-align: left;">Description</th></tr>
    <tr><td><strong>Enable Extension</strong></td><td>Install the extension</td></tr>
    <tr><td><strong>List Objects</strong></td><td>Show objects created by this extension</td></tr>
    <tr><td><strong>Drop Extension</strong></td><td>Remove the extension</td></tr>
</table>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔌 Enable Extension`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Enable extension\nCREATE EXTENSION IF NOT EXISTS "${extensionName}"; `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📦 Extension Objects`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- List objects created by extension\nSELECT * FROM pg_catalog.pg_depend d
    JOIN pg_catalog.pg_extension e ON d.refobjid = e.oid
    JOIN pg_catalog.pg_class c ON d.objid = c.oid
    WHERE e.extname = '${extensionName}'
    AND d.deptype = 'e'; `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop Extension`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop extension\nDROP EXTENSION IF EXISTS "${extensionName}"; `,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create extension operations notebook: ${err.message} `);
    }
}

/**
 * cmdDropExtension - Command to create a notebook for dropping a PostgreSQL extension.
 * @param {DatabaseTreeItem} item - The selected extension item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdDropExtension(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connectionDetails = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connectionDetails, item.databaseName);

        const client = await ConnectionManager.getInstance().getConnection({
            id: connectionDetails.id,
            host: connectionDetails.host,
            port: connectionDetails.port,
            username: connectionDetails.username,
            database: item.databaseName,
            name: connectionDetails.name
        });

        try {
            // Extract extension name from label (removes version info)
            const extensionName = item.label.split(' ')[0];

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Drop Extension: \`${extensionName}\`

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>🛑 Caution:</strong> This action will remove the PostgreSQL extension and all its objects. This operation cannot be undone.
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
                    `-- Drop extension\nDROP EXTENSION IF EXISTS "${extensionName}" CASCADE; `,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create drop extension notebook: ${err.message} `);
    }
}

/**
 * cmdRefreshExtension - Refreshes the extension item in the tree view.
 */
export async function cmdRefreshExtension(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    databaseTreeProvider?.refresh(item);
}