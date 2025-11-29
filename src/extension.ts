import * as vscode from 'vscode';
import { ConnectionFormPanel } from './connectionForm';
import { DatabaseTreeItem, DatabaseTreeProvider } from './providers/DatabaseTreeProvider';
import { PostgresKernel } from './providers/NotebookKernel';
import { PostgresNotebookProvider } from './notebookProvider';
import { PostgresNotebookSerializer } from './postgresNotebook';
import { cmdRefreshDatabase, cmdCreateDatabase, cmdDeleteDatabase, cmdAddObjectInDatabase, cmdDatabaseOperations, cmdDatabaseDashboard, cmdBackupDatabase, cmdRestoreDatabase, cmdGenerateCreateScript, cmdDisconnectDatabase, cmdMaintenanceDatabase, cmdQueryTool, cmdPsqlTool, cmdShowConfiguration } from './commands/database';
import { cmdRefreshSchema, cmdCreateSchema, cmdCreateObjectInSchema, cmdSchemaOperations, cmdShowSchemaProperties } from './commands/schema';
import { cmdRefreshTable, cmdTableOperations, cmdEditTable, cmdInsertTable, cmdUpdateTable, cmdShowTableProperties, cmdViewTableData, cmdDropTable, cmdTruncateTable, cmdScriptSelect, cmdScriptInsert, cmdScriptUpdate, cmdScriptDelete, cmdScriptCreate, cmdMaintenanceVacuum, cmdMaintenanceAnalyze, cmdMaintenanceReindex } from './commands/tables';
import { cmdRefreshView, cmdViewOperations, cmdShowViewProperties, cmdEditView, cmdViewData, cmdDropView } from './commands/views';
import { cmdRefreshFunction, cmdFunctionOperations, cmdShowFunctionProperties, cmdEditFunction, cmdCallFunction, cmdDropFunction } from './commands/functions';
import { cmdRefreshMatView, cmdMatViewOperations, cmdEditMatView, cmdViewMatViewData, cmdViewMatViewProperties, cmdDropMatView } from './commands/materializedViews';
import { cmdRefreshForeignTable, cmdForeignTableOperations, cmdEditForeignTable } from './commands/foreignTables';
import { cmdRefreshExtension, cmdExtensionOperations, cmdEnableExtension, cmdDropExtension } from './commands/extensions';
import { cmdRefreshType, cmdAllOperationsTypes, cmdEditTypes, cmdShowTypeProperties, cmdDropType } from './commands/types';
import { cmdRefreshRole, cmdRoleOperations, cmdAddRole, cmdShowRoleProperties, cmdAddUser, cmdEditRole, cmdGrantRevokeRole, cmdDropRole } from './commands/usersRoles';
import { cmdNewNotebook } from './commands/notebook';
import { cmdDisconnectConnection, cmdConnectDatabase } from './commands/connection';
import { SecretStorageService } from './services/SecretStorageService';
import { ConnectionManager } from './services/ConnectionManager';

