import * as vscode from 'vscode';
import { Client } from 'pg';
import { ConnectionFormPanel } from './connectionForm';
import { DatabaseTreeProvider, DatabaseTreeItem } from './databaseTreeProvider';
import { TablePropertiesPanel } from './tableProperties';
import { PostgresNotebookProvider } from './notebookProvider';
import { PostgresKernel } from './notebookKernel';
import { PostgresNotebookSerializer } from './postgresNotebook';

export function activate(context: vscode.ExtensionContext) {
    console.log('postgres-explorer: Activating extension');
    
    // Create kernel with message handler to handle notebook cell output messages
    const kernel = new PostgresKernel((message) => {
        console.log('Extension: Received message from kernel:', message);
        if (message.type === 'custom' && message.command === 'export') {
            console.log('Extension: Handling export command');
            vscode.commands.executeCommand('postgres-explorer.exportData', {
                format: message.format,
                content: message.content,
                filename: message.filename
            });
        }
    });
    context.subscriptions.push(kernel);

    // Register global command to handle exports
    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.exportData', async (args) => {
            console.log('Extension: Export command triggered with args:', args);
            try {
                const { format, content, filename } = args;
                const saveUri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(filename),
                    filters: {
                        'CSV files': ['csv'],
                        'Excel files': ['xls', 'xlsx']
                    },
                    saveLabel: `Export as ${format.toUpperCase()}`
                });

                console.log('Extension: Save dialog result:', saveUri?.fsPath);
                if (saveUri) {
                    console.log('Extension: Writing file content, size:', content.length);
                    await vscode.workspace.fs.writeFile(
                        saveUri,
                        Buffer.from(content, 'utf-8')
                    );
                    console.log('Extension: File written successfully');
                    vscode.window.showInformationMessage(
                        `Successfully exported to ${saveUri.fsPath}`
                    );
                }
            } catch (err: any) {
                console.error('Extension: Export failed:', err);
                vscode.window.showErrorMessage(`Export failed: ${err.message}`);
            }
        })
    );

    // Register save file command
    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.saveFile', async (args) => {
            try {
                console.log('Saving file with args:', args);
                const { content, filename, type } = args;
                
                const saveUri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(filename),
                    filters: {
                        'CSV files': ['csv'],
                        'Excel files': ['xls', 'xlsx']
                    },
                    saveLabel: `Export as ${type.toUpperCase()}`
                });

                if (saveUri) {
                    await vscode.workspace.fs.writeFile(
                        saveUri,
                        Buffer.from(content)
                    );
                    vscode.window.showInformationMessage(`Successfully exported to ${saveUri.fsPath}`);
                }
            } catch (err: any) {
                console.error('Save file failed:', err);
                vscode.window.showErrorMessage(`Export failed: ${err.message}`);
            }
        })
    );

    const databaseTreeProvider = new DatabaseTreeProvider();
    
    // Register notebook provider
    const notebookProvider = new PostgresNotebookProvider();
    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer('postgres-notebook', notebookProvider)
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
            if (!element) {
                // Root level - show connections
                return connections.map(conn => new DatabaseItem(
                    conn.name || `${conn.host}:${conn.port}`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'connection',
                    undefined,
                    undefined,
                    conn.id
                ));
            }

            // Find the connection details
            const connection = connections.find(c => c.id === element.connectionId);
            if (!connection) {
                return [];
            }

            // Connect to appropriate database based on the tree level
            const dbName = element.type === 'connection' ? 'postgres' : element.databaseName;
            client = new Client({
                host: connection.host,
                port: connection.port,
                user: connection.username,
                password: String(connection.password),
                database: dbName,
                connectionTimeoutMillis: 5000
            });
            await client.connect();

            if (element.type === 'connection') {
                // Show databases under connection
                const result = await client.query(
                    "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres'"
                );
                return result.rows.map(row => new DatabaseItem(
                    row.datname,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'database',
                    undefined,
                    row.datname,
                    element.connectionId
                ));
            }

            if (element.type === 'database') {
                // Show schemas under database
                const result = await client.query(
                    "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog')"
                );
                return result.rows.map(row => new DatabaseItem(
                    row.schema_name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'schema',
                    row.schema_name,
                    element.databaseName,
                    element.connectionId
                ));
            }

            if (element.type === 'schema') {
                // Show categories under schema
                return [
                    new DatabaseItem('Tables', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.label, element.databaseName, element.connectionId),
                    new DatabaseItem('Views', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.label, element.databaseName, element.connectionId),
                    new DatabaseItem('Functions', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.label, element.databaseName, element.connectionId)
                ];
            }

            if (element.type === 'category') {
                if (element.label === 'Tables') {
                    const result = await client.query(
                        "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",
                        [element.schema]
                    );
                    return result.rows.map(row => new DatabaseItem(
                        row.table_name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'table',
                        element.schema,
                        element.databaseName,
                        element.connectionId
                    ));
                }
                
                if (element.label === 'Views') {
                    const result = await client.query(
                        "SELECT table_name FROM information_schema.views WHERE table_schema = $1",
                        [element.schema]
                    );
                    return result.rows.map(row => new DatabaseItem(
                        row.table_name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'view',
                        element.schema,
                        element.databaseName,
                        element.connectionId
                    ));
                }
                
                if (element.label === 'Functions') {
                    const result = await client.query(
                        `SELECT routine_name 
                         FROM information_schema.routines 
                         WHERE routine_schema = $1 
                         AND routine_type = 'FUNCTION'`,
                        [element.schema]
                    );
                    return result.rows.map(row => new DatabaseItem(
                        row.routine_name,
                        vscode.TreeItemCollapsibleState.None,
                        'function',
                        element.schema,
                        element.databaseName,
                        element.connectionId
                    ));
                }
            }

            if (element.type === 'table' || element.type === 'view') {
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
            vscode.window.showErrorMessage(`Database error: ${err.message}`);
            return [];
        } finally {
            if (client) {
                await client.end();
            }
        }
    }
}

class DatabaseItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'connection' | 'database' | 'schema' | 'table' | 'column' | 'category' | 'function' | 'view',
        public readonly schema?: string,
        public readonly databaseName?: string,
        public readonly connectionId?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = type;
        this.tooltip = this.label;
        this.iconPath = {
            connection: new vscode.ThemeIcon('plug'),
            database: new vscode.ThemeIcon('database'),
            schema: new vscode.ThemeIcon('symbol-namespace'),
            table: new vscode.ThemeIcon('table'),
            column: new vscode.ThemeIcon('symbol-field'),
            category: new vscode.ThemeIcon('list-tree'),
            function: new vscode.ThemeIcon('symbol-method'),
            view: new vscode.ThemeIcon('type-hierarchy-sub')
        }[type];
    }
}

export function deactivate() {
    // Remove client handling as it's now handled per request
}
