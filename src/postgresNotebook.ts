import * as vscode from 'vscode';
import { Client } from 'pg';
import { getConnectionWithPassword, createPgClient } from './subscriptions/connection';

export class PostgresNotebookSerializer implements vscode.NotebookSerializer {
    private static _context: vscode.ExtensionContext;

    public static initialize(context: vscode.ExtensionContext) {
        PostgresNotebookSerializer._context = context;
    }

    private async getContext(): Promise<vscode.ExtensionContext> {
        if (!PostgresNotebookSerializer._context) {
            throw new Error('PostgresNotebookSerializer not initialized');
        }
        return PostgresNotebookSerializer._context;
    }

    async deserializeNotebook(
        content: Uint8Array,
        _token: vscode.CancellationToken
    ): Promise<vscode.NotebookData> {
        const contents = new TextDecoder().decode(content);
        let raw: any;
        try {
            raw = JSON.parse(contents);
        } catch {
            raw = { cells: [], metadata: {} };
        }

        const cells = raw.cells.map((item: any) => {
            const cell = new vscode.NotebookCellData(
                item.kind === 'markdown' ? vscode.NotebookCellKind.Markup : vscode.NotebookCellKind.Code,
                item.value,
                item.kind === 'markdown' ? 'markdown' : 'sql'
            );
            cell.metadata = raw.metadata?.custom?.metadata || {};
            return cell;
        });

        const notebookData = new vscode.NotebookData(cells);
        notebookData.metadata = raw.metadata || {};
        return notebookData;
    }

    async serializeNotebook(
        data: vscode.NotebookData,
        _token: vscode.CancellationToken
    ): Promise<Uint8Array> {
        const cells = data.cells.map(cell => ({
            kind: cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'sql',
            value: cell.value,
            language: cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'sql',
            metadata: cell.metadata
        }));

        const content = {
            cells,
            metadata: {
                ...data.metadata,
                custom: {
                    cells: cells,
                    metadata: {
                        ...data.metadata,
                        enableScripts: true
                    }
                }
            }
        };

        return new TextEncoder().encode(JSON.stringify(content));
    }

    async executeCell(notebook: vscode.NotebookDocument, cell: vscode.NotebookCell): Promise<vscode.NotebookCellOutput[]> {
        const metadata = notebook.metadata as any;
        if (!metadata?.connectionId) {
            throw new Error('No connection specified');
        }

        const context = await this.getContext();
        const connection = await getConnectionWithPassword(metadata.connectionId, context);

        // Use the database from notebook metadata, cell metadata, or fall back to postgres
        const databaseName = cell.metadata?.databaseName || metadata?.databaseName || connection.database || 'postgres';
        
        let client: Client | undefined;
        try {
            client = await createPgClient(connection, databaseName);
            
            const result = await client.query(cell.document.getText());
            
            return [
                new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.json(result.rows, 'x-application/postgres-result')
                ])
            ];
        } catch (error: any) {
            // Create an error output
            return [
                new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.error({
                        name: 'PostgreSQL Error',
                        message: error?.message || 'Unknown error occurred'
                    })
                ])
            ];
        } finally {
            if (client) {
                await client.end();
            }
        }
    }
}
