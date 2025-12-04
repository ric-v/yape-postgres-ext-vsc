import * as vscode from 'vscode';
import { getConnectionWithPassword } from '../commands/connection';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';

export async function cmdNewNotebook(item: DatabaseTreeItem) {
    if (!item) {
        vscode.window.showErrorMessage('Please select a database, schema, or table to create a notebook');
        return;
    }

    // Use ConnectionManager to get the connection details
    let connectionConfig;
    try {
        connectionConfig = await getConnectionWithPassword(item.connectionId!);
    } catch (error) {
        vscode.window.showErrorMessage('Connection not found or not configured.');
        return;
    }

    const metadata = {
        connectionId: item.connectionId,
        databaseName: item.databaseName || item.label,
        host: connectionConfig.host,
        port: connectionConfig.port,
        username: connectionConfig.username,
        password: connectionConfig.password
    };

    const notebookData = new vscode.NotebookData([
        new vscode.NotebookCellData(vscode.NotebookCellKind.Code, `-- Connected to database: ${metadata.databaseName}
--Write your SQL query here
SELECT * FROM ${item.schema ? `${item.schema}.${item.label}` : 'your_table'}
    LIMIT 100; `, 'sql')
    ]);
    notebookData.metadata = metadata;

    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
    await vscode.window.showNotebookDocument(notebook);
}