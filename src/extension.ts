import * as vscode from 'vscode';
import { Client } from 'pg';
import { ConnectionFormPanel } from './connectionForm';
import { DatabaseTreeProvider, DatabaseTreeItem } from './databaseTreeProvider';
import { TablePropertiesPanel } from './tableProperties';
import { PostgresNotebookProvider } from './notebookProvider';
import { PostgresKernel } from './notebookKernel';
import { PostgresNotebookSerializer } from './postgresNotebook';

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
                    
                    // Get function details for CREATE OR REPLACE statement
                    const functionQuery = `
                        SELECT p.proname,
                               pg_get_function_arguments(p.oid) as arguments,
                               pg_get_function_result(p.oid) as result_type,
                               pg_get_functiondef(p.oid) as definition
                        FROM pg_proc p
                        WHERE p.proname = $1
                        AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`;

                    const functionResult = await client.query(functionQuery, [item.label, item.schema]);
                    if (functionResult.rows.length === 0) {
                        throw new Error('Function not found');
                    }

                    const functionInfo = functionResult.rows[0];
                    
                    // Create notebook with function operations
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
                            `# Function Operations: ${item.schema}.${item.label}\n\nThis notebook contains common operations for the PostgreSQL function:\n- Create or replace function\n- Call function\n- Drop function`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Create or replace function\n${functionInfo.definition}`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Call function\nSELECT ${item.schema}.${item.label}(${functionInfo.arguments ? '\n  -- Replace with actual values:\n  ' + functionInfo.arguments.split(',').join(',\n  ') : ''});`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Drop function\nDROP FUNCTION IF EXISTS ${item.schema}.${item.label}(${functionInfo.arguments});`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create function operations notebook: ${errorMessage}`);
                    
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
        // ...existing commands...
        vscode.commands.registerCommand('postgres-explorer.createReplaceFunction', async (item: DatabaseTreeItem) => {
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
                    
                    // Get function definition
                    const functionQuery = `
                        SELECT pg_get_functiondef(p.oid) as definition
                        FROM pg_proc p
                        WHERE p.proname = $1
                        AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`;

                    const functionResult = await client.query(functionQuery, [item.label, item.schema]);
                    if (functionResult.rows.length === 0) {
                        throw new Error('Function not found');
                    }

                    const functionInfo = functionResult.rows[0];
                    
                    // Create notebook with function definition
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
                            `# Edit Function: ${item.schema}.${item.label}\n\nModify the function definition below and execute the cell to update the function.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            functionInfo.definition,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create function edit notebook: ${errorMessage}`);
                    
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

        vscode.commands.registerCommand('postgres-explorer.callFunction', async (item: DatabaseTreeItem) => {
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
                    
                    // Get function arguments
                    const functionQuery = `
                        SELECT p.proname,
                               pg_get_function_arguments(p.oid) as arguments,
                               pg_get_function_result(p.oid) as result_type,
                               d.description
                        FROM pg_proc p
                        LEFT JOIN pg_description d ON p.oid = d.objoid
                        WHERE p.proname = $1
                        AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`;

                    const functionResult = await client.query(functionQuery, [item.label, item.schema]);
                    if (functionResult.rows.length === 0) {
                        throw new Error('Function not found');
                    }

                    const functionInfo = functionResult.rows[0];
                    
                    // Create notebook for calling function
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
                            `# Call Function: ${item.schema}.${item.label}\n\n${functionInfo.description ? '**Description:** ' + functionInfo.description + '\n\n' : ''}` +
                            `**Arguments:** ${functionInfo.arguments || 'None'}\n` +
                            `**Returns:** ${functionInfo.result_type}\n\n` +
                            `Edit the argument values below and execute the cell to call the function.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Call function
SELECT ${item.schema}.${item.label}(${functionInfo.arguments ? 
    '\n  -- Replace with actual values:\n  ' + functionInfo.arguments.split(',').join(',\n  ') 
    : ''});`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create function call notebook: ${errorMessage}`);
                    
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

        vscode.commands.registerCommand('postgres-explorer.dropFunction', async (item: DatabaseTreeItem) => {
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
                    
                    // Get function arguments
                    const functionQuery = `
                        SELECT pg_get_function_arguments(p.oid) as arguments
                        FROM pg_proc p
                        WHERE p.proname = $1
                        AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`;

                    const functionResult = await client.query(functionQuery, [item.label, item.schema]);
                    if (functionResult.rows.length === 0) {
                        throw new Error('Function not found');
                    }

                    const functionInfo = functionResult.rows[0];
                    
                    // Create notebook for dropping function
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
                            `# Drop Function: ${item.schema}.${item.label}\n\nExecute the cell below to permanently remove this function. This action cannot be undone.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Drop function
DROP FUNCTION IF EXISTS ${item.schema}.${item.label}(${functionInfo.arguments});`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create drop function notebook: ${errorMessage}`);
                    
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

        vscode.commands.registerCommand('postgres-explorer.editTableDefinition', async (item: DatabaseTreeItem) => {
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
                    
                    // Get table definition with all constraints
                    const tableQuery = `
                        WITH columns AS (
                            SELECT 
                                c.column_name,
                                c.data_type,
                                c.character_maximum_length,
                                c.numeric_precision,
                                c.numeric_scale,
                                c.is_nullable,
                                c.column_default,
                                c.ordinal_position,
                                array_agg(DISTINCT tc.constraint_type) as constraint_types
                            FROM information_schema.columns c
                            LEFT JOIN information_schema.key_column_usage kcu 
                                ON c.table_schema = kcu.table_schema 
                                AND c.table_name = kcu.table_name
                                AND c.column_name = kcu.column_name
                            LEFT JOIN information_schema.table_constraints tc
                                ON kcu.constraint_name = tc.constraint_name
                                AND kcu.table_schema = tc.table_schema
                                AND kcu.table_name = tc.table_name
                            WHERE c.table_schema = $1
                            AND c.table_name = $2
                            GROUP BY 
                                c.column_name, c.data_type, c.character_maximum_length,
                                c.numeric_precision, c.numeric_scale, c.is_nullable,
                                c.column_default, c.ordinal_position
                        ),
                        constraints AS (
                            SELECT 
                                tc.constraint_name,
                                tc.constraint_type,
                                array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns,
                                CASE 
                                    WHEN tc.constraint_type = 'FOREIGN KEY' THEN
                                        json_build_object(
                                            'schema', ccu.table_schema,
                                            'table', ccu.table_name,
                                            'columns', array_agg(ccu.column_name ORDER BY kcu.ordinal_position)
                                        )
                                    ELSE NULL
                                END as foreign_key_reference
                            FROM information_schema.table_constraints tc
                            JOIN information_schema.key_column_usage kcu 
                                ON tc.constraint_name = kcu.constraint_name
                                AND tc.table_schema = kcu.table_schema
                                AND tc.table_name = kcu.table_name
                            LEFT JOIN information_schema.constraint_column_usage ccu
                                ON tc.constraint_name = ccu.constraint_name
                                AND tc.constraint_schema = ccu.constraint_schema
                            WHERE tc.table_schema = $1
                            AND tc.table_name = $2
                            GROUP BY tc.constraint_name, tc.constraint_type, ccu.table_schema, ccu.table_name
                        )
                        SELECT 
                            columns.*,
                            json_agg(json_build_object(
                                'type', c.constraint_type,
                                'name', c.constraint_name,
                                'columns', c.columns,
                                'foreign_key_reference', c.foreign_key_reference
                            )) as table_constraints
                        FROM columns
                        LEFT JOIN constraints c ON c.columns @> ARRAY[columns.column_name]
                        GROUP BY 
                            columns.column_name, columns.data_type, columns.character_maximum_length,
                            columns.numeric_precision, columns.numeric_scale, columns.is_nullable,
                            columns.column_default, columns.ordinal_position, columns.constraint_types
                        ORDER BY columns.ordinal_position`;

                    const tableResult = await client.query(tableQuery, [item.schema, item.label]);
                    if (tableResult.rows.length === 0) {
                        throw new Error('Table not found');
                    }

                    // Generate CREATE TABLE statement with all constraints
                    let tableConstraints = new Map();
                    let columnDefs: string[] = [];

                    // Process each column and inline column constraints
                    tableResult.rows.forEach(col => {
                        let colDef = `${col.column_name} ${col.data_type}`;
                        
                        // Add length/precision/scale if specified
                        if (col.character_maximum_length) {
                            colDef += `(${col.character_maximum_length})`;
                        } else if (col.numeric_precision) {
                            colDef += `(${col.numeric_precision}${col.numeric_scale ? `,${col.numeric_scale}` : ''})`;
                        }

                        // Add NOT NULL constraint
                        if (col.is_nullable === 'NO') {
                            colDef += ' NOT NULL';
                        }

                        // Add column default
                        if (col.column_default) {
                            colDef += ` DEFAULT ${col.column_default}`;
                        }

                        columnDefs.push(colDef);

                        // Process table constraints
                        if (col.table_constraints && col.table_constraints[0]?.type !== null) {
                            col.table_constraints.forEach((constraint: { type: any; name: any; columns: any[]; foreign_key_reference: any; }) => {
                                const key = `${constraint.type}_${constraint.name}`;
                                if (!tableConstraints.has(key)) {
                                    let constraintDef = `CONSTRAINT ${constraint.name} `;
                                    switch (constraint.type) {
                                        case 'PRIMARY KEY':
                                            constraintDef += `PRIMARY KEY (${constraint.columns.join(', ')})`;
                                            break;
                                        case 'UNIQUE':
                                            constraintDef += `UNIQUE (${constraint.columns.join(', ')})`;
                                            break;
                                        case 'FOREIGN KEY':
                                            const ref = constraint.foreign_key_reference;
                                            constraintDef += `FOREIGN KEY (${constraint.columns.join(', ')}) ` +
                                                `REFERENCES ${ref.schema}.${ref.table} (${ref.columns.join(', ')})`;
                                            break;
                                    }
                                    tableConstraints.set(key, constraintDef);
                                }
                            });
                        }
                    });

                    // Combine column definitions and table constraints
                    const createTableStatement = [
                        `CREATE TABLE ${item.schema}.${item.label} (`,
                        columnDefs.join(',\n    '),
                        tableConstraints.size > 0 ? ',' : '',
                        tableConstraints.size > 0 ? Array.from(tableConstraints.values()).join(',\n    ') : '',
                        ');'
                    ].join('\n    ');
                    
                    // Create notebook for editing table
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
                            `# Edit Table: ${item.schema}.${item.label}\n\nModify the table definition below and execute the cell to update the table structure. Note that this will create a new table - you'll need to migrate the data separately if needed.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            createTableStatement,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create table edit notebook: ${errorMessage}`);
                    
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

        vscode.commands.registerCommand('postgres-explorer.viewTableData', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid table selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                // Create notebook for viewing data
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
                        `# View Table Data: ${item.schema}.${item.label}\n\nModify the query below to filter or transform the data as needed.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- View table data
SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.dropTable', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid table selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                // Create notebook for dropping table
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
                        `# Drop Table: ${item.schema}.${item.label}\n\n⚠️ **Warning:** This action will permanently delete the table and all its data. This operation cannot be undone.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Drop table
DROP TABLE IF EXISTS ${item.schema}.${item.label};`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.editViewDefinition', async (item: DatabaseTreeItem) => {
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
                    
                    // Get view definition
                    const viewQuery = `SELECT pg_get_viewdef($1::regclass, true) as definition`;
                    const viewResult = await client.query(viewQuery, [`${item.schema}.${item.label}`]);
                    if (!viewResult.rows[0]?.definition) {
                        throw new Error('View definition not found');
                    }

                    const createViewStatement = `CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS\n${viewResult.rows[0].definition}`;
                    
                    // Create notebook for editing view
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
                            `# Edit View: ${item.schema}.${item.label}\n\nModify the view definition below and execute the cell to update the view.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            createViewStatement,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create view edit notebook: ${errorMessage}`);
                    
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

        vscode.commands.registerCommand('postgres-explorer.viewViewData', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid view selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                // Create notebook for viewing data
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
                        `# View Data: ${item.schema}.${item.label}\n\nModify the query below to filter or transform the data as needed.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- View data
SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.dropView', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid view selection');
                return;
            }

            try {
                const connection = await getConnectionWithPassword(item.connectionId, context);
                // Create notebook for dropping view
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
                        `# Drop View: ${item.schema}.${item.label}\n\n⚠️ **Warning:** This action will permanently delete the view. This operation cannot be undone.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Drop view
DROP VIEW IF EXISTS ${item.schema}.${item.label};`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        })
    );

    // Migrate existing passwords to SecretStorage on extension activation
    migrateExistingPasswords(context).catch(err => {
        console.error('Failed to migrate passwords:', err);
    });
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
