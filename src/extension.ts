import { Client } from 'pg';
import * as vscode from 'vscode';
import { ConnectionFormPanel } from './connectionForm';
import { DatabaseTreeItem, DatabaseTreeProvider } from './databaseTreeProvider';
import { PostgresKernel } from './notebookKernel';
import { PostgresNotebookProvider } from './notebookProvider';
import { PostgresNotebookSerializer } from './postgresNotebook';
import { cmdAddObjectInDatabase, cmdDatabaseDashboard, cmdDatabaseOperations } from './subscriptions/database';
import { cmdExtensionOperations, cmdDropExtension, cmdEnableExtension } from './subscriptions/extensions';
import { cmdForeignTableOperations, cmdEditForeignTable } from './subscriptions/foreignTables';
import { cmdFunctionOperations, cmdCallFunction, cmdDropFunction, cmdEditFunction, cmdShowFunctionProperties } from './subscriptions/functions';
import { cmdMatViewOperations, cmdDropMatView, cmdEditMatView, cmdRefreshMatView, cmdViewMatViewData, cmdViewMatViewProperties } from './subscriptions/materializedViews';
import { cmdNewNotebook } from './subscriptions/notebook';
import { cmdSchemaOperations, cmdCreateObjectInSchema, cmdCreateSchema } from './subscriptions/schema';
import { cmdTableOperations, cmdDropTable, cmdEditTable, cmdInsertTable, cmdShowTableProperties, cmdTruncateTable, cmdUpdateTable, cmdViewTableData } from './subscriptions/tables';
import { cmdAllOperationsTypes, cmdDropType, cmdEditTypes, cmdShowTypeProperties } from './subscriptions/types';
import { cmdAddRole, cmdAddUser, cmdRoleOperations, cmdDropRole, cmdEditRole, cmdGrantRevokeRole, cmdShowRoleProperties } from './subscriptions/usersRoles';
import { cmdViewOperations, cmdDropView, cmdEditView, cmdShowViewProperties, cmdViewData } from './subscriptions/views';

