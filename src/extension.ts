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
                                column_name,
                                data_type,
                                character_maximum_length,
                                numeric_precision,
                                numeric_scale,
                                is_nullable,
                                column_default,
                                ordinal_position
                            FROM information_schema.columns
                            WHERE table_schema = $1
                            AND table_name = $2
                            ORDER BY ordinal_position
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
                            (
                                SELECT string_agg(
                                    format('%I %s%s%s', 
                                        column_name, 
                                        data_type || 
                                            CASE 
                                                WHEN character_maximum_length IS NOT NULL THEN '(' || character_maximum_length || ')'
                                                WHEN numeric_precision IS NOT NULL THEN 
                                                    '(' || numeric_precision || COALESCE(',' || numeric_scale, '') || ')'
                                                ELSE ''
                                            END,
                                        CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
                                        CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END
                                    ),
                                    E',\n    '
                                    ORDER BY ordinal_position
                                )
                                FROM columns
                            ) as columns,
                            COALESCE(
                                (
                                    SELECT json_agg(
                                        json_build_object(
                                            'name', constraint_name,
                                            'type', constraint_type,
                                            'columns', columns,
                                            'reference', foreign_key_reference
                                        )
                                        ORDER BY constraint_name
                                    )
                                    FROM constraints
                                ),
                                '[]'::json
                            ) as constraints`;

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
        }),

        vscode.commands.registerCommand('postgres-explorer.tableOperations', async (item: DatabaseTreeItem) => {
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
                                column_name,
                                data_type,
                                character_maximum_length,
                                numeric_precision,
                                numeric_scale,
                                is_nullable,
                                column_default,
                                ordinal_position
                            FROM information_schema.columns
                            WHERE table_schema = $1
                            AND table_name = $2
                            ORDER BY ordinal_position
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
                            (
                                SELECT string_agg(
                                    format('%I %s%s%s', 
                                        column_name, 
                                        data_type || 
                                            CASE 
                                                WHEN character_maximum_length IS NOT NULL THEN '(' || character_maximum_length || ')'
                                                WHEN numeric_precision IS NOT NULL THEN 
                                                    '(' || numeric_precision || COALESCE(',' || numeric_scale, '') || ')'
                                                ELSE ''
                                            END,
                                        CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
                                        CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END
                                    ),
                                    E',\n    '
                                    ORDER BY ordinal_position
                                )
                                FROM columns
                            ) as columns,
                            COALESCE(
                                (
                                    SELECT json_agg(
                                        json_build_object(
                                            'name', constraint_name,
                                            'type', constraint_type,
                                            'columns', columns,
                                            'reference', foreign_key_reference
                                        )
                                        ORDER BY constraint_name
                                    )
                                    FROM constraints
                                ),
                                '[]'::json
                            ) as constraints`;

                    const result = await client.query(tableQuery, [item.schema, item.label]);
                    
                    // Create notebook for table operations
                    const metadata = {
                        connectionId: item.connectionId,
                        databaseName: item.databaseName,
                        host: connection.host,
                        port: connection.port,
                        username: connection.username,
                        password: connection.password
                    };

                    // Build CREATE TABLE statement
                    const createTable = `CREATE TABLE ${item.schema}.${item.label} (\n    ${result.rows[0].columns}`;
                    
                    // Add constraints if they exist
                    const constraints = result.rows[0].constraints[0] && result.rows[0].constraints[0].name ? 
                        result.rows[0].constraints.map((c: { type: string; name: string; columns: string[]; reference?: { schema: string; table: string; columns: string[] } }) => {
                            switch(c.type) {
                                case 'PRIMARY KEY':
                                    return `    CONSTRAINT ${c.name} PRIMARY KEY (${c.columns.join(', ')})`;
                                case 'FOREIGN KEY':
                                    return `    CONSTRAINT ${c.name} FOREIGN KEY (${c.columns.join(', ')}) ` +
                                        `REFERENCES ${c.reference?.schema}.${c.reference?.table} (${c.reference?.columns.join(', ')})`;
                                case 'UNIQUE':
                                    return `    CONSTRAINT ${c.name} UNIQUE (${c.columns.join(', ')})`;
                                default:
                                    return null;
                            }
                        }).filter((c: string | null): c is string => c !== null).join(',\n') : '';

                    const tableDefinition = `${createTable}${constraints ? ',\n' + constraints : ''}\n);`;

                    const notebookData = new vscode.NotebookData([
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Markup,
                            `# Table Operations: ${item.schema}.${item.label}\n\nThis notebook contains common operations for the PostgreSQL table:
- View table definition
- Query table data
- Insert data
- Update data
- Delete data
- Truncate table
- Drop table`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Table definition\n${tableDefinition}`,
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
                            `-- Insert data
INSERT INTO ${item.schema}.${item.label} (
    -- List columns here
)
VALUES (
    -- List values here
);`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Update data
UPDATE ${item.schema}.${item.label}
SET column_name = new_value
WHERE condition;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Delete data
DELETE FROM ${item.schema}.${item.label}
WHERE condition;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Truncate table (remove all data)
TRUNCATE TABLE ${item.schema}.${item.label};`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Drop table
DROP TABLE ${item.schema}.${item.label};`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create table operations notebook: ${errorMessage}`);
                    
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

        vscode.commands.registerCommand('postgres-explorer.viewOperations', async (item: DatabaseTreeItem) => {
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

                    const viewDefinition = `CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS\n${viewResult.rows[0].definition}`;
                    
                    // Create notebook for view operations
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
                            `# View Operations: ${item.schema}.${item.label}\n\nThis notebook contains common operations for the PostgreSQL view:
- View definition
- Query view data
- Modify view definition
- Drop view`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- View definition\n${viewDefinition}`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Query view data
SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Modify view definition
CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS
SELECT * FROM source_table
WHERE condition;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Drop view
DROP VIEW ${item.schema}.${item.label};`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create view operations notebook: ${errorMessage}`);
                    
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

        vscode.commands.registerCommand('postgres-explorer.truncateTable', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid table selection');
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
                        `# Truncate Table: ${item.schema}.${item.label}\n\n⚠️ **Warning:** This action will remove all data from the table. This operation cannot be undone.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Truncate table
TRUNCATE TABLE ${item.schema}.${item.label};`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create truncate notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.insertData', async (item: DatabaseTreeItem) => {
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
                    
                    // Get column information for the table
                    const columnQuery = `
                        SELECT column_name, data_type, is_nullable, column_default
                        FROM information_schema.columns 
                        WHERE table_schema = $1 
                        AND table_name = $2 
                        ORDER BY ordinal_position`;
                    
                    const result = await client.query(columnQuery, [item.schema, item.label]);
                    
                    // Generate INSERT statement with column names and placeholder values
                    const columns = result.rows.map(col => col.column_name);
                    const placeholders = result.rows.map(col => {
                        if (col.column_default) {
                            return `DEFAULT`;
                        }
                        switch (col.data_type.toLowerCase()) {
                            case 'text':
                            case 'character varying':
                            case 'varchar':
                            case 'char':
                            case 'uuid':
                            case 'date':
                            case 'timestamp':
                            case 'timestamptz':
                                return `'value'`;
                            case 'integer':
                            case 'bigint':
                            case 'smallint':
                            case 'decimal':
                            case 'numeric':
                            case 'real':
                            case 'double precision':
                                return '0';
                            case 'boolean':
                                return 'false';
                            case 'json':
                            case 'jsonb':
                                return `'{}'`;
                            default:
                                return 'NULL';
                        }
                    });

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
                            `# Insert Data: ${item.schema}.${item.label}\n\nReplace the placeholder values in the INSERT statement below with your actual data.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Insert single row
INSERT INTO ${item.schema}.${item.label} (
    ${columns.map(col => `${col}`).join(',\n    ')}
)
VALUES (
    ${placeholders.join(',\n    ')}
)
RETURNING *;

-- Insert multiple rows (example)
INSERT INTO ${item.schema}.${item.label} (
    ${columns.map(col => `${col}`).join(',\n    ')}
)
VALUES
    (${placeholders.join(', ')}),
    (${placeholders.join(', ')})
RETURNING *;`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create insert notebook: ${errorMessage}`);
                    
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

        vscode.commands.registerCommand('postgres-explorer.updateData', async (item: DatabaseTreeItem) => {
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
                    
                    // Get column information including primary key
                    const columnQuery = `
                        SELECT 
                            c.column_name, 
                            c.data_type,
                            CASE 
                                WHEN tc.constraint_type = 'PRIMARY KEY' THEN true
                                ELSE false
                            END as is_primary_key
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
                        ORDER BY c.ordinal_position`;
                    
                    const result = await client.query(columnQuery, [item.schema, item.label]);
                    
                    // Find primary key columns for WHERE clause
                    const pkColumns = result.rows.filter(col => col.is_primary_key).map(col => col.column_name);
                    const whereClause = pkColumns.length > 0 ?
                        `WHERE ${pkColumns.map(col => `${col} = value`).join(' AND ')}` :
                        '-- Add your WHERE clause here to identify rows to update';

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
                            `# Update Data: ${item.schema}.${item.label}\n\nModify the UPDATE statement below to set new values and specify which rows to update using the WHERE clause.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Update data
UPDATE ${item.schema}.${item.label}
SET
    -- List columns to update:
    column_name = new_value
${whereClause}
RETURNING *;

-- Example of updating multiple columns
UPDATE ${item.schema}.${item.label}
SET
    ${result.rows.map(col => `${col.column_name} = CASE 
        WHEN ${col.data_type.toLowerCase().includes('char') || col.data_type.toLowerCase() === 'text' ? 
            `condition THEN 'new_value'` : 
            `condition THEN 0`}
        ELSE ${col.column_name}
    END`).join(',\n    ')}
${whereClause}
RETURNING *;`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create update notebook: ${errorMessage}`);
                    
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

    // Materialized View operations
    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.refreshMaterializedView', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid materialized view selection');
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
                        `# Refresh Materialized View: ${item.schema}.${item.label}\n\nExecute the cell below to refresh the materialized view data.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `REFRESH MATERIALIZED VIEW ${item.schema}.${item.label};`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create refresh materialized view notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.editMatView', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid materialized view selection');
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
                    
                    const matviewQuery = `SELECT pg_get_viewdef($1::regclass, true) as definition`;
                    const matviewResult = await client.query(matviewQuery, [`${item.schema}.${item.label}`]);
                    if (!matviewResult.rows[0]?.definition) {
                        throw new Error('Materialized view definition not found');
                    }

                    const createMatViewStatement = `CREATE MATERIALIZED VIEW ${item.schema}.${item.label} AS\n${matviewResult.rows[0].definition}`;
                    
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
                            `# Edit Materialized View: ${item.schema}.${item.label}\n\nModify the materialized view definition below and execute the cell to update it. Note that this will drop and recreate the materialized view.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};\n\n${createMatViewStatement}\nWITH DATA;`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create materialized view edit notebook: ${errorMessage}`);
                    
                    if (client) {
                        await client.end();
                    }
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.viewMaterializedViewData', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid materialized view selection');
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
                        `# View Data: ${item.schema}.${item.label}\n\nModify the query below to filter or transform the data as needed.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create view data notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.showMaterializedViewProperties', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid materialized view selection');
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
                    
                    const query = `
                        SELECT 
                            m.matviewname,
                            m.matviewowner,
                            m.tablespace,
                            m.hasindexes,
                            m.ispopulated,
                            pg_size_pretty(pg_total_relation_size(format('%I.%I', m.schemaname, m.matviewname))) as size,
                            pg_get_viewdef(format('%I.%I', m.schemaname, m.matviewname)::regclass, true) as definition
                        FROM pg_matviews m
                        WHERE m.schemaname = $1 AND m.matviewname = $2`;

                    const result = await client.query(query, [item.schema, item.label]);
                    if (result.rows.length === 0) {
                        throw new Error('Materialized view not found');
                    }

                    const matview = result.rows[0];
                    
                    const notebookData = new vscode.NotebookData([
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Markup,
                            `# Materialized View Properties: ${item.schema}.${item.label}

**Basic Information:**
- Owner: ${matview.matviewowner}
- Size: ${matview.size}
- Has Indexes: ${matview.hasindexes ? 'Yes' : 'No'}
- Is Populated: ${matview.ispopulated ? 'Yes' : 'No'}
${matview.tablespace ? `- Tablespace: ${matview.tablespace}` : ''}

**Definition:**`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            matview.definition,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = {
                        connectionId: item.connectionId,
                        databaseName: item.databaseName,
                        host: connection.host,
                        port: connection.port,
                        username: connection.username,
                        password: connection.password
                    };

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to show materialized view properties: ${errorMessage}`);
                    
                    if (client) {
                        await client.end();
                    }
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.dropMatView', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid materialized view selection');
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
                        `# Drop Materialized View: ${item.schema}.${item.label}\n\n⚠️ **Warning:** This action will permanently delete the materialized view. This operation cannot be undone.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Drop materialized view
DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create drop materialized view notebook: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('postgres-explorer.materializedViewOperations', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid materialized view selection');
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
                    
                    // Get materialized view definition
                    const matviewQuery = `
                        SELECT pg_get_viewdef($1::regclass, true) as definition,
                               schemaname,
                               matviewname,
                               matviewowner,
                               tablespace,
                               hasindexes,
                               ispopulated
                        FROM pg_matviews
                        WHERE schemaname = $2 AND matviewname = $3`;

                    const result = await client.query(matviewQuery, [`${item.schema}.${item.label}`, item.schema, item.label]);
                    if (result.rows.length === 0) {
                        throw new Error('Materialized view not found');
                    }

                    const matview = result.rows[0];
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
                            `# Materialized View Operations: ${item.schema}.${item.label}

**Properties:**
- Owner: ${matview.matviewowner}
- Has Indexes: ${matview.hasindexes ? 'Yes' : 'No'}
- Is Populated: ${matview.ispopulated ? 'Yes' : 'No'}
${matview.tablespace ? `- Tablespace: ${matview.tablespace}` : ''}

Below are common operations for this materialized view:
- View/edit definition
- Query data
- Refresh data
- Drop materialized view`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Current materialized view definition
CREATE MATERIALIZED VIEW ${item.schema}.${item.label} AS
${matview.definition};`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Query materialized view data
SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Refresh materialized view data
REFRESH MATERIALIZED VIEW ${item.schema}.${item.label};`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Drop materialized view
DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create materialized view operations notebook: ${errorMessage}`);
                    
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

    // Type operations
    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.typeOperations', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid type selection');
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
                    
                    // Get type definition
                    const typeQuery = `
                        SELECT 
                            t.typname,
                            a.attname,
                            pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type
                        FROM pg_type t
                        JOIN pg_class c ON c.oid = t.typrelid
                        JOIN pg_attribute a ON a.attrelid = c.oid
                        JOIN pg_namespace n ON n.oid = t.typnamespace
                        WHERE t.typname = $1
                        AND n.nspname = $2
                        AND a.attnum > 0
                        ORDER BY a.attnum`;

                    const typeResult = await client.query(typeQuery, [item.label, item.schema]);
                    
                    // Create notebook with type operations
                    const metadata = {
                        connectionId: item.connectionId,
                        databaseName: item.databaseName,
                        host: connection.host,
                        port: connection.port,
                        username: connection.username,
                        password: connection.password
                    };

                    const typeDefinition = `CREATE TYPE ${item.schema}.${item.label} AS (\n    ${
                        typeResult.rows.map(row => `${row.attname} ${row.data_type}`).join(',\n    ')
                    }\n);`;

                    const notebookData = new vscode.NotebookData([
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Markup,
                            `# Type Operations: ${item.schema}.${item.label}\n\nThis notebook contains operations for managing the PostgreSQL type:
- View type definition
- Edit type
- Drop type`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Current type definition\n${typeDefinition}`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Edit type (requires dropping and recreating)
DROP TYPE IF EXISTS ${item.schema}.${item.label} CASCADE;

CREATE TYPE ${item.schema}.${item.label} AS (
    -- Define fields here
    field1 data_type,
    field2 data_type
);`,
                            'sql'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Drop type
DROP TYPE IF EXISTS ${item.schema}.${item.label} CASCADE;`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create type operations notebook: ${errorMessage}`);
                    
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

        vscode.commands.registerCommand('postgres-explorer.editType', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid type selection');
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
                    
                    const typeQuery = `
                        SELECT 
                            t.typname,
                            t.typowner::regrole as owner,
                            a.attname,
                            pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type
                        FROM pg_type t
                        JOIN pg_class c ON c.oid = t.typrelid
                        JOIN pg_attribute a ON a.attrelid = c.oid
                        JOIN pg_namespace n ON n.oid = t.typnamespace
                        WHERE t.typname = $1
                        AND n.nspname = $2
                        AND a.attnum > 0
                        ORDER BY a.attnum`;

                    const typeResult = await client.query(typeQuery, [item.label, item.schema]);
                    if (typeResult.rows.length === 0) {
                        throw new Error('Type not found');
                    }

                    const fields = typeResult.rows.map(row => `    ${row.attname} ${row.data_type}`).join(',\n');
                    
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
                            `# Edit Type: ${item.schema}.${item.label}\n\nModify the type definition below and execute the cells to update it.`,
                            'markdown'
                        ),
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            `-- Drop existing type
DROP TYPE IF EXISTS ${item.schema}.${item.label} CASCADE;

-- Create type with new definition
CREATE TYPE ${item.schema}.${item.label} AS (
${fields}
);`,
                            'sql'
                        )
                    ]);
                    notebookData.metadata = metadata;

                    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                    await vscode.window.showNotebookDocument(notebook);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to create type edit notebook: ${errorMessage}`);
                    
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

        vscode.commands.registerCommand('postgres-explorer.showTypeProperties', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid type selection');
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
                    
                    const typeQuery = `
                        SELECT 
                            t.typname,
                            r.rolname as owner,
                            obj_description(t.oid, 'pg_type') as description,
                            CASE t.typtype
                                WHEN 'c' THEN 'composite'
                                WHEN 'e' THEN 'enum'
                                WHEN 'r' THEN 'range'
                                ELSE t.typtype::text
                            END as type_type,
                            a.attname,
                            pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
                            a.attnum as ordinal_position
                        FROM pg_type t
                        JOIN pg_roles r ON t.typowner = r.oid
                        JOIN pg_class c ON c.oid = t.typrelid
                        JOIN pg_attribute a ON a.attrelid = c.oid
                        JOIN pg_namespace n ON n.oid = t.typnamespace
                        WHERE t.typname = $1
                        AND n.nspname = $2
                        AND a.attnum > 0
                        ORDER BY a.attnum`;

                    const typeResult = await client.query(typeQuery, [item.label, item.schema]);
                    if (typeResult.rows.length === 0) {
                        throw new Error('Type not found');
                    }

                    const panel = vscode.window.createWebviewPanel(
                        'typeProperties',
                        `${item.schema}.${item.label} Properties`,
                        vscode.ViewColumn.One,
                        { enableScripts: true }
                    );

                    const typeInfo = typeResult.rows[0];
                    const fields = typeResult.rows.map(row => ({
                        name: row.attname,
                        type: row.data_type,
                        position: row.ordinal_position
                    }));

                    panel.webview.html = `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <style>
                                body { 
                                    padding: 16px; 
                                    font-family: var(--vscode-editor-font-family);
                                    color: var(--vscode-editor-foreground);
                                }
                                .container { display: grid; gap: 16px; }
                                
                                .header {
                                    display: flex;
                                    align-items: center;
                                    justify-content: space-between;
                                    margin-bottom: 20px;
                                    padding-bottom: 8px;
                                    border-bottom: 1px solid var(--vscode-panel-border);
                                }
                                
                                .info-section {
                                    background: var(--vscode-editor-background);
                                    border-radius: 6px;
                                    box-shadow: 0 2px 8px var(--vscode-widget-shadow);
                                    padding: 16px;
                                    margin-bottom: 16px;
                                }
                                
                                .info-row {
                                    display: grid;
                                    grid-template-columns: 120px 1fr;
                                    gap: 16px;
                                    padding: 8px 0;
                                    border-bottom: 1px solid var(--vscode-panel-border);
                                }
                                
                                .info-row:last-child {
                                    border-bottom: none;
                                }
                                
                                .label {
                                    color: var(--vscode-foreground);
                                    opacity: 0.8;
                                }
                                
                                .value {
                                    color: var(--vscode-editor-foreground);
                                }
                                
                                table { 
                                    border-collapse: separate;
                                    border-spacing: 0;
                                    width: 100%;
                                }
                                
                                th, td { 
                                    border: none;
                                    padding: 12px 16px;
                                    text-align: left;
                                }
                                
                                th {
                                    background-color: var(--vscode-editor-background);
                                    color: var(--vscode-symbolIcon-classForeground);
                                    font-weight: 600;
                                    font-size: 0.9em;
                                    text-transform: uppercase;
                                    letter-spacing: 0.05em;
                                    border-bottom: 2px solid var(--vscode-panel-border);
                                }
                                
                                tr:not(:last-child) td {
                                    border-bottom: 1px solid var(--vscode-panel-border);
                                }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="header">
                                    <h2>${item.schema}.${item.label}</h2>
                                </div>

                                <div class="info-section">
                                    <div class="info-row">
                                        <span class="label">Owner</span>
                                        <span class="value">${typeInfo.owner}</span>
                                    </div>
                                    <div class="info-row">
                                        <span class="label">Type</span>
                                        <span class="value">${typeInfo.type_type}</span>
                                    </div>
                                    ${typeInfo.description ? `
                                    <div class="info-row">
                                        <span class="label">Description</span>
                                        <span class="value">${typeInfo.description}</span>
                                    </div>` : ''}
                                </div>

                                <div class="info-section">
                                    <h3>Fields</h3>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>Type</th>
                                                <th>Position</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${fields.map(field => `
                                                <tr>
                                                    <td>${field.name}</td>
                                                    <td>${field.type}</td>
                                                    <td>${field.position}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </body>
                        </html>`;
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to show type properties: ${errorMessage}`);
                    
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

        vscode.commands.registerCommand('postgres-explorer.dropType', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid type selection');
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
                        `# Drop Type: ${item.schema}.${item.label}\n\nExecute the cell below to drop the type. Be careful, this operation cannot be undone.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `DROP TYPE ${item.schema}.${item.label} CASCADE;`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create drop type notebook: ${err.message}`);
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

    // Register materialized view commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.showMatViewProperties', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid materialized view selection');
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
                    await TablePropertiesPanel.show(client, item.schema!, item.label, true);
                } catch (err: any) {
                    const errorMessage = err?.message || 'Unknown error occurred';
                    vscode.window.showErrorMessage(`Failed to show materialized view properties: ${errorMessage}`);
                    if (client) {
                        await client.end();
                    }
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to retrieve connection: ${err.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgres-explorer.dropMatView', async (item: DatabaseTreeItem) => {
            if (!item || !item.schema || !item.connectionId) {
                vscode.window.showErrorMessage('Invalid materialized view selection');
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
                        `# Drop Materialized View: ${item.schema}.${item.label}\n\n⚠️ **Warning:** This action will permanently delete the materialized view. This operation cannot be undone.`,
                        'markdown'
                    ),
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        `-- Drop materialized view\nDROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};`,
                        'sql'
                    )
                ]);
                notebookData.metadata = metadata;

                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
                await vscode.window.showNotebookDocument(notebook);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to create drop materialized view notebook: ${err.message}`);
            }
        })
    );

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
