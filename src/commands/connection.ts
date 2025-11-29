import { Client } from 'pg';
import * as vscode from 'vscode';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { PostgresMetadata } from '../common/types';
import { SecretStorageService } from '../services/SecretStorageService';
import { ConnectionManager } from '../services/ConnectionManager';

/**
 * createMetadata - Creates metadata for the PostgreSQL connection.
 */
export function createMetadata(connection: any, databaseName: string | undefined): PostgresMetadata {
    // Create the base metadata object
    const metadata = {
        connectionId: connection.id,
        databaseName: databaseName,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password
    };

    // Wrap it in the custom object structure expected by the notebook
    return {
        ...metadata,
        custom: {
            cells: [],
            metadata: {
                ...metadata,
                enableScripts: true
            }
        }
    };
}

/**
 * createAndShowNotebook - Creates and displays a notebook with the provided cells and metadata.
 */
export async function createAndShowNotebook(cells: vscode.NotebookCellData[], metadata: PostgresMetadata): Promise<void> {
    const notebookData = new vscode.NotebookData(cells);
    notebookData.metadata = metadata;
    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
    await vscode.window.showNotebookDocument(notebook);
}

/**
 * validateRoleItem - Validates the selected role item in the database tree.
 */
export function validateRoleItem(item: DatabaseTreeItem): asserts item is DatabaseTreeItem & { connectionId: string } {
    if (!item?.connectionId) {
        throw new Error('Invalid role selection');
    }
}

/**
 * validateItem - Validates the selected item in the database tree.
 */
export function validateItem(item: DatabaseTreeItem): asserts item is DatabaseTreeItem & { schema: string; connectionId: string } {
    if (!item?.schema || !item?.connectionId) {
        throw new Error('Invalid selection');
    }
}

/**
 * getConnectionWithPassword - Retrieves the connection details and password for the specified connection ID.
 */
export async function getConnectionWithPassword(connectionId: string): Promise<any> {
    const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
    const connection = connections.find(c => c.id === connectionId);

    if (!connection) {
        throw new Error('Connection not found');
    }

    const password = await SecretStorageService.getInstance().getPassword(connectionId);
    if (!password) {
        throw new Error('Password not found in secure storage');
    }

    return {
        ...connection,
        password
    };
}

export async function cmdDisconnectDatabase(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    const answer = await vscode.window.showWarningMessage(
        `Are you sure you want to delete connection '${item.label}'?`,
        'Yes', 'No'
    );

    if (answer === 'Yes') {
        try {
            const config = vscode.workspace.getConfiguration();
            const connections = config.get<any[]>('postgresExplorer.connections') || [];

            // Find the connection to verify it exists
            const connectionToDelete = connections.find(c => c.id === item.connectionId);
            if (!connectionToDelete) {
                vscode.window.showWarningMessage(`Connection '${item.label}' not found.`);
                return;
            }

            // Remove the connection info from settings
            const updatedConnections = connections.filter(c => c.id !== item.connectionId);
            await config.update('postgresExplorer.connections', updatedConnections, vscode.ConfigurationTarget.Global);

            // Remove the password from SecretStorage (if it exists)
            try {
                await SecretStorageService.getInstance().deletePassword(item.connectionId!);
            } catch (err) {
                // Password might not exist if connection was created without credentials
                console.log(`No password to delete for connection ${item.connectionId}`);
            }

            // Close any active connections in ConnectionManager
            try {
                await ConnectionManager.getInstance().closeConnection({
                    id: connectionToDelete.id,
                    host: connectionToDelete.host,
                    port: connectionToDelete.port,
                    username: connectionToDelete.username,
                    database: connectionToDelete.database
                });
            } catch (err) {
                // Connection might not be open, that's okay
                console.log(`No active connection to close for ${item.connectionId}`);
            }

            // Refresh the tree view
            databaseTreeProvider?.refresh();

            vscode.window.showInformationMessage(`Connection '${item.label}' has been deleted successfully.`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to delete connection: ${err.message}`);
            console.error('Delete connection error:', err);
        }
    }
}

export async function cmdDisconnectConnection(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    try {
        if (!item?.connectionId) {
            throw new Error('Invalid connection selection');
        }

        // Refresh the tree view which will collapse all items and close any open connections
        databaseTreeProvider?.refresh();
        vscode.window.showInformationMessage(`Disconnected from '${item.label}'`);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to disconnect: ${err.message}`);
    }
}

export async function cmdConnectDatabase(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    try {
        const connectionString = await vscode.window.showInputBox({
            prompt: 'Enter PostgreSQL connection string',
            placeHolder: 'postgresql://user:password@localhost:5432/dbname'
        });

        if (!connectionString) {
            return;
        }

        const client = new Client(connectionString);
        await client.connect();
        vscode.window.showInformationMessage('Connected to PostgreSQL database');
        databaseTreeProvider?.refresh();
        await client.end();
    } catch (err: any) {
        const errorMessage = err?.message || 'Unknown error occurred';
        vscode.window.showErrorMessage(`Failed to connect: ${errorMessage}`);
    }
}
