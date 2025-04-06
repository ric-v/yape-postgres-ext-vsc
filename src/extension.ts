import * as vscode from 'vscode';
import { Client } from 'pg';
import { ConnectionFormPanel } from './connectionForm';
import { DatabaseTreeProvider, DatabaseTreeItem } from './databaseTreeProvider';
import { TablePropertiesPanel } from './tableProperties';
import { PostgresNotebookProvider } from './notebookProvider';
import { PostgresKernel } from './notebookKernel';
import { PostgresNotebookSerializer } from './postgresNotebook';

export function activate(context: vscode.ExtensionContext) {
    // Register notebook kernel
    const kernel = new PostgresKernel();
    context.subscriptions.push(kernel);
    const databaseTreeProvider = new DatabaseTreeProvider();
    
    // Register notebook provider
    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer('postgres-notebook', new PostgresNotebookProvider())
    );

    // Register notebook serializer
    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer('postgres-query', new PostgresNotebookSerializer())
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.addConnection', () => {
            // Show connection form when + button is clicked
            ConnectionFormPanel.show(context.extensionUri);
        })
    );

    // Add the + button to the view title
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('postgresExplorer', databaseTreeProvider)
    );

    // Register view container
    const treeView = vscode.window.createTreeView('postgresExplorer', {
        treeDataProvider: databaseTreeProvider,
        showCollapseAll: true
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.refreshConnections', () => {
            databaseTreeProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.showTableProperties', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid table selection');
                return;
            }

            const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
            const connection = connections.find(c => c.id === item.connectionId);
            if (!connection) {
                vscode.window.showErrorMessage('Connection not found');
                return;
            }

            let client: Client | undefined;
            try {
                client = new Client({
                    host: connection.host,
                    port: connection.port,
                    user: connection.username,
                    password: String(connection.password),
                    database: item.databaseName || connection.database,
                    connectionTimeoutMillis: 5000
                });

                await client.connect();
                
                // Pass the connected client to TablePropertiesPanel
                await TablePropertiesPanel.show(client, item.schema!, item.label);
            } catch (err: any) {
                const errorMessage = err?.message || 'Unknown error occurred';
                vscode.window.showErrorMessage(`Failed to show table properties: ${errorMessage}`);
                
                if (client) {
                    try {
                        await client.end();
                    } catch (closeErr) {
                        console.error('Error closing connection:', closeErr);
                    }
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.connect', async () => {
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
                databaseTreeProvider.refresh();
                await client.end();
            } catch (err: any) {
                const errorMessage = err?.message || 'Unknown error occurred';
                vscode.window.showErrorMessage(`Failed to connect: ${errorMessage}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.disconnect', async () => {
            databaseTreeProvider.refresh();
            vscode.window.showInformationMessage('Disconnected from PostgreSQL database');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.refresh', () => {
            databaseTreeProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.queryTable', async (item: any) => {
            if (!item || !item.schema) {
                return;
            }

            const query = `SELECT * FROM ${item.schema}.${item.label} LIMIT 100;`;
            const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', new vscode.NotebookData([
                new vscode.NotebookCellData(vscode.NotebookCellKind.Code, query, 'sql')
            ]));
            await vscode.window.showNotebookDocument(notebook);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.newNotebook', async (item: any) => {
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

            // Create notebook with connection metadata
            const metadata = {
                connectionId: item.connectionId,
                databaseName: item.databaseName || item.label,
                host: connection.host,
                port: connection.port,
                username: connection.username,
                password: connection.password
            };

            const notebookData = new vscode.NotebookData([
                new vscode.NotebookCellData(vscode.NotebookCellKind.Code, `-- Connected to database: ${metadata.databaseName}
-- Write your SQL query here
SELECT * FROM ${item.schema ? `${item.schema}.${item.label}` : 'your_table'}
LIMIT 100;`, 'sql')
            ]);
            notebookData.metadata = metadata;

            const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
            await vscode.window.showNotebookDocument(notebook);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.deleteConnection', async (item: DatabaseTreeItem) => {
            const answer = await vscode.window.showWarningMessage(
                `Are you sure you want to delete connection '${item.label}'?`,
                'Yes', 'No'
            );
            
            if (answer === 'Yes') {
                const config = vscode.workspace.getConfiguration();
                const connections = config.get<any[]>('postgresExplorer.connections') || [];
                const updatedConnections = connections.filter(c => c.id !== item.connectionId);
                await config.update('postgresExplorer.connections', updatedConnections, vscode.ConfigurationTarget.Global);
                databaseTreeProvider.refresh();
            }
        })
    );
}

class PostgresExplorer implements vscode.TreeDataProvider<DatabaseItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseItem | undefined | null | void> = new vscode.EventEmitter<DatabaseItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DatabaseItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DatabaseItem): Promise<DatabaseItem[]> {
        const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
        if (connections.length === 0) {
            return [];
        }

        let client: Client | undefined;
        try {
            const connection = connections[0]; // Use the first connection for now
            client = new Client({
                host: connection.host,
                port: connection.port,
                user: connection.username,
                password: String(connection.password),
                database: connection.database
            });

            await client.connect();

            if (!element) {
                // Root level - show schemas
                const result = await client.query(
                    "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog')"
                );
                return result.rows.map(row => new DatabaseItem(
                    row.schema_name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'schema'
                ));
            }

            if (element.type === 'schema') {
                // Show tables in schema
                const result = await client.query(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1",
                    [element.label]
                );
                return result.rows.map(row => new DatabaseItem(
                    row.table_name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'table',
                    element.label as string
                ));
            }

            if (element.type === 'table') {
                // Show columns in table
                const result = await client.query(
                    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2",
                    [element.schema, element.label]
                );
                return result.rows.map(row => new DatabaseItem(
                    `${row.column_name} (${row.data_type})`,
                    vscode.TreeItemCollapsibleState.None,
                    'column'
                ));
            }

            return [];
        } catch (err: any) {
            vscode.window.showErrorMessage(`Database connection error: ${err.message}`);
            return [];
        } finally {
            if (client) {
                await client.end();
            }
        }
    }
}

class DatabaseItem extends vscode.TreeItem {
    contextValue?: string;
    tooltip: string;
    iconPath: any;
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'schema' | 'table' | 'column',
        public readonly schema?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = type;

        this.tooltip = this.label;
        this.iconPath = {
            schema: new vscode.ThemeIcon('database'),
            table: new vscode.ThemeIcon('table'),
            column: new vscode.ThemeIcon('symbol-field')
        }[type];
    }
}

export function deactivate() {
    // Remove client handling as it's now handled per request
}
