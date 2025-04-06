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
                conn.name || `${conn.host}:${conn.port}`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'connection',
                conn.id
            ));
        }

        const connection = connections.find(c => c.id === element.connectionId);
        if (!connection) return [];

        let client: Client | undefined;
        try {
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

            switch (element.type) {
                case 'connection':
                    const dbResult = await client.query(
                        "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres'"
                    );
                    return dbResult.rows.map(row => new DatabaseTreeItem(
                        row.datname,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'database',
                        element.connectionId,
                        row.datname
                    ));

                case 'database':
                    const schemaResult = await client.query(
                        "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog')"
                    );
                    return schemaResult.rows.map(row => new DatabaseTreeItem(
                        row.schema_name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'schema',
                        element.connectionId,
                        element.databaseName,
                        row.schema_name
                    ));

                case 'schema':
                    return [
                        new DatabaseTreeItem('Tables', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
                        new DatabaseTreeItem('Views', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
                        new DatabaseTreeItem('Functions', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema)
                    ];

                case 'category':
                    switch (element.label) {
                        case 'Tables':
                            const tableResult = await client.query(
                                "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",
                                [element.schema]
                            );
                            return tableResult.rows.map(row => new DatabaseTreeItem(
                                row.table_name,
                                vscode.TreeItemCollapsibleState.Collapsed,
                                'table',
                                element.connectionId,
                                element.databaseName,
                                element.schema
                            ));

                        case 'Views':
                            const viewResult = await client.query(
                                "SELECT table_name FROM information_schema.views WHERE table_schema = $1",
                                [element.schema]
                            );
                            return viewResult.rows.map(row => new DatabaseTreeItem(
                                row.table_name,
                                vscode.TreeItemCollapsibleState.Collapsed,
                                'view',
                                element.connectionId,
                                element.databaseName,
                                element.schema
                            ));

                        case 'Functions':
                            const functionResult = await client.query(
                                "SELECT routine_name FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'FUNCTION'",
                                [element.schema]
                            );
                            return functionResult.rows.map(row => new DatabaseTreeItem(
                                row.routine_name,
                                vscode.TreeItemCollapsibleState.None,
                                'function',
                                element.connectionId,
                                element.databaseName,
                                element.schema
                            ));
                    }
                    break;

                case 'table':
                case 'view':
                    const columnResult = await client.query(
                        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2",
                        [element.schema, element.label]
                    );
                    return columnResult.rows.map(row => new DatabaseTreeItem(
                        `${row.column_name} (${row.data_type})`,
                        vscode.TreeItemCollapsibleState.None,
                        'column',
                        element.connectionId,
                        element.databaseName,
                        element.schema
                    ));
            }

            return [];
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to get tree items: ${err.message}`);
            return [];
        } finally {
            if (client) {
                await client.end();
            }
        }
    }
}

export class DatabaseTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'connection' | 'database' | 'schema' | 'table' | 'view' | 'function' | 'column' | 'category',
        public readonly connectionId?: string,
        public readonly databaseName?: string,
        public readonly schema?: string,
        public readonly tableName?: string,
        public readonly columnName?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = type;
        this.iconPath = {
            connection: new vscode.ThemeIcon('server'),
            database: new vscode.ThemeIcon('database'),
            schema: new vscode.ThemeIcon('symbol-namespace'),
            table: new vscode.ThemeIcon('table'),
            view: new vscode.ThemeIcon('eye'),
            function: new vscode.ThemeIcon('symbol-method'),
            column: new vscode.ThemeIcon('symbol-field'),
            category: new vscode.ThemeIcon('folder')
        }[type];
    }
}
