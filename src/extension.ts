import * as vscode from 'vscode';
import { Client } from 'pg';
import { ConnectionFormPanel } from './connectionForm';
import { DatabaseTreeProvider, DatabaseTreeItem } from './databaseTreeProvider';
import { TablePropertiesPanel } from './tableProperties';
import { PostgresNotebookProvider } from './notebookProvider';
import { PostgresKernel } from './notebookKernel';
import { PostgresNotebookSerializer } from './postgresNotebook';
import { cmdCallFunction, cmdEditFunction, cmdDropFunction, cmdAllFunctionOperations } from './subscriptions/functions';
import { cmdDropView, cmdEditView, cmdAllViewOperations, cmdViewData } from './subscriptions/views';
import { cmdAllTableOperations, cmdDropTable, cmdEditTable, cmdInsertTable, cmdTruncateTable, cmdUpdateTable, cmdViewTableData } from './subscriptions/tables';
import { cmdAllOperationsMatView, cmdDropMatView, cmdEditMatView, cmdRefreshMatView, cmdViewMatViewData, cmdViewMatViewProperties } from './subscriptions/materializedViews';
import { cmdAllOperationsTypes, cmdDropType, cmdEditTypes, cmdShowTypeProperties } from './subscriptions/types';

export async function activate(context: vscode.ExtensionContext) {
    console.log('postgres-explorer: Activating extension');
    
    // Immediately migrate any existing passwords to SecretStorage
    await migrateExistingPasswords(context);
    
    // Create kernel with message handler to handle notebook cell output messages
    const kernel = new PostgresKernel(context, async (message: { type: string; command: string; format?: string; content?: string; filename?: string }) => {
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

    const databaseTreeProvider = new DatabaseTreeProvider(context);
    
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
            ConnectionFormPanel.show(context.extensionUri, context);
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

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
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
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.showViewProperties', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid view selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
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
                    
                    // Pass the connected client to TablePropertiesPanel with isView flag
                    await TablePropertiesPanel.show(client, item.schema!, item.label, true);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to show view properties: ${errorMessage}`);
                    
                    if (client) {
                        try {
                            await client.end();
                        } catch (closeErr) {
                            console.error('Error closing connection:', closeErr);
                        }
                    }
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.showFunctionProperties', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid function selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
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
                    
                    // Pass the connected client to TablePropertiesPanel with isFunction flag
                    await TablePropertiesPanel.show(client, item.schema!, item.label, false, true);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to show function properties: ${errorMessage}`);
                    
                    if (client) {
                        try {
                            await client.end();
                        } catch (closeErr) {
                            console.error('Error closing connection:', closeErr);
                        }
                    }
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
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
                try {
                    const config = vscode.workspace.getConfiguration();
                    const connections = config.get<any[]>('postgresExplorer.connections') || [];

                    // Remove the connection info from settings
                    const updatedConnections = connections.filter(c => c.id !== item.connectionId);
                    await config.update('postgresExplorer.connections', updatedConnections, vscode.ConfigurationTarget.Global);

                    // Remove the password from SecretStorage
                    await context.secrets.delete(`postgres-password-${item.connectionId}`);

                    databaseTreeProvider.refresh();
                } catch (err: any) {
                    vscode.window.showErrorMessage(`Failed to delete connection: ${err.message}`);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.functionOperations', async (item: DatabaseTreeItem) => {
            await cmdAllFunctionOperations(item, context);
        })
    )

    context.subscriptions.push(

        // ------ FUNCTION OPERATIONS------

        /**
         * command : postgres-explorer.createReplaceFunction
         * action  : Create or replace a function
         */
        vscode.commands.registerCommand('postgres-explorer.createReplaceFunction', async (item: DatabaseTreeItem) => {
            await cmdEditFunction(item, context);
        }),

        /**
         * command : postgres-explorer.callFunction
         * action  : Call a function
         */
        vscode.commands.registerCommand('postgres-explorer.callFunction', async (item: DatabaseTreeItem) => {
            await cmdCallFunction(item, context);
        }),

        /**
         * command : postgres-explorer.dropFunction
         * action  : Drop a function
         */
        vscode.commands.registerCommand('postgres-explorer.dropFunction', async (item: DatabaseTreeItem) => {
            await cmdDropFunction(item, context);
        }),

        // -------- VIEW OPERATIONS --------

        /**
         * command : postgres-explorer.editViewDefinition
         * action  : Edit a view definition
         */
        vscode.commands.registerCommand('postgres-explorer.editViewDefinition', async (item: DatabaseTreeItem) => {
            await cmdEditView(item, context);
        }),

        /**
         * command : postgres-explorer.viewViewData
         * action  : View data from a view
         */
        vscode.commands.registerCommand('postgres-explorer.viewViewData', async (item: DatabaseTreeItem) => {
            await cmdViewData(item, context);
        }),

        /**
         * command : postgres-explorer.dropView
         * action  : Drop a view
         */
        vscode.commands.registerCommand('postgres-explorer.dropView', async (item: DatabaseTreeItem) => {
            await cmdDropView(item, context);
        }),

        /**
         * command : postgres-explorer.viewOperations
         * action  : View operations for a view
         */
        vscode.commands.registerCommand('postgres-explorer.viewOperations', async (item: DatabaseTreeItem) => {
            await cmdAllViewOperations(item, context);
        }),

        // -------- TABLE OPERATIONS --------

        /**
         * command : postgres-explorer.editTableDefinition
         * action  : Edit a table definition
         */
        vscode.commands.registerCommand('postgres-explorer.editTableDefinition', async (item: DatabaseTreeItem) => {
            await cmdEditTable(item, context);
        }),

        /**
         * command : postgres-explorer.viewTableData
         * action  : View data from a table
         */
        vscode.commands.registerCommand('postgres-explorer.viewTableData', async (item: DatabaseTreeItem) => {
            await cmdViewTableData(item, context);
        }),

        /**
         * command : postgres-explorer.dropTable
         * action  : Drop a table
         */
        vscode.commands.registerCommand('postgres-explorer.dropTable', async (item: DatabaseTreeItem) => {
            await cmdDropTable(item, context);
        }),

        /**
         * command : postgres-explorer.tableOperations
         * action  : View operations for a table
         */
        vscode.commands.registerCommand('postgres-explorer.tableOperations', async (item: DatabaseTreeItem) => {
            await cmdAllTableOperations(item, context);
        }),

        /**
         * command : postgres-explorer.truncateTable
         * action  : Truncate a table
         */
        vscode.commands.registerCommand('postgres-explorer.truncateTable', async (item: DatabaseTreeItem) => {
            await cmdTruncateTable(item, context);
        }),

        /**
         * command : postgres-explorer.insertData
         * action  : Insert data into a table
         */
        vscode.commands.registerCommand('postgres-explorer.insertData', async (item: DatabaseTreeItem) => {
            await cmdInsertTable(item, context);
        }),

        /**
         * command : postgres-explorer.updateData
         * action  : Update data in a table
         */
        vscode.commands.registerCommand('postgres-explorer.updateData', async (item: DatabaseTreeItem) => {
            await cmdUpdateTable(item, context);
        }),

        // --------- MATERIALIZED VIEW COMMANDS ---------

        /**
         * command : postgres-explorer.refreshMaterializedView
         * action  : Refresh a materialized view
         */
        vscode.commands.registerCommand('postgres-explorer.refreshMaterializedView', async (item: DatabaseTreeItem) => {
            await cmdRefreshMatView(item, context);
        }),

        /**
         * command : postgres-explorer.editMatView
         * action  : Edit a materialized view
         */
        vscode.commands.registerCommand('postgres-explorer.editMatView', async (item: DatabaseTreeItem) => {
            await cmdEditMatView(item, context);
        }),

        /**
         * command : postgres-explorer.viewMaterializedViewData
         * action  : View data from a materialized view
         */
        vscode.commands.registerCommand('postgres-explorer.viewMaterializedViewData', async (item: DatabaseTreeItem) => {
            await cmdViewMatViewData(item, context);
        }),

        /**
         * command : postgres-explorer.showMaterializedViewProperties
         * action  : View properties of a materialized view
         */
        vscode.commands.registerCommand('postgres-explorer.showMaterializedViewProperties', async (item: DatabaseTreeItem) => {
            await cmdViewMatViewProperties(item, context);
        }),

        /**
         * command : postgres-explorer.dropMatView
         * action  : Drop a materialized view
         */
        vscode.commands.registerCommand('postgres-explorer.dropMatView', async (item: DatabaseTreeItem) => {
            await cmdDropMatView(item, context);
        }),

        /**
         * command : postgres-explorer.materializedViewOperations
         * action  : View operations for a materialized view
         */
        vscode.commands.registerCommand('postgres-explorer.materializedViewOperations', async (item: DatabaseTreeItem) => {
           await cmdAllOperationsMatView(item, context);
        }),

        // --------- TYPES COMMANDS ---------

        /**
         * command : postgres-explorer.typeOperations
         * action  : View all operations for a type
         */
        vscode.commands.registerCommand('postgres-explorer.typeOperations', async (item: DatabaseTreeItem) => {
            await cmdAllOperationsTypes(item, context);
        }),

        /**
         * command : postgres-explorer.editType
         * action  : Edit a type
         */
        vscode.commands.registerCommand('postgres-explorer.editType', async (item: DatabaseTreeItem) => {
            await cmdEditTypes(item, context);
        }),

        /**
         * command : postgres-explorer.showTypeProperties
         * action  : Show properties of a type
         */
        vscode.commands.registerCommand('postgres-explorer.showTypeProperties', async (item: DatabaseTreeItem) => {
            await cmdShowTypeProperties(item,context);
        }),

        /**
         * command : postgres-explorer.dropType
         * action  : Drop a type
         */
        vscode.commands.registerCommand('postgres-explorer.dropType', async (item: DatabaseTreeItem) => {
            await cmdDropType(item, context);
        }),

        // --------- NOTEBOOK COMMANDS ---------

        vscode.commands.registerCommand('postgres-explorer.createSchema', async (item: DatabaseTreeItem) => {
            if (!item || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid database selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                const metadata = {
                    connectionId: item.connectionId,
                    databaseName: item.databaseName,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                    password: connection.password
                };

                const notebookData = new vscode.NotebookData([
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `# Create New Schema in Database: ${item.label}\n\nExecute the cell below to create a new schema. Modify the schema name and permissions as needed.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Create new schema
CREATE SCHEMA schema_name;

-- Grant permissions (optional)
GRANT USAGE ON SCHEMA schema_name TO role_name;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA schema_name TO role_name;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA schema_name TO role_name;`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create schema notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.databaseOperations', async (item: DatabaseTreeItem) => {
            if (!item || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid database selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                const metadata = {
                    connectionId: item.connectionId,
                    databaseName: item.databaseName,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                    password: connection.password
                };

                const notebookData = new vscode.NotebookData([
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `# Database Operations: ${item.label}\n\nThis notebook contains common operations for managing the database:\n- Show database info\n- List schemas\n- List users and roles\n- Show active connections\n- Database maintenance`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Database information
SELECT d.datname as "Database",
       pg_size_pretty(pg_database_size(d.datname)) as "Size",
       u.usename as "Owner"
FROM pg_database d
JOIN pg_user u ON d.datdba = u.usesysid
WHERE d.datname = current_database();`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- List schemas and sizes
SELECT schema_name,
       pg_size_pretty(sum(table_size)::bigint) as "Size",
       count(table_name) as "Tables"
FROM (
  SELECT pg_tables.schemaname as schema_name,
         tablename as table_name,
         pg_total_relation_size(pg_tables.schemaname || '.' || tablename) as table_size
  FROM pg_tables
) t
GROUP BY schema_name
ORDER BY sum(table_size) DESC;`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- List users and roles
SELECT r.rolname as "Role",
       r.rolsuper as "Superuser",
       r.rolcreatedb as "Create DB",
       r.rolcreaterole as "Create Role",
       r.rolcanlogin as "Can Login"
FROM pg_roles r
ORDER BY r.rolname;`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Show active connections
SELECT pid as "Process ID",
       usename as "User",
       datname as "Database",
       client_addr as "Client Address",
       application_name as "Application",
       state as "State",
       query as "Last Query"
FROM pg_stat_activity
WHERE datname = current_database();`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Database maintenance (vacuum analyze)
VACUUM ANALYZE;`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create database operations notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.createInSchema', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid schema selection');
                return;
            }

            const items = [
                { label: 'Table', detail: 'Create a new table in this schema', query: `CREATE TABLE ${item.schema}.table_name (\n    id serial PRIMARY KEY,\n    column_name data_type,\n    created_at timestamptz DEFAULT current_timestamp\n);` },
                { label: 'View', detail: 'Create a new view in this schema', query: `CREATE VIEW ${item.schema}.view_name AS\nSELECT column1, column2\nFROM some_table\nWHERE condition;` },
                { label: 'Function', detail: 'Create a new function in this schema', query: `CREATE OR REPLACE FUNCTION ${item.schema}.function_name(\n    param1 data_type,\n    param2 data_type\n) RETURNS return_type AS $$\nBEGIN\n    -- Function logic here\n    RETURN result;\nEND;\n$$ LANGUAGE plpgsql;` },
                { label: 'Materialized View', detail: 'Create a new materialized view in this schema', query: `CREATE MATERIALIZED VIEW ${item.schema}.matview_name AS\nSELECT column1, column2\nFROM source_table\nWHERE condition\nWITH DATA;` },
                { label: 'Type', detail: 'Create a new composite type in this schema', query: `CREATE TYPE ${item.schema}.type_name AS (\n    field1 data_type,\n    field2 data_type\n);` },
                { label: 'Foreign Table', detail: 'Create a new foreign table in this schema', query: `CREATE FOREIGN TABLE ${item.schema}.foreign_table_name (\n    column1 data_type,\n    column2 data_type\n) SERVER foreign_server_name\nOPTIONS (schema_name 'remote_schema', table_name 'remote_table');` }
            ];

            const selection = await vscode.window.showQuickPick(items, {
                title: 'Create in Schema',
                placeHolder: 'Select what to create'
            });

            if (selection) {
                try {
                    const connection = await getConnectionWithPassword(item.connectionId, context);
                    const metadata = {
                        connectionId: item.connectionId,
                        databaseName: item.databaseName,
                        host: connection.host,
                        port: connection.port,
                        username: connection.username,
                        password: connection.password
                    };

                    const notebookData = new vscode.NotebookData([
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Markup,
                            `# Create New ${selection.label} in Schema: ${item.schema}\n\nModify the definition below and execute the cell to create the ${selection.label.toLowerCase()}.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            selection.query,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    vscode.window.showErrorMessage(`Failed to create notebook: ${err.message}`);
                }
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.schemaOperations', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid schema selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
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

                    // Get schema info
                    const schemaInfoQuery = `
                        SELECT 
                            n.nspname as schema_name,
                            pg_catalog.pg_get_userbyid(n.nspowner) as owner,
                            pg_size_pretty(sum(pg_total_relation_size(quote_ident(pg_tables.schemaname) || '.' || quote_ident(tablename)))::bigint) as total_size,
                            count(distinct tablename) as tables_count,
                            count(distinct viewname) as views_count,
                            count(distinct routines.routine_name) as functions_count,
                            array_agg(distinct format(
                                E'%s ON %s TO %s',
                                p.privilege_type,
                                p.table_schema,
                                p.grantee
                            )) as privileges
                        FROM pg_catalog.pg_namespace n
                        LEFT JOIN pg_tables ON pg_tables.schemaname = n.nspname
                        LEFT JOIN pg_views ON pg_tables.schemaname = n.nspname
                        LEFT JOIN information_schema.routines ON routine_schema = n.nspname
                        LEFT JOIN information_schema.table_privileges p ON p.table_schema = n.nspname
                        WHERE n.nspname = $1
                        GROUP BY n.nspname, n.nspowner`;

                    const schemaInfo = await client.query(schemaInfoQuery, [item.schema]);
                    const info = schemaInfo.rows[0];

                    const privileges = (info.privileges || []).filter((p: string | null) => p !== null);
                    const privilegesText = privileges.length > 0 ? privileges.join(', ') : 'No specific privileges found';

                    const metadata = {
                        connectionId: item.connectionId,
                        databaseName: item.databaseName,
                        host: connection.host,
                        port: connection.port,
                        username: connection.username,
                        password: connection.password
                    };

                    const notebookData = new vscode.NotebookData([
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Markup,
                            `# Schema: ${item.schema}

## Schema Information
- **Owner**: ${info.owner}
- **Total Size**: ${info.total_size}
- **Objects**: ${info.tables_count} tables, ${info.views_count} views, ${info.functions_count} functions
- **Privileges**: ${privilegesText}

This notebook contains operations for managing the schema. Execute the cells below to perform operations.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- List all objects in schema with sizes
SELECT 
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'i' THEN 'index'
        WHEN 'S' THEN 'sequence'
        WHEN 's' THEN 'special'
        WHEN 'f' THEN 'foreign table'
        WHEN 'p' THEN 'partitioned table'
    END as object_type,
    c.relname as object_name,
    pg_size_pretty(pg_total_relation_size(quote_ident('public') || '.' || quote_ident(c.relname))) as size,
    CASE WHEN c.relkind = 'r' THEN 
        (SELECT reltuples::bigint FROM pg_class WHERE oid = c.oid)
    ELSE NULL END as estimated_row_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
AND c.relkind in ('r', 'v', 'm', 'S', 'f', 'p')
ORDER BY c.relkind, pg_total_relation_size(c.oid) DESC;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- List schema privileges
SELECT grantee, string_agg(privilege_type, ', ') as privileges
FROM (
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema = '${item.schema}'
    UNION
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = '${item.schema}'
    UNION
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.usage_privileges
    WHERE object_schema = '${item.schema}'
) p
GROUP BY grantee
ORDER BY grantee;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Grant privileges (modify as needed)
GRANT USAGE ON SCHEMA ${item.schema} TO role_name;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${item.schema} TO role_name;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${item.schema} TO role_name;
GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA ${item.schema} TO role_name;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA ${item.schema}
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_name;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${item.schema}
    GRANT EXECUTE ON FUNCTIONS TO role_name;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${item.schema}
    GRANT SELECT, USAGE ON SEQUENCES TO role_name;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Schema maintenance

-- First analyze all tables (can be run within DO block)
DO $$
DECLARE
    t record;
BEGIN
    FOR t IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE pg_tables.schemaname = '${item.schema}'
    LOOP
        EXECUTE 'ANALYZE VERBOSE ' || quote_ident('${item.schema}') || '.' || quote_ident(t.tablename);
    END LOOP;
END $$;

-- Note: VACUUM commands must be run as separate statements
-- The following are example VACUUM commands for each table in the schema
SELECT format('VACUUM ANALYZE %I.%I;', schemaname, tablename) as vacuum_command
FROM pg_tables 
WHERE schemaname = '${item.schema}'
ORDER BY tablename;

-- To execute VACUUM on a specific table, uncomment and modify:
-- VACUUM ANALYZE ${item.schema}.table_name;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Drop schema (BE CAREFUL!)
DROP SCHEMA ${item.schema};  -- This will fail if schema is not empty

-- To force drop schema and all objects:
-- DROP SCHEMA ${item.schema} CASCADE;`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);

                    if (client) {
                        await client.end();
                    }
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create schema operations notebook: ${errorMessage}`);
                    
                    if (client) {
                        try {
                            await client.end();
                        } catch (closeErr) {
                            console.error('Error closing connection:', closeErr);
                        }
                    }
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.databaseOperations', async (item: DatabaseTreeItem) => {
            if (!item || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid database selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                const metadata = {
                    connectionId: item.connectionId,
                    databaseName: item.databaseName,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                    password: connection.password
                };

                const notebookData = new vscode.NotebookData([
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `# Database Operations: ${item.label}\n\nThis notebook contains common operations for managing the database:\n- Show database info\n- List schemas\n- List users and roles\n- Show active connections\n- Database maintenance`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Database information
SELECT d.datname as "Database",
       pg_size_pretty(pg_database_size(d.datname)) as "Size",
       u.usename as "Owner"
FROM pg_database d
JOIN pg_user u ON d.datdba = u.usesysid
WHERE d.datname = current_database();`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- List schemas and sizes
SELECT schema_name,
       pg_size_pretty(sum(table_size)::bigint) as "Size",
       count(table_name) as "Tables"
FROM (
  SELECT pg_tables.schemaname as schema_name,
         tablename as table_name,
         pg_total_relation_size(pg_tables.schemaname || '.' || tablename) as table_size
  FROM pg_tables
) t
GROUP BY schema_name
ORDER BY sum(table_size) DESC;`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- List users and roles
SELECT r.rolname as "Role",
       r.rolsuper as "Superuser",
       r.rolcreatedb as "Create DB",
       r.rolcreaterole as "Create Role",
       r.rolcanlogin as "Can Login"
FROM pg_roles r
ORDER BY r.rolname;`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Show active connections
SELECT pid as "Process ID",
       usename as "User",
       datname as "Database",
       client_addr as "Client Address",
       application_name as "Application",
       state as "State",
       query as "Last Query"
FROM pg_stat_activity
WHERE datname = current_database();`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Database maintenance (vacuum analyze)
VACUUM ANALYZE;`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create database operations notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.createInSchema', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid schema selection');
                return;
            }

            const items = [
                { label: 'Table', detail: 'Create a new table in this schema', query: `CREATE TABLE ${item.schema}.table_name (\n    id serial PRIMARY KEY,\n    column_name data_type,\n    created_at timestamptz DEFAULT current_timestamp\n);` },
                { label: 'View', detail: 'Create a new view in this schema', query: `CREATE VIEW ${item.schema}.view_name AS\nSELECT column1, column2\nFROM some_table\nWHERE condition;` },
                { label: 'Function', detail: 'Create a new function in this schema', query: `CREATE OR REPLACE FUNCTION ${item.schema}.function_name(\n    param1 data_type,\n    param2 data_type\n) RETURNS return_type AS $$\nBEGIN\n    -- Function logic here\n    RETURN result;\nEND;\n$$ LANGUAGE plpgsql;` },
                { label: 'Materialized View', detail: 'Create a new materialized view in this schema', query: `CREATE MATERIALIZED VIEW ${item.schema}.matview_name AS\nSELECT column1, column2\nFROM source_table\nWHERE condition\nWITH DATA;` },
                { label: 'Type', detail: 'Create a new composite type in this schema', query: `CREATE TYPE ${item.schema}.type_name AS (\n    field1 data_type,\n    field2 data_type\n);` },
                { label: 'Foreign Table', detail: 'Create a new foreign table in this schema', query: `CREATE FOREIGN TABLE ${item.schema}.foreign_table_name (\n    column1 data_type,\n    column2 data_type\n) SERVER foreign_server_name\nOPTIONS (schema_name 'remote_schema', table_name 'remote_table');` }
            ];

            const selection = await vscode.window.showQuickPick(items, {
                title: 'Create in Schema',
                placeHolder: 'Select what to create'
            });

            if (selection) {
                try {
                    const connection = await getConnectionWithPassword(item.connectionId, context);
                    const metadata = {
                        connectionId: item.connectionId,
                        databaseName: item.databaseName,
                        host: connection.host,
                        port: connection.port,
                        username: connection.username,
                        password: connection.password
                    };

                    const notebookData = new vscode.NotebookData([
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Markup,
                            `# Create New ${selection.label} in Schema: ${item.schema}\n\nModify the definition below and execute the cell to create the ${selection.label.toLowerCase()}.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            selection.query,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    vscode.window.showErrorMessage(`Failed to create notebook: ${err.message}`);
                }
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.schemaOperations', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid schema selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
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

                    // Get schema info
                    const schemaInfoQuery = `
                        SELECT 
                            n.nspname as schema_name,
                            pg_catalog.pg_get_userbyid(n.nspowner) as owner,
                            pg_size_pretty(sum(pg_total_relation_size(quote_ident(pg_tables.schemaname) || '.' || quote_ident(tablename)))::bigint) as total_size,
                            count(distinct tablename) as tables_count,
                            count(distinct viewname) as views_count,
                            count(distinct routines.routine_name) as functions_count,
                            array_agg(distinct format(
                                E'%s ON %s TO %s',
                                p.privilege_type,
                                p.table_schema,
                                p.grantee
                            )) as privileges
                        FROM pg_catalog.pg_namespace n
                        LEFT JOIN pg_tables ON schemaname = n.nspname
                        LEFT JOIN pg_views ON schemaname = n.nspname
                        LEFT JOIN information_schema.routines ON routine_schema = n.nspname
                        LEFT JOIN information_schema.table_privileges p ON p.table_schema = n.nspname
                        WHERE n.nspname = $1
                        GROUP BY n.nspname, n.nspowner`;

                    const schemaInfo = await client.query(schemaInfoQuery, [item.schema]);
                    const info = schemaInfo.rows[0];

                    const privileges = (info.privileges || []).filter((p: string | null) => p !== null);
                    const privilegesText = privileges.length > 0 ? privileges.join(', ') : 'No specific privileges found';

                    const metadata = {
                        connectionId: item.connectionId,
                        databaseName: item.databaseName,
                        host: connection.host,
                        port: connection.port,
                        username: connection.username,
                        password: connection.password
                    };

                    const notebookData = new vscode.NotebookData([
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Markup,
                            `# Schema: ${item.schema}

## Schema Information
- **Owner**: ${info.owner}
- **Total Size**: ${info.total_size}
- **Objects**: ${info.tables_count} tables, ${info.views_count} views, ${info.functions_count} functions
- **Privileges**: ${privilegesText}

This notebook contains operations for managing the schema. Execute the cells below to perform operations.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- List all objects in schema with sizes
SELECT 
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'i' THEN 'index'
        WHEN 'S' THEN 'sequence'
        WHEN 's' THEN 'special'
        WHEN 'f' THEN 'foreign table'
        WHEN 'p' THEN 'partitioned table'
    END as object_type,
    c.relname as object_name,
    pg_size_pretty(pg_total_relation_size(quote_ident('public') || '.' || quote_ident(c.relname))) as size,
    CASE WHEN c.relkind = 'r' THEN 
        (SELECT reltuples::bigint FROM pg_class WHERE oid = c.oid)
    ELSE NULL END as estimated_row_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
AND c.relkind in ('r', 'v', 'm', 'S', 'f', 'p')
ORDER BY c.relkind, pg_total_relation_size(c.oid) DESC;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- List schema privileges
SELECT grantee, string_agg(privilege_type, ', ') as privileges
FROM (
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema = '${item.schema}'
    UNION
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = '${item.schema}'
    UNION
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.usage_privileges
    WHERE object_schema = '${item.schema}'
) p
GROUP BY grantee
ORDER BY grantee;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Grant privileges (modify as needed)
GRANT USAGE ON SCHEMA ${item.schema} TO role_name;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${item.schema} TO role_name;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${item.schema} TO role_name;
GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA ${item.schema} TO role_name;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA ${item.schema}
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_name;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${item.schema}
    GRANT EXECUTE ON FUNCTIONS TO role_name;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${item.schema}
    GRANT SELECT, USAGE ON SEQUENCES TO role_name;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Schema maintenance

-- First analyze all tables (can be run within DO block)
DO $$
DECLARE
    t record;
BEGIN
    FOR t IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = '${item.schema}'
    LOOP
        EXECUTE 'ANALYZE VERBOSE ' || quote_ident('${item.schema}') || '.' || quote_ident(t.tablename);
    END LOOP;
END $$;

-- Note: VACUUM commands must be run as separate statements
-- The following are example VACUUM commands for each table in the schema
SELECT format('VACUUM ANALYZE %I.%I;', pg_tables.schemaname, tablename) as vacuum_command
FROM pg_tables 
WHERE pg_tables.schemaname = '${item.schema}'
ORDER BY tablename;

-- To execute VACUUM on a specific table, uncomment and modify:
-- VACUUM ANALYZE ${item.schema}.table_name;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Drop schema (BE CAREFUL!)
DROP SCHEMA ${item.schema};  -- This will fail if schema is not empty

-- To force drop schema and all objects:
-- DROP SCHEMA ${item.schema} CASCADE;`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);

                    if (client) {
                        await client.end();
                    }
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create schema operations notebook: ${errorMessage}`);
                    
                    if (client) {
                        try {
                            await client.end();
                        } catch (closeErr) {
                            console.error('Error closing connection:', closeErr);
                        }
                    }
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        })
    );

    // Foreign table operations
    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.foreignTableOperations', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid foreign table selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
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
                    
                    // Get foreign table definition
                    const tableQuery = `
                        SELECT 
                            c.column_name,
                            c.data_type,
                            c.is_nullable,
                            c.column_default,
                            fs.srvname as server_name,
                            fto.ftoptions as options
                        FROM information_schema.columns c
                        JOIN pg_class pc ON pc.relname = c.table_name
                        JOIN pg_foreign_table ft ON ft.ftrelid = pc.oid
                        JOIN pg_foreign_server fs ON fs.oid = ft.ftserver
                        LEFT JOIN pg_foreign_table_options fto ON fto.ftrelid = ft.ftrelid
                        WHERE c.table_schema = $1
                        AND c.table_name = $2
                        ORDER BY c.ordinal_position`;

                    const tableResult = await client.query(tableQuery, [item.schema, item.label]);
                    
                    if (tableResult.rows.length === 0) {
                        throw new Error('Foreign table not found');
                    }

                    // Create notebook with foreign table operations
                    const metadata = {
                        connectionId: item.connectionId,
                        databaseName: item.databaseName,
                        host: connection.host,
                        port: connection.port,
                        username: connection.username,
                        password: connection.password
                    };

                    const serverName = tableResult.rows[0].server_name;
                    const options = tableResult.rows[0].options || [];
                    const columnDefinitions = tableResult.rows.map(row => 
                        `    ${row.column_name} ${row.data_type}${row.is_nullable === 'NO' ? ' NOT NULL' : ''}${row.column_default ? ' DEFAULT ' + row.column_default : ''}`
                    ).join(',\n');

                    const createTableStatement = `CREATE FOREIGN TABLE ${item.schema}.${item.label} (\n${columnDefinitions}\n) SERVER ${serverName}${
                        options.length > 0 ? '\nOPTIONS (' + options.map((opt: any) => `${opt}`).join(', ') + ')' : ''
                    };`;

                    const notebookData = new vscode.NotebookData([
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Markup,
                            `# Foreign Table Operations: ${item.schema}.${item.label}\n\nThis notebook contains operations for managing the PostgreSQL foreign table:
- View table definition
- Query data
- Edit table definition
- Drop table`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Current table definition\n${createTableStatement}`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Query data
SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Edit table (requires dropping and recreating)
DROP FOREIGN TABLE IF EXISTS ${item.schema}.${item.label};

CREATE FOREIGN TABLE ${item.schema}.${item.label} (
    -- Define columns here
    column_name data_type
) SERVER server_name
OPTIONS (
    schema_name 'remote_schema',
    table_name 'remote_table'
);`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Drop table
DROP FOREIGN TABLE IF EXISTS ${item.schema}.${item.label};`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create foreign table operations notebook: ${errorMessage}`);
                    
                    if (client) {
                        try {
                            await client.end();
                        } catch (closeErr) {
                            console.error('Error closing connection:', closeErr);
                        }
                    }
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.editForeignTable', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid foreign table selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
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
                    
                    const tableQuery = `
                        SELECT 
                            c.relname as table_name,
                            fs.srvname as server_name,
                            array_agg(
                                format('%I %s%s', 
                                    a.attname, 
                                    format_type(a.atttypid, a.atttypmod),
                                    CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
                                ) ORDER BY a.attnum
                            ) as columns,
                            ftoptions as options
                        FROM pg_class c
                        JOIN pg_foreign_table ft ON c.oid = ft.ftrelid
                        JOIN pg_foreign_server fs ON fs.oid = ft.ftserver
                        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
                        LEFT JOIN pg_foreign_table_options fto ON fto.ftrelid = ft.ftrelid
                        WHERE c.relname = $1
                        AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE n.nspname = $2)
                        GROUP BY c.relname, fs.srvname, ftoptions`;

                    const tableResult = await client.query(tableQuery, [item.label, item.schema]);
                    if (tableResult.rows.length === 0) {
                        throw new Error('Foreign table not found');
                    }

                    const tableInfo = tableResult.rows[0];
                    const createStatement = `CREATE FOREIGN TABLE ${item.schema}.${item.label} (\n${
                        tableInfo.columns.map((col: string) => '    ' + col).join(',\n')
                    }\n) SERVER ${tableInfo.server_name}${
                        tableInfo.options ? '\nOPTIONS (\n    ' + tableInfo.options.map((opt: string) => opt).join(',\n    ') + '\n)' : ''
                    };`;
                    
                    const metadata = {
                        connectionId: item.connectionId,
                        databaseName: item.databaseName,
                        host: connection.host,
                        port: connection.port,
                        username: connection.username,
                        password: connection.password
                    };

                    const notebookData = new vscode.NotebookData([
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Markup,
                            `# Edit Foreign Table: ${item.schema}.${item.label}\n\nModify the foreign table definition below and execute the cells to update it.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Drop existing foreign table
DROP FOREIGN TABLE IF EXISTS ${item.schema}.${item.label};

-- Create foreign table with new definition
${createStatement}`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create foreign table edit notebook: ${errorMessage}`);
                    
                    if (client) {
                        try {
                            await client.end();
                        } catch (closeErr) {
                            console.error('Error closing connection:', closeErr);
                        }
                    }
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        })
    );

    // Migrate existing passwords to SecretStorage on extension activation
    migrateExistingPasswords(context).catch(err => {
        console.error('Failed to migrate passwords:', err);
    });

    // Extension operations
    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.enableExtension', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid extension selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
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
                    
                    // Extract extension name from label (removes version info)
                    const extensionName = item.label.split(' ')[0];
                    
                    // Create notebook for enabling extension
                    const metadata = {
                        connectionId: item.connectionId,
                        databaseName: item.databaseName,
                        host: connection.host,
                        port: connection.port,
                        username: connection.username,
                        password: connection.password
                    };

                    const notebookData = new vscode.NotebookData([
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
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create extension notebook: ${errorMessage}`);
                    
                    if (client) {
                        try {
                            await client.end();
                        } catch (closeErr) {
                            console.error('Error closing connection:', closeErr);
                        }
                    }
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.extensionOperations', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid extension selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                const metadata = {
                    connectionId: item.connectionId,
                    databaseName: item.databaseName,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                    password: connection.password
                };

                // Extract extension name from label (removes version info)
                const extensionName = item.label.split(' ')[0];

                const notebookData = new vscode.NotebookData([
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
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create extension operations notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.dropExtension', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid extension selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                const metadata = {
                    connectionId: item.connectionId,
                    databaseName: item.databaseName,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                    password: connection.password
                };

                // Extract extension name from label (removes version info)
                const extensionName = item.label.split(' ')[0];

                const notebookData = new vscode.NotebookData([
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
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create drop extension notebook: ${err.message}`);
            }
        })
    );

    // User and Role operations
    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.createUser', async (item: DatabaseTreeItem) => {
            if (!item || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                const metadata = {
                    connectionId: item.connectionId,
                    databaseName: item.databaseName,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                    password: connection.password
                };

                const notebookData = new vscode.NotebookData([
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `# Create New User\n\nExecute the cell below to create a new user. Modify the user attributes as needed.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Create a new user with login privileges
CREATE USER username WITH
    LOGIN
    PASSWORD 'strong_password'
    CREATEDB
    -- Add more attributes as needed:
    -- SUPERUSER
    -- CREATEROLE
    -- REPLICATION
    -- CONNECTION LIMIT 5
    -- VALID UNTIL 'timestamp'
;

-- Optional: Grant default privileges
GRANT CONNECT ON DATABASE database_name TO username;
-- GRANT role_name TO username;`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create user notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.createRole', async (item: DatabaseTreeItem) => {
            if (!item || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                const metadata = {
                    connectionId: item.connectionId,
                    databaseName: item.databaseName,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                    password: connection.password
                };

                const notebookData = new vscode.NotebookData([
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `# Create New Role\n\nExecute the cell below to create a new role. Modify the role attributes as needed.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Create a new role
CREATE ROLE role_name WITH
    NOLOGIN
    -- Add more attributes as needed:
    -- SUPERUSER | NOSUPERUSER
    -- CREATEDB | NOCREATEDB
    -- CREATEROLE | NOCREATEROLE
    -- INHERIT | NOINHERIT
    -- REPLICATION | NOREPLICATION
;

-- Optional: Grant privileges to the role
-- GRANT privilege ON object TO role_name;
-- GRANT other_role TO role_name;`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create role notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.editRole', async (item: DatabaseTreeItem) => {
            if (!item || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid role selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                const metadata = {
                    connectionId: item.connectionId,
                    databaseName: item.databaseName,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                    password: connection.password
                };

                const notebookData = new vscode.NotebookData([
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `# Edit Role: ${item.label}\n\nModify the role's attributes using the ALTER ROLE command below.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Modify role attributes
ALTER ROLE ${item.label}
    -- Uncomment and modify the attributes you want to change:
    -- WITH PASSWORD 'new_password'
    -- SUPERUSER | NOSUPERUSER
    -- CREATEDB | NOCREATEDB
    -- CREATEROLE | NOCREATEROLE
    -- LOGIN | NOLOGIN
    -- INHERIT | NOINHERIT
    -- REPLICATION | NOREPLICATION
    -- CONNECTION LIMIT 5
    -- VALID UNTIL 'timestamp'
;`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create role edit notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.grantRevoke', async (item: DatabaseTreeItem) => {
            if (!item || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid role selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                const metadata = {
                    connectionId: item.connectionId,
                    databaseName: item.databaseName,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                    password: connection.password
                };

                const notebookData = new vscode.NotebookData([
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `# Manage Privileges for ${item.label}\n\nGrant or revoke privileges using the commands below.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Grant database-level privileges
GRANT CONNECT ON DATABASE database_name TO ${item.label};
-- GRANT CREATE ON DATABASE database_name TO ${item.label};

-- Grant schema-level privileges
GRANT USAGE ON SCHEMA schema_name TO ${item.label};
-- GRANT CREATE ON SCHEMA schema_name TO ${item.label};

-- Grant table-level privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA schema_name TO ${item.label};
-- GRANT SELECT ON TABLE schema_name.table_name TO ${item.label};

-- Grant function-level privileges
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA schema_name TO ${item.label};
-- GRANT EXECUTE ON FUNCTION schema_name.function_name TO ${item.label};

-- Grant sequence privileges
GRANT USAGE ON ALL SEQUENCES IN SCHEMA schema_name TO ${item.label};

-- Revoke privileges (examples)
-- REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA schema_name FROM ${item.label};
-- REVOKE ALL PRIVILEGES ON DATABASE database_name FROM ${item.label};`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create privileges notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.dropRole', async (item: DatabaseTreeItem) => {
            if (!item || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid role selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                const metadata = {
                    connectionId: item.connectionId,
                    databaseName: item.databaseName,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                    password: connection.password
                };

                const notebookData = new vscode.NotebookData([
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `# Drop Role: ${item.label}\n\n⚠️ **Warning:** This action will permanently delete the role. Make sure to reassign owned objects first if needed.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Optional: Reassign owned objects to another role first
REASSIGN OWNED BY ${item.label} TO some_other_role;

-- Drop role
DROP ROLE ${item.label};`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create drop role notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.roleOperations', async (item: DatabaseTreeItem) => {
            if (!item || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid role selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                const metadata = {
                    connectionId: item.connectionId,
                    databaseName: item.databaseName,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                    password: connection.password
                };

                const notebookData = new vscode.NotebookData([
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `# Role Operations: ${item.label}\n\nThis notebook contains common operations for managing the role:\n- View role attributes\n- List role memberships\n- List granted privileges\n- Manage role`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- View role attributes
SELECT r.rolname,
       r.rolsuper as "Superuser",
       r.rolinherit as "Inherit",
       r.rolcreaterole as "Create role",
       r.rolcreatedb as "Create DB",
       r.rolcanlogin as "Can login",
       r.rolreplication as "Replication",
       r.rolconnlimit as "Connection limit",
       r.rolvaliduntil as "Valid until"
FROM pg_roles r
WHERE r.rolname = '${item.label}';`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- List role memberships (roles this role belongs to)
SELECT r.rolname as "Role",
       m.member as "Member of",
       m.grantor as "Granted by",
       m.admin_option as "With admin option"
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.member
JOIN pg_roles m ON m.oid = am.roleid
WHERE r.rolname = '${item.label}';`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- List members of this role (roles that belong to this role)
SELECT r.rolname as "Role",
       m.member as "Has member",
       m.grantor as "Granted by",
       m.admin_option as "With admin option"
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
WHERE r.rolname = '${item.label}';`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- List granted privileges
SELECT 
    grantor,
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.table_privileges
WHERE grantee = '${item.label}'
ORDER BY table_schema, table_name, privilege_type;`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create role operations notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.showRoleProperties', async (item: DatabaseTreeItem) => {
            if (!item || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid role selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
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

                    // Query for role details with proper table aliases
                    const roleQuery = `
                        WITH RECURSIVE
                        role_memberships AS (
                            SELECT 
                                r.rolname,
                                r.rolsuper,
                                r.rolinherit,
                                r.rolcreaterole,
                                r.rolcreatedb,
                                r.rolcanlogin,
                                r.rolreplication,
                                r.rolconnlimit,
                                r.rolvaliduntil,
                                r.rolbypassrls,
                                (
                                    SELECT array_agg(gr.rolname)
                                    FROM pg_auth_members m
                                    JOIN pg_roles gr ON gr.oid = m.roleid
                                    WHERE m.member = r.oid
                                ) as member_of,
                                (
                                    SELECT array_agg(gr.rolname)
                                    FROM pg_auth_members m
                                    JOIN pg_roles gr ON gr.oid = m.member
                                    WHERE m.roleid = r.oid
                                ) as members
                            FROM pg_roles r
                            WHERE r.rolname = $1
                        ),
                        role_privileges AS (
                            SELECT array_agg(
                                privilege_type || ' ON ' || 
                                CASE 
                                    WHEN table_schema = 'public' THEN table_name
                                    ELSE table_schema || '.' || table_name
                                END
                            ) as privileges
                            FROM information_schema.table_privileges
                            WHERE grantee = $1
                            GROUP BY grantee
                        ),
                        database_access AS (
                            SELECT array_agg(quote_ident(d.datname)) as databases
                            FROM pg_database d
                            JOIN pg_roles r ON r.rolname = $1
                            WHERE EXISTS (
                                SELECT 1 FROM aclexplode(d.datacl) acl
                                WHERE acl.grantee = r.oid
                                AND acl.privilege_type = 'CONNECT'
                            )
                        )
                        SELECT 
                            rm.*,
                            COALESCE(rp.privileges, ARRAY[]::text[]) as privileges,
                            COALESCE(da.databases, ARRAY[]::text[]) as accessible_databases
                        FROM role_memberships rm
                        LEFT JOIN role_privileges rp ON true
                        LEFT JOIN database_access da ON true;`;

                    const roleResult = await client.query(roleQuery, [item.label]);
                    if (roleResult.rows.length === 0) {
                        throw new Error('Role not found');
                    }

                    const role = roleResult.rows[0];
                    const metadata = {
                        connectionId: item.connectionId,
                        databaseName: item.databaseName,
                        host: connection.host,
                        port: connection.port,
                        username: connection.username,
                        password: connection.password
                    };

                    // Format attributes list
                    const attributes = [
                        role.rolsuper ? '✓ Superuser' : '✗ Superuser',
                        role.rolinherit ? '✓ Inherit' : '✗ Inherit',
                        role.rolcreaterole ? '✓ Create role' : '✗ Create role',
                        role.rolcreatedb ? '✓ Create DB' : '✗ Create DB',
                        role.rolcanlogin ? '✓ Can login' : '✗ Can login',
                        role.rolreplication ? '✓ Replication' : '✗ Replication',
                        role.rolbypassrls ? '✓ Bypass RLS' : '✗ Bypass RLS',
                        `Connection limit: ${role.rolconnlimit === -1 ? 'no limit' : role.rolconnlimit}`,
                        role.rolvaliduntil ? `Valid until: ${role.rolvaliduntil}` : 'No expiration'
                    ].join('\n');

                    // Create sections for the markdown content
                    const membershipSection = [
                        '## Role Memberships',
                        role.member_of && role.member_of.length > 0 
                            ? `\n### Member of:\n- ${role.member_of.join('\n- ')}` 
                            : '\n### Member of: None',
                        role.members && role.members.length > 0
                            ? `\n### Has members:\n- ${role.members.join('\n- ')}` 
                            : '\n### Has members: None'
                    ].join('\n');

                    const databasesSection = role.accessible_databases && role.accessible_databases.length > 0
                        ? `\n## Accessible Databases\n- ${role.accessible_databases.join('\n- ')}`
                        : '\n## Accessible Databases\nNo database access';

                    const privilegesSection = role.privileges && role.privileges.length > 0
                        ? `\n## Granted Privileges\n- ${role.privileges.join('\n- ')}`
                        : '\n## Granted Privileges\nNo specific privileges granted';

                    // Create notebook with role information
                    const notebookData = new vscode.NotebookData([
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Markup,
                            `# Role Properties: ${item.label}\n\n` +
                            `## Attributes\n\`\`\`\n${attributes}\n\`\`\`\n\n` +
                            membershipSection + '\n' +
                            databasesSection + '\n' +
                            privilegesSection,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- View role details
SELECT r.rolname as "Name",
       r.rolsuper as "Superuser",
       r.rolinherit as "Inherit",
       r.rolcreaterole as "Create role",
       r.rolcreatedb as "Create DB",
       r.rolcanlogin as "Can login",
       r.rolreplication as "Replication",
       r.rolconnlimit as "Connection limit",
       r.rolvaliduntil as "Valid until",
       r.rolbypassrls as "Bypass RLS"
FROM pg_roles r
WHERE r.rolname = '${item.label}';

-- View role memberships
SELECT 
    r.rolname as role,
    g.rolname as member_of,
    m.admin_option
FROM pg_roles r
JOIN pg_auth_members m ON r.oid = m.member
JOIN pg_roles g ON g.oid = m.roleid
WHERE r.rolname = '${item.label}';

-- View role members
SELECT 
    r.rolname as role,
    m.rolname as has_member,
    am.admin_option
FROM pg_roles r
JOIN pg_auth_members am ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
WHERE r.rolname = '${item.label}';

-- View granted privileges
SELECT 
    grantor,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.table_privileges
WHERE grantee = '${item.label}'
ORDER BY table_schema, table_name, privilege_type;`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to show role properties: ${errorMessage}`);
                    
                    if (client) {
                        try {
                            await client.end();
                        } catch (closeErr) {
                            console.error('Error closing connection:', closeErr);
                        }
                    }
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.createInDatabase', async (item: DatabaseTreeItem) => {
            if (!item || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid database selection');
                return;
            }

            const items = [
                { label: 'Schema', detail: 'Create a new schema in this database', query: `CREATE SCHEMA schema_name;` },
                { label: 'User', detail: 'Create a new user with login privileges', query: `CREATE USER username WITH\n    LOGIN\n    PASSWORD 'strong_password'\n    CREATEDB;` },
                { label: 'Role', detail: 'Create a new role', query: `CREATE ROLE role_name WITH\n    NOLOGIN\n    INHERIT;` },
                { label: 'Extension', detail: 'Enable a PostgreSQL extension', query: `CREATE EXTENSION IF NOT EXISTS extension_name;` }
            ];

            const selection = await vscode.window.showQuickPick(items, {
                title: 'Create in Database',
                placeHolder: 'Select what to create'
            });

            if (selection) {
                try {
                    const connection = await getConnectionWithPassword(item.connectionId, context);
                    const metadata = {
                        connectionId: item.connectionId,
                        databaseName: item.databaseName,
                        host: connection.host,
                        port: connection.port,
                        username: connection.username,
                        password: connection.password
                    };

                    const notebookData = new vscode.NotebookData([
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Markup,
                            `# Create New ${selection.label} in Database: ${item.databaseName}\n\nModify the definition below and execute the cell to create the ${selection.label.toLowerCase()}.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            selection.query,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    vscode.window.showErrorMessage(`Failed to create notebook: ${err.message}`);
                }
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.showDashboard', async (item: DatabaseTreeItem) => {
            if (!item || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid database selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                const metadata = {
                    connectionId: item.connectionId,
                    databaseName: item.databaseName,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                    password: connection.password
                };

                const notebookData = new vscode.NotebookData([
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        `# Database Dashboard: ${item.label}\n\nThis dashboard provides an overview of your database:\n- Database size and statistics\n- Active connections\n- Table sizes and row counts\n- Index usage statistics\n- Cache hit ratios`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Database size and statistics
SELECT
    pg_size_pretty(pg_database_size(current_database())) as "Database Size",
    (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as "Active Connections",
    (SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as "User Tables",
    (SELECT count(*) FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as "Indexes";`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Table sizes and row counts
SELECT 
    schemaname as "Schema",
    relname as "Table",
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) as "Total Size",
    pg_size_pretty(pg_table_size(schemaname || '.' || relname)) as "Table Size",
    pg_size_pretty(pg_indexes_size(schemaname || '.' || relname)) as "Index Size",
    n_live_tup as "Live Rows"
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC
LIMIT 10;`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Index usage statistics
SELECT 
    schemaname as "Schema",
    relname as "Table",
    indexrelname as "Index",
    idx_scan as "Index Scans",
    idx_tup_read as "Tuples Read",
    idx_tup_fetch as "Tuples Fetched"
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC
LIMIT 10;`,
                        'sql'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Cache hit ratios
SELECT 
    'Index Hit Rate' as "Metric",
    round(100 * sum(idx_blks_hit) / nullif(sum(idx_blks_hit + idx_blks_read), 0), 2) as "Ratio %"
FROM pg_statio_user_indexes
UNION ALL
SELECT 
    'Table Hit Rate',
    round(100 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit + heap_blks_read), 0), 2)
FROM pg_statio_user_tables;`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to show dashboard: ${err.message}`);
            }
        })
    );
}

async function migrateExistingPasswords(context: vscode.ExtensionContext) {
    try {
        const config = vscode.workspace.getConfiguration();
        const connections = config.get<any[]>('postgresExplorer.connections') || [];
        
        // First remove passwords from settings to ensure they don't persist
        const sanitizedConnections = connections.map(({ password, ...connWithoutPassword }) => connWithoutPassword);
        await config.update('postgresExplorer.connections', sanitizedConnections, vscode.ConfigurationTarget.Global);
        
        // Then store passwords in SecretStorage
        for (const conn of connections) {
            if (conn.password) {
                await context.secrets.store(`postgres-password-${conn.id}`, conn.password);
            }
        }
        
        return true;
    } catch (error) {
        console.error('Failed to migrate passwords:', error);
        return false;
    }
}

// Update command handlers to use SecretStorage
async function getConnectionWithPassword(connectionId: string, context: vscode.ExtensionContext): Promise<any> {
    const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
    const connection = connections.find(c => c.id === connectionId);
    
    if (!connection) {
        throw new Error('Connection not found');
    }

    const password = await context.secrets.get(`postgres-password-${connectionId}`);
    if (!password) {
        throw new Error('Password not found in secure storage');
    }

    return {
        ...connection,
        password
    };
}

const createNotebookMetadata = (connection: any, databaseName?: string) => ({
    connectionId: connection.id,
    databaseName: databaseName || connection.database,
    host: connection.host,
    port: connection.port,
    username: connection.username,
    password: connection.password,
    custom: {
        cells: [],
        metadata: {
            connectionId: connection.id,
            databaseName: databaseName || connection.database,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            password: connection.password,
            enableScripts: true
        }
    }
});

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
                    new DatabaseItem('Materialized Views', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.label, element.databaseName, element.connectionId),
                    new DatabaseItem('Functions', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.label, element.databaseName, element.connectionId),
                    new DatabaseItem('Types', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.label, element.databaseName, element.connectionId),
                    new DatabaseItem('Foreign Tables', vscode.TreeItemCollapsibleState.Collapsed, 'category', element.label, element.databaseName, element.connectionId)
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
                
                if (element.label === 'Materialized Views') {
                    const result = await client.query(
                        "SELECT matviewname as name FROM pg_matviews WHERE schemaname = $1",
                        [element.schema]
                    );
                    return result.rows.map(row => new DatabaseItem(
                        row.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'materialized-view',
                        element.schema,
                        element.databaseName,
                        element.connectionId
                    ));
                } else if (element.label === 'Functions') {
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
                } else if (element.label === 'Types') {
                    const result = await client.query(
                        `SELECT t.typname as name
                         FROM pg_type t
                         JOIN pg_namespace n ON t.typnamespace = n.oid
                         WHERE n.nspname = $1
                         AND t.typtype = 'c'`,
                        [element.schema]
                    );
                    return result.rows.map(row => new DatabaseItem(
                        row.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'type',
                        element.schema,
                        element.databaseName,
                        element.connectionId
                    ));
                } else if (element.label === 'Foreign Tables') {
                    const result = await client.query(
                        `SELECT ft.relname as name
                         FROM pg_foreign_table ft
                         JOIN pg_class c ON ft.ftrelid = c.oid
                         JOIN pg_namespace n ON c.relnamespace = n.oid
                         WHERE n.nspname = $1`,
                        [element.schema]
                    );
                    return result.rows.map(row => new DatabaseItem(
                        row.name,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'foreign-table',
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
        public readonly type: 'connection' | 'database' | 'schema' | 'table' | 'column' | 'category' | 'function' | 'view' | 'materialized-view' | 'type' | 'foreign-table',
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
            view: new vscode.ThemeIcon('type-hierarchy-sub'),
            'materialized-view': new vscode.ThemeIcon('symbol-method'),
            type: new vscode.ThemeIcon('symbol-struct'),
            'foreign-table': new vscode.ThemeIcon('symbol-namespace')
        }[type];
    }
}

export function deactivate() {
    // Remove client handling as it's now handled per request
}