export async function activate(context: vscode.ExtensionContext) {
    console.log('postgres-explorer: Activating extension');

    // Initialize services
    SecretStorageService.getInstance(context);
    ConnectionManager.getInstance();

    // Immediately migrate any existing passwords to SecretStorage
    await migrateExistingPasswords(context);

    // Create database tree provider instance
    const databaseTreeProvider = new DatabaseTreeProvider(context);

    // Register tree data provider and create tree view
    const treeView = vscode.window.createTreeView('postgresExplorer', {
        treeDataProvider: databaseTreeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // Create kernel with message handler
    // Create kernel for postgres-notebook
    const kernel = new PostgresKernel(context, 'postgres-notebook', async (message: { type: string; command: string; format?: string; content?: string; filename?: string }) => {
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

    // Create kernel for postgres-query (SQL files)
    const queryKernel = new PostgresKernel(context, 'postgres-query');
    // context.subscriptions.push(kernel); // Kernel is not a disposable in the new implementation, but controller is managed internally

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
            callback: async (item: any) => await cmdConnectDatabase(item, context, databaseTreeProvider)
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
        {
            command: 'postgres-explorer.backupDatabase',
            callback: async (item: DatabaseTreeItem) => await cmdBackupDatabase(item, context)
        },
        {
            command: 'postgres-explorer.restoreDatabase',
            callback: async (item: DatabaseTreeItem) => await cmdRestoreDatabase(item, context)
        },
        {
            command: 'postgres-explorer.generateCreateScript',
            callback: async (item: DatabaseTreeItem) => await cmdGenerateCreateScript(item, context)
        },
        {
            command: 'postgres-explorer.disconnectDatabase',
            callback: async (item: DatabaseTreeItem) => await cmdDisconnectDatabase(item, context)
        },
        {
            command: 'postgres-explorer.maintenanceDatabase',
            callback: async (item: DatabaseTreeItem) => await cmdMaintenanceDatabase(item, context)
        },
        {
            command: 'postgres-explorer.queryTool',
            callback: async (item: DatabaseTreeItem) => await cmdQueryTool(item, context)
        },
        {
            command: 'postgres-explorer.psqlTool',
            callback: async (item: DatabaseTreeItem) => await cmdPsqlTool(item, context)
        },
        {
            command: 'postgres-explorer.showConfiguration',
            callback: async (item: DatabaseTreeItem) => await cmdShowConfiguration(item, context)
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
        {
            command: 'postgres-explorer.showSchemaProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowSchemaProperties(item, context)
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
        // Add script commands
        {
            command: 'postgres-explorer.scriptSelect',
            callback: async (item: DatabaseTreeItem) => await cmdScriptSelect(item, context)
        },
        {
            command: 'postgres-explorer.scriptInsert',
            callback: async (item: DatabaseTreeItem) => await cmdScriptInsert(item, context)
        },
        {
            command: 'postgres-explorer.scriptUpdate',
            callback: async (item: DatabaseTreeItem) => await cmdScriptUpdate(item, context)
        },
        {
            command: 'postgres-explorer.scriptDelete',
            callback: async (item: DatabaseTreeItem) => await cmdScriptDelete(item, context)
        },
        {
            command: 'postgres-explorer.scriptCreate',
            callback: async (item: DatabaseTreeItem) => await cmdScriptCreate(item, context)
        },
        // Add maintenance commands
        {
            command: 'postgres-explorer.maintenanceVacuum',
            callback: async (item: DatabaseTreeItem) => await cmdMaintenanceVacuum(item, context)
        },
        {
            command: 'postgres-explorer.maintenanceAnalyze',
            callback: async (item: DatabaseTreeItem) => await cmdMaintenanceAnalyze(item, context)
        },
        {
            command: 'postgres-explorer.maintenanceReindex',
            callback: async (item: DatabaseTreeItem) => await cmdMaintenanceReindex(item, context)
        },

        // Add view commands
        {
            command: 'postgres-explorer.refreshView',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshView(item, context, databaseTreeProvider)
        },
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
            command: 'postgres-explorer.refreshFunction',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshFunction(item, context, databaseTreeProvider)
        },
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
            command: 'postgres-explorer.refreshType',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshType(item, context, databaseTreeProvider)
        },
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
            command: 'postgres-explorer.refreshForeignTable',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshForeignTable(item, context, databaseTreeProvider)
        },
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
            command: 'postgres-explorer.refreshRole',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshRole(item, context, databaseTreeProvider)
        },
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
            command: 'postgres-explorer.refreshExtension',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshExtension(item, context, databaseTreeProvider)
        },
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
        },
        // Add connection commands
        {
            command: 'postgres-explorer.disconnectConnection',
            callback: async (item: DatabaseTreeItem) => await cmdDisconnectConnection(item, context, databaseTreeProvider)
        },
        {
            command: 'postgres-explorer.deleteConnection',
            callback: async (item: DatabaseTreeItem) => await cmdDisconnectDatabase(item, context)
        },

    ];

    // Register all commands
    commands.forEach(({ command, callback }) => {
        context.subscriptions.push(
            vscode.commands.registerCommand(command, callback)
        );
    });
}

export async function deactivate() {
    await ConnectionManager.getInstance().closeAll();
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
                await SecretStorageService.getInstance().setPassword(conn.id, conn.password);
            }
        }

        return true;
    } catch (error) {
        console.error('Failed to migrate passwords:', error);
        return false;
    }
}
