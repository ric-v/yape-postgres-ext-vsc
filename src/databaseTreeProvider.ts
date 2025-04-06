import * as vscode from 'vscode';
import { Client } from 'pg';
import { ConnectionInfo } from './connectionForm';

export class DatabaseTreeProvider implements vscode.TreeDataProvider<DatabaseTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseTreeItem | undefined | null | void> = new vscode.EventEmitter<DatabaseTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {
        // Initialize tree provider
    }

    refresh(element?: DatabaseTreeItem): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DatabaseTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
        const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];

        if (!element) {
            // Root level - show connections
            return connections.map(conn => new DatabaseTreeItem(
                conn.name,
                vscode.TreeItemCollapsibleState.Collapsed,
                'connection',
                conn.id
            ));
        }

        if (element.type === 'connection') {
            const connection = connections.find(c => c.id === element.connectionId);
            if (!connection) return [];

            try {
                const client = new Client({
                    host: connection.host,
                    port: connection.port,
                    user: connection.username,
                    password: String(connection.password),
                    database: 'postgres'
                });

                await client.connect();
                const result = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
                await client.end();

                return result.rows.map(row => new DatabaseTreeItem(
                    row.datname,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'database',
                    element.connectionId,
                    row.datname
                ));
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to list databases: ${err.message}`);
                return [];
            }
        }

        if (element.type === 'database') {
            const connection = connections.find(c => c.id === element.connectionId);
            if (!connection) return [];

            try {
                const client = new Client({
                    host: connection.host,
                    port: connection.port,
                    user: connection.username,
                    password: String(connection.password),
                    database: element.databaseName
                });

                await client.connect();
                const result = await client.query(
                    "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog')"
                );
                await client.end();

                return result.rows.map(row => new DatabaseTreeItem(
                    row.schema_name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'schema',
                    element.connectionId,
                    element.databaseName,
                    row.schema_name
                ));
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to list schemas: ${err.message}`);
                return [];
            }
        }

        if (element.type === 'schema') {
            const connection = connections.find(c => c.id === element.connectionId);
            if (!connection) return [];

            try {
                const client = new Client({
                    host: connection.host,
                    port: connection.port,
                    user: connection.username,
                    password: String(connection.password),
                    database: element.databaseName
                });

                await client.connect();
                const result = await client.query(
                    'SELECT table_name FROM information_schema.tables WHERE table_schema = $1',
                    [element.schema]
                );
                await client.end();

                return result.rows.map(row => new DatabaseTreeItem(
                    row.table_name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'table',
                    element.connectionId,
                    element.databaseName,
                    element.schema
                ));
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to list tables: ${err.message}`);
                return [];
            }
        }

        return [];
    }
}

export class DatabaseTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'connection' | 'database' | 'schema' | 'table' | 'column',
        public readonly connectionId?: string,
        public readonly databaseName?: string,
        public readonly schema?: string,
        public readonly tableName?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = type;
        this.iconPath = {
            connection: new vscode.ThemeIcon('server'),
            database: new vscode.ThemeIcon('database'),
            schema: new vscode.ThemeIcon('symbol-namespace'),
            table: new vscode.ThemeIcon('table'),
            column: new vscode.ThemeIcon('symbol-field')
        }[type];
    }
}
