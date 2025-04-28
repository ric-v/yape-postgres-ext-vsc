import { Client } from 'pg';
import * as vscode from 'vscode';
import { DatabaseTreeItem } from "../databaseTreeProvider";
import { closeClient, createAndShowNotebook, createMetadata, createPgClient, getConnectionWithPassword, validateItem } from './connection';

/**
 * cmdEnableExtension - Command to create a notebook for enabling a PostgreSQL extension'
 * @param {DatabaseTreeItem} item - The selected extension item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdEnableExtension(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const metadata = createMetadata(connection, item.databaseName);
        let client: Client | undefined;

        try {
            client = await createPgClient(connection, item.databaseName);
            // Extract extension name from label (removes version info)
            const extensionName = item.label.split(' ')[0];

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `# Enable Extension: ${extensionName}\n\nExecute the cell below to enable the PostgreSQL extension. This will install the extension in the current database.${item.comment ? `\n\n**Description:** ${item.comment}` : ''}`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Enable extension\nCREATE EXTENSION IF NOT EXISTS "${extensionName}";`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            await closeClient(client);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create extension notebook: ${err.message}`);
    }
}

/**
 * cmdAllExtensionOperations - Command to create a notebook for common operations on a PostgreSQL extension.
 * @param {DatabaseTreeItem} item - The selected extension item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdExtensionOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const metadata = createMetadata(connection, item.databaseName);

        // Extract extension name from label (removes version info)
        const extensionName = item.label.split(' ')[0];

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Extension Operations: ${extensionName}\n\nThis notebook contains common operations for managing PostgreSQL extensions:
    - Enable/create extension
    - List extension objects
    - Drop extension${item.comment ? `\n\n**Description:** ${item.comment}` : ''}`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Enable extension\nCREATE EXTENSION IF NOT EXISTS "${extensionName}";`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- List objects created by extension\nSELECT * FROM pg_catalog.pg_depend d
    JOIN pg_catalog.pg_extension e ON d.refobjid = e.oid
    JOIN pg_catalog.pg_class c ON d.objid = c.oid
    WHERE e.extname = '${extensionName}'
    AND d.deptype = 'e';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Drop extension\nDROP EXTENSION IF EXISTS "${extensionName}";`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create extension operations notebook: ${err.message}`);
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
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const metadata = createMetadata(connection, item.databaseName);

        // Extract extension name from label (removes version info)
        const extensionName = item.label.split(' ')[0];

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Drop Extension: ${extensionName}\n\n⚠️ **Warning:** This action will remove the PostgreSQL extension and all its objects. This operation cannot be undone.`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Drop extension\nDROP EXTENSION IF EXISTS "${extensionName}" CASCADE;`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create drop extension notebook: ${err.message}`);
    }
}