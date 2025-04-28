import { Client } from 'pg';
import * as vscode from 'vscode';

export class DatabaseTreeProvider implements vscode.TreeDataProvider<DatabaseTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatabaseTreeItem | undefined | null | void> = new vscode.EventEmitter<DatabaseTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DatabaseTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private readonly extensionContext: vscode.ExtensionContext) {
        // Initialize tree provider
    }

    refresh(element?: DatabaseTreeItem): void {
        this._onDidChangeTreeData.fire();
    }

    collapseAll(): void {
        // This will trigger a refresh of the tree view with all items collapsed
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DatabaseTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DatabaseTreeItem): Promise<DatabaseTreeItem[]> {
        const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];

        if (!element) {
            // Root level - show connections with their configured database names
            return connections.map(conn => new DatabaseTreeItem(
                conn.name || `${conn.host}:${conn.port}`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'connection',
                conn.id,
                conn.database // Pass the configured database name
            ));
        }

        const connection = connections.find(c => c.id === element.connectionId);
        if (!connection) {
            console.error(`Connection not found for ID: ${element.connectionId}`);
            vscode.window.showErrorMessage('Connection configuration not found');
            return [];
        }

        let client: Client | undefined;
        try {
            let password: string | undefined;
            try {
                password = await this.extensionContext.secrets.get(`postgres-password-${element.connectionId}`);
            } catch (err: any) {
                console.error('Error accessing SecretStorage:', err);
                vscode.window.showErrorMessage('Failed to access secure storage. Please try restarting VS Code.');
                return [];
            }

            if (!password) {
                console.error(`Password not found in SecretStorage for connection ID: ${element.connectionId}`);
                vscode.window.showErrorMessage('Connection password not found. Please remove and re-add the connection.');
                return [];
            }

            const dbName = element.type === 'connection' ? (connection.database || 'postgres') : element.databaseName;
            
            try {
                client = new Client({
                    host: connection.host,
                    port: connection.port,
                    user: connection.username,
                    password: password,
                    database: dbName,
                    connectionTimeoutMillis: 5000
                });

                client.on('error', (err) => {
                    console.error('Postgres client error:', err);
                    vscode.window.showErrorMessage(`Database error: ${err.message}`);
                });

                await client.connect();
                console.log('Successfully connected to database:', dbName);

                switch (element.type) {
                    case 'connection':
                        return [
                            new DatabaseTreeItem('Databases', vscode.TreeItemCollapsibleState.Collapsed, 'databases-group', element.connectionId, dbName),
                            new DatabaseTreeItem('Users & Roles', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, dbName)
                        ];

                    case 'databases-group':
                        // Show all databases the user has access to
                        const dbResult = await client.query(
                            "SELECT d.datname, pg_get_userbyid(d.datdba) as owner " +
                            "FROM pg_database d " +
                            "WHERE has_database_privilege(d.datname, 'CONNECT') " +
                            "AND datistemplate = false " +
                            "ORDER BY datname"
                        );
                        return dbResult.rows.map(row => new DatabaseTreeItem(
                            row.datname,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            'database',
                            element.connectionId,
                            row.datname
                        ));

                    case 'database':
                        // Return just the categories at database level
                        return [
                            new DatabaseTreeItem('Schemas', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName),
                            new DatabaseTreeItem('Extensions', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName)
                        ];

                    case 'category':
                        switch (element.label) {
                            case 'Users & Roles':
                                // Always connect to postgres database for role management
                                client = new Client({
                                    host: connection.host,
                                    port: connection.port,
                                    user: connection.username,
                                    password: password,
                                    database: 'postgres',  // Always use postgres database for role queries
                                    connectionTimeoutMillis: 5000
                                });
                                await client.connect();
                                
                                // Modified query to work with Azure PostgreSQL permissions
                                const roleResult = await client.query(
                                    `SELECT r.rolname,
                                            COALESCE(r.rolsuper, false) as rolsuper,
                                            COALESCE(r.rolcreatedb, false) as rolcreatedb,
                                            COALESCE(r.rolcreaterole, false) as rolcreaterole,
                                            COALESCE(r.rolcanlogin, false) as rolcanlogin
                                     FROM pg_catalog.pg_roles r
                                     WHERE pg_has_role(r.oid, 'USAGE') 
                                        OR r.rolname = current_user
                                        OR r.rolsuper
                                     ORDER BY r.rolname`
                                );
                                return roleResult.rows.map(row => new DatabaseTreeItem(
                                    row.rolname,
                                    vscode.TreeItemCollapsibleState.None,
                                    'role',
                                    element.connectionId,
                                    element.databaseName,
                                    undefined,
                                    undefined,
                                    undefined,
                                    undefined,
                                    undefined,
                                    undefined,
                                    {
                                        rolsuper: row.rolsuper,
                                        rolcreatedb: row.rolcreatedb,
                                        rolcreaterole: row.rolcreaterole,
                                        rolcanlogin: row.rolcanlogin
                                    }
                                ));

                            case 'Schemas':
                                const schemaResult = await client.query(
                                    `SELECT nspname as schema_name 
                                     FROM pg_namespace 
                                     WHERE nspname NOT LIKE 'pg_%' 
                                     AND nspname != 'information_schema'
                                     ORDER BY nspname`
                                );
                                return schemaResult.rows.map(row => new DatabaseTreeItem(
                                    row.schema_name,
                                    vscode.TreeItemCollapsibleState.Collapsed,
                                    'schema',
                                    element.connectionId,
                                    element.databaseName,
                                    row.schema_name
                                ));

                            case 'Extensions':
                                const extensionResult = await client.query(
                                    `SELECT e.name,
                                            e.installed_version,
                                            e.default_version,
                                            e.comment,
                                            CASE WHEN e.installed_version IS NOT NULL THEN true ELSE false END as is_installed
                                     FROM pg_available_extensions e
                                     ORDER BY is_installed DESC, name`
                                );
                                return extensionResult.rows.map(row => new DatabaseTreeItem(
                                    row.installed_version ? `${row.name} (${row.installed_version})` : `${row.name} (${row.default_version})`,
                                    vscode.TreeItemCollapsibleState.None,
                                    'extension',
                                    element.connectionId,
                                    element.databaseName,
                                    undefined,
                                    undefined,
                                    undefined,
                                    row.comment,
                                    row.is_installed,
                                    row.installed_version
                                ));

                            // Existing category cases for schema level items
                            case 'Tables':
                                const tableResult = await client.query(
                                    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name",
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
                                    "SELECT table_name FROM information_schema.views WHERE table_schema = $1 ORDER BY table_name",
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
                                    "SELECT routine_name FROM information_schema.routines WHERE routine_schema = $1 AND routine_type = 'FUNCTION' ORDER BY routine_name",
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

                            case 'Materialized Views':
                                const materializedViewResult = await client.query(
                                    "SELECT matviewname as name FROM pg_matviews WHERE schemaname = $1 ORDER BY matviewname",
                                    [element.schema]
                                );
                                return materializedViewResult.rows.map(row => new DatabaseTreeItem(
                                    row.name,
                                    vscode.TreeItemCollapsibleState.None,
                                    'materialized-view',
                                    element.connectionId,
                                    element.databaseName,
                                    element.schema
                                ));

                            case 'Types':
                                const typeResult = await client.query(
                                    `SELECT t.typname as name
                                     FROM pg_type t
                                     JOIN pg_namespace n ON t.typnamespace = n.oid
                                     WHERE n.nspname = $1
                                     AND t.typtype = 'c'
                                     ORDER BY t.typname`,
                                    [element.schema]
                                );
                                return typeResult.rows.map(row => new DatabaseTreeItem(
                                    row.name,
                                    vscode.TreeItemCollapsibleState.None,
                                    'type',
                                    element.connectionId,
                                    element.databaseName,
                                    element.schema
                                ));

                            case 'Foreign Tables':
                                const foreignTableResult = await client.query(
                                    `SELECT ft.relname as name
                                     FROM pg_foreign_table ft
                                     JOIN pg_class c ON ft.ftrelid = c.oid
                                     JOIN pg_namespace n ON c.relnamespace = n.oid
                                     WHERE n.nspname = $1
                                     ORDER BY ft.relname`,
                                    [element.schema]
                                );
                                return foreignTableResult.rows.map(row => new DatabaseTreeItem(
                                    row.name,
                                    vscode.TreeItemCollapsibleState.None,
                                    'foreign-table',
                                    element.connectionId,
                                    element.databaseName,
                                    element.schema
                                ));
                        }
                        break;

                    case 'schema':
                        return [
                            new DatabaseTreeItem('Tables', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
                            new DatabaseTreeItem('Views', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
                            new DatabaseTreeItem('Functions', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
                            new DatabaseTreeItem('Materialized Views', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
                            new DatabaseTreeItem('Types', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema),
                            new DatabaseTreeItem('Foreign Tables', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.connectionId, element.databaseName, element.schema)
                        ];

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
                const pgError = err as { code?: string; detail?: string; message: string };
                console.error('Database connection error:', {
                    message: pgError.message,
                    code: pgError.code,
                    detail: pgError.detail
                });

                // If the first connection fails and we're not already trying 'postgres' database,
                // try connecting to 'postgres' database
                if (pgError.code === '3D000' && dbName !== 'postgres') {
                    try {
                        console.log('Retrying connection with postgres database');
                        client = new Client({
                            host: connection.host,
                            port: connection.port,
                            user: connection.username,
                            password: password,
                            database: 'postgres',
                            connectionTimeoutMillis: 5000
                        });
                        await client.connect();
                        console.log('Successfully connected to postgres database');
                    } catch (retryErr: any) {
                        let errorMessage = 'Failed to connect to database: ';
                        if (retryErr.code === 'ECONNREFUSED') {
                            errorMessage += 'Connection refused. Please check if the database server is running and the host/port are correct.';
                        } else if (retryErr.code === '28P01') {
                            errorMessage += 'Invalid password. Please remove and re-add the connection.';
                        } else if (retryErr.code === '28000') {
                            errorMessage += 'Invalid username. Please check your connection settings.';
                        } else {
                            errorMessage += retryErr.message || 'Unknown error';
                        }
                        vscode.window.showErrorMessage(errorMessage);
                        return [];
                    }
                } else {
                    let errorMessage = 'Failed to connect to database: ';
                    if (pgError.code === 'ECONNREFUSED') {
                        errorMessage += 'Connection refused. Please check if the database server is running and the host/port are correct.';
                    } else if (pgError.code === '28P01') {
                        errorMessage += 'Invalid password. Please remove and re-add the connection.';
                    } else if (pgError.code === '28000') {
                        errorMessage += 'Invalid username. Please check your connection settings.';
                    } else {
                        errorMessage += pgError.message || 'Unknown error';
                    }
                    vscode.window.showErrorMessage(errorMessage);
                    return [];
                }
            }

            return [];
        } catch (err: any) {
            console.error(`Error getting tree items: ${err.message}`);
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
        public readonly type: 'connection' | 'database' | 'schema' | 'table' | 'view' | 'function' | 'column' | 'category' | 'materialized-view' | 'type' | 'foreign-table' | 'extension' | 'role' | 'databases-group',
        public readonly connectionId?: string,
        public readonly databaseName?: string,
        public readonly schema?: string,
        public readonly tableName?: string,
        public readonly columnName?: string,
        public readonly comment?: string,
        public readonly isInstalled?: boolean,
        public readonly installedVersion?: string,
        public readonly roleAttributes?: { [key: string]: boolean }
    ) {
        super(label, collapsibleState);
        this.contextValue = isInstalled ? `${type}-installed` : type;
        this.tooltip = this.getTooltip(type, comment, roleAttributes);
        this.description = this.getDescription(type, isInstalled, installedVersion, roleAttributes);
        this.iconPath = {
            connection: new vscode.ThemeIcon('plug'),
            database: new vscode.ThemeIcon('database'),
            'databases-group': new vscode.ThemeIcon('database'),
            schema: new vscode.ThemeIcon('symbol-namespace'),
            table: new vscode.ThemeIcon('table'),
            view: new vscode.ThemeIcon('type-hierarchy-sub'),
            function: new vscode.ThemeIcon('symbol-method'),
            column: new vscode.ThemeIcon('symbol-field'),
            category: new vscode.ThemeIcon('list-tree'),
            'materialized-view': new vscode.ThemeIcon('symbol-structure'),
            type: new vscode.ThemeIcon('symbol-type-parameter'),
            'foreign-table': new vscode.ThemeIcon('symbol-interface'),
            extension: new vscode.ThemeIcon(isInstalled ? 'extensions-installed' : 'extensions'),
            role: new vscode.ThemeIcon('person')
        }[type];
    }

    private getTooltip(type: string, comment?: string, roleAttributes?: { [key: string]: boolean }): string {
        if (type === 'role' && roleAttributes) {
            const attributes = [];
            if (roleAttributes.rolsuper) attributes.push('Superuser');
            if (roleAttributes.rolcreatedb) attributes.push('Create DB');
            if (roleAttributes.rolcreaterole) attributes.push('Create Role');
            if (roleAttributes.rolcanlogin) attributes.push('Can Login');
            return `${this.label}\n\nAttributes:\n${attributes.join('\n')}`;
        }
        return comment ? `${this.label}\n\n${comment}` : this.label;
    }

    private getDescription(type: string, isInstalled?: boolean, installedVersion?: string, roleAttributes?: { [key: string]: boolean }): string | undefined {
        if (type === 'extension' && isInstalled) {
            return `v${installedVersion} (installed)`;
        }
        if (type === 'role' && roleAttributes) {
            const tags = [];
            if (roleAttributes.rolsuper) tags.push('superuser');
            if (roleAttributes.rolcanlogin) tags.push('login');
            return tags.length > 0 ? `(${tags.join(', ')})` : undefined;
        }
        return undefined;
    }
}