export async function activate(context: vscode.ExtensionContext) {
    console.log('postgres-explorer: Activating extension');

    // Immediately migrate any existing passwords to SecretStorage
    await migrateExistingPasswords(context);

    // Create database tree provider instance
    const databaseTreeProvider = new DatabaseTreeProvider(context);

    // Register tree data provider
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('postgresExplorer', databaseTreeProvider)
    );

    // Create kernel with message handler
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

    // Register notebook providers
    const notebookProvider = new PostgresNotebookProvider();
    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer('postgres-notebook', notebookProvider),
        vscode.workspace.registerNotebookSerializer('postgres-query', new PostgresNotebookSerializer())
    );

    // Register all commands
    const commands = [
        {
            command: 'postgres-explorer.addConnection',
            callback: () => {
                ConnectionFormPanel.show(context.extensionUri, context);
            }
        },
        {
            command: 'postgres-explorer.refreshConnections',
            callback: () => {
                databaseTreeProvider.refresh();
            }
        },
        {
            command: 'postgres-explorer.connect',
            callback: async () => {
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
            }
        },
        {
            command: 'postgres-explorer.disconnect',
            callback: async () => {
                databaseTreeProvider.refresh();
                vscode.window.showInformationMessage('Disconnected from PostgreSQL database');
            }
        },
        {
            command: 'postgres-explorer.queryTable',
            callback: async (item: any) => {
                if (!item || !item.schema) {
                    return;
                }

                const query = `SELECT * FROM ${item.schema}.${item.label} LIMIT 100;`;
                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', new vscode.NotebookData([
                    new vscode.NotebookCellData(vscode.NotebookCellKind.Code, query, 'sql')
                ]));
                await vscode.window.showNotebookDocument(notebook);
            }
        },
        {
            command: 'postgres-explorer.newNotebook',
            callback: async (item: any) => await cmdNewNotebook(item)
        },
        {
            command: 'postgres-explorer.refresh',
            callback: () => databaseTreeProvider.refresh()
        },
        // Add database commands
        {
            command: 'postgres-explorer.createInDatabase',
            callback: async (item: DatabaseTreeItem) => await cmdAddObjectInDatabase(item, context)
        },
        {
            command: 'postgres-explorer.databaseOperations',
            callback: async (item: DatabaseTreeItem) => await cmdDatabaseOperations(item, context)
        },
        {
            command: 'postgres-explorer.showDashboard',
            callback: async (item: DatabaseTreeItem) => await cmdDatabaseDashboard(item, context)
        },
        // Add schema commands
        {
            command: 'postgres-explorer.createSchema',
            callback: async (item: DatabaseTreeItem) => await cmdCreateSchema(item, context)
        },
        {
            command: 'postgres-explorer.createInSchema',
            callback: async (item: DatabaseTreeItem) => await cmdCreateObjectInSchema(item, context)
        },
        {
            command: 'postgres-explorer.schemaOperations',
            callback: async (item: DatabaseTreeItem) => await cmdSchemaOperations(item, context)
        },
        // Add table commands
        {
            command: 'postgres-explorer.editTable',
            callback: async (item: DatabaseTreeItem) => await cmdEditTable(item, context)
        },
        {
            command: 'postgres-explorer.viewTableData',
            callback: async (item: DatabaseTreeItem) => await cmdViewTableData(item, context)
        },
        {
            command: 'postgres-explorer.dropTable',
            callback: async (item: DatabaseTreeItem) => await cmdDropTable(item, context)
        },
        {
            command: 'postgres-explorer.tableOperations',
            callback: async (item: DatabaseTreeItem) => await cmdTableOperations(item, context)
        },
        {
            command: 'postgres-explorer.truncateTable',
            callback: async (item: DatabaseTreeItem) => await cmdTruncateTable(item, context)
        },
        {
            command: 'postgres-explorer.insertData',
            callback: async (item: DatabaseTreeItem) => await cmdInsertTable(item, context)
        },
        {
            command: 'postgres-explorer.updateData',
            callback: async (item: DatabaseTreeItem) => await cmdUpdateTable(item, context)
        },
        {
            command: 'postgres-explorer.showTableProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowTableProperties(item, context)
        },
        // Add view commands
        {
            command: 'postgres-explorer.editViewDefinition',
            callback: async (item: DatabaseTreeItem) => await cmdEditView(item, context)
        },
        {
            command: 'postgres-explorer.viewViewData',
            callback: async (item: DatabaseTreeItem) => await cmdViewData(item, context)
        },
        {
            command: 'postgres-explorer.dropView',
            callback: async (item: DatabaseTreeItem) => await cmdDropView(item, context)
        },
        {
            command: 'postgres-explorer.viewOperations',
            callback: async (item: DatabaseTreeItem) => await cmdViewOperations(item, context)
        },
        {
            command: 'postgres-explorer.showViewProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowViewProperties(item, context)
        },
        // Add function commands
        {
            command: 'postgres-explorer.showFunctionProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowFunctionProperties(item, context)
        },
        {
            command: 'postgres-explorer.functionOperations',
            callback: async (item: DatabaseTreeItem) => await cmdFunctionOperations(item, context)
        },
        {
            command: 'postgres-explorer.createReplaceFunction',
            callback: async (item: DatabaseTreeItem) => await cmdEditFunction(item, context)
        },
        {
            command: 'postgres-explorer.callFunction',
            callback: async (item: DatabaseTreeItem) => await cmdCallFunction(item, context)
        },
        {
            command: 'postgres-explorer.dropFunction',
            callback: async (item: DatabaseTreeItem) => await cmdDropFunction(item, context)
        },
        // Add materialized view commands
        {
            command: 'postgres-explorer.refreshMaterializedView',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshMatView(item, context)
        },
        {
            command: 'postgres-explorer.editMatView',
            callback: async (item: DatabaseTreeItem) => await cmdEditMatView(item, context)
        },
        {
            command: 'postgres-explorer.viewMaterializedViewData',
            callback: async (item: DatabaseTreeItem) => await cmdViewMatViewData(item, context)
        },
        {
            command: 'postgres-explorer.showMaterializedViewProperties',
            callback: async (item: DatabaseTreeItem) => await cmdViewMatViewProperties(item, context)
        },
        {
            command: 'postgres-explorer.dropMatView',
            callback: async (item: DatabaseTreeItem) => await cmdDropMatView(item, context)
        },
        {
            command: 'postgres-explorer.materializedViewOperations',
            callback: async (item: DatabaseTreeItem) => await cmdMatViewOperations(item, context)
        },
        // Add type commands
        {
            command: 'postgres-explorer.typeOperations',
            callback: async (item: DatabaseTreeItem) => await cmdAllOperationsTypes(item, context)
        },
        {
            command: 'postgres-explorer.editType',
            callback: async (item: DatabaseTreeItem) => await cmdEditTypes(item, context)
        },
        {
            command: 'postgres-explorer.showTypeProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowTypeProperties(item, context)
        },
        {
            command: 'postgres-explorer.dropType',
            callback: async (item: DatabaseTreeItem) => await cmdDropType(item, context)
        },
        // Add foreign table commands
        {
            command: 'postgres-explorer.foreignTableOperations',
            callback: async (item: DatabaseTreeItem) => await cmdForeignTableOperations(item, context)
        },
        {
            command: 'postgres-explorer.editForeignTable',
            callback: async (item: DatabaseTreeItem) => await cmdEditForeignTable(item, context)
        },
        // Add role/user commands
        {
            command: 'postgres-explorer.createUser',
            callback: async (item: DatabaseTreeItem) => await cmdAddUser(item, context)
        },
        {
            command: 'postgres-explorer.createRole',
            callback: async (item: DatabaseTreeItem) => await cmdAddRole(item, context)
        },
        {
            command: 'postgres-explorer.editRole',
            callback: async (item: DatabaseTreeItem) => await cmdEditRole(item, context)
        },
        {
            command: 'postgres-explorer.grantRevoke',
            callback: async (item: DatabaseTreeItem) => await cmdGrantRevokeRole(item, context)
        },
        {
            command: 'postgres-explorer.dropRole',
            callback: async (item: DatabaseTreeItem) => await cmdDropRole(item, context)
        },
        {
            command: 'postgres-explorer.roleOperations',
            callback: async (item: DatabaseTreeItem) => await cmdRoleOperations(item, context)
        },
        {
            command: 'postgres-explorer.showRoleProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowRoleProperties(item, context)
        },
        // Add extension commands
        {
            command: 'postgres-explorer.enableExtension',
            callback: async (item: DatabaseTreeItem) => await cmdEnableExtension(item, context)
        },
        {
            command: 'postgres-explorer.extensionOperations',
            callback: async (item: DatabaseTreeItem) => await cmdExtensionOperations(item, context)
        },
        {
            command: 'postgres-explorer.dropExtension',
            callback: async (item: DatabaseTreeItem) => await cmdDropExtension(item, context)
        }
    ];

    // Register all commands
    commands.forEach(({ command, callback }) => {
        context.subscriptions.push(
            vscode.commands.registerCommand(command, callback)
        );
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
