import * as vscode from 'vscode';
import { DatabaseTreeItem } from "../databaseTreeProvider";

export async function cmdNewNotebook(item: DatabaseTreeItem) {
    if (!item) {
        vscode.window.showErrorMessage('Please select a database, schema, or table to create a notebook');
        return;
    }

    const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
    const connection = connections.find(c => c.id === item.connectionId);
    if (!connection) {
        vscode.window.showErrorMessage('Connection not found');
        return;
    }

    const metadata = {
        connectionId: item.connectionId,
        databaseName: item.databaseName || item.label,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password,
        custom: {
            cells: [],
            metadata: {
                connectionId: item.connectionId,
                databaseName: item.databaseName || item.label,
                host: connection.host,
                port: connection.port,
                username: connection.username,
                password: connection.password,
                enableScripts: true
            }
        }
    };

    const notebookData = new vscode.NotebookData([
        new vscode.NotebookCellData(
            vscode.NotebookCellKind.Code,
            `-- Connected to database: ${metadata.databaseName}\n-- Write your SQL query here\nSELECT * FROM ${item.schema ? `${item.schema}.${item.label}` : 'your_table'}\nLIMIT 100;`,
            'sql'
        )
    ]);
    notebookData.metadata = metadata;

    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
    await vscode.window.showNotebookDocument(notebook);
}