import { Client } from 'pg';
import * as vscode from 'vscode';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from '../commands/connection';
import { ConnectionManager } from '../services/ConnectionManager';
import { TablePropertiesPanel } from '../tableProperties';

/**
 * Queries for PostgreSQL database
 */

/**
 * FUNCTION_INFO_QUERY - Query to get function details
 * fetches - function name, arguments, result type, definition, and description
 * from pg_proc and pg_description tables
 * where function name and namespace are provided as parameters
 */
const FUNCTION_INFO_QUERY = `
SELECT p.proname,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result_type,
    pg_get_functiondef(p.oid) as definition,
    d.description
FROM pg_proc p
LEFT JOIN pg_description d ON p.oid = d.objoid
WHERE p.proname = $1
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`;

/**
 * FUNCTION_DEF_QUERY - Query to get function definition
 * fetches - function definition from pg_proc table
 * where function name and namespace are provided as parameters
 */
const FUNCTION_DEF_QUERY = `
SELECT pg_get_functiondef(p.oid) as definition
FROM pg_proc p
WHERE p.proname = $1
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`;

/**
 * FUNCTION_SIGN_QUERY - Query to get function signature to perform function call
 * fetches - function name, arguments, result type, and description
 * from pg_proc and pg_description tables
 * where function name and namespace are provided as parameters
 * This query is used to get the function signature for function call
*/
const FUNCTION_SIGN_QUERY = `
SELECT p.proname,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result_type,
    d.description
FROM pg_proc p
LEFT JOIN pg_description d ON p.oid = d.objoid
WHERE p.proname = $1
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`;

/**
 * FUNCTION_ARGS_QUERY - Query to get function arguments
 * fetches - function arguments from pg_proc table
 * where function name and namespace are provided as parameters
 * This query is used to get the function arguments for drop function
 * It is used to get the function arguments for drop function
 */
const FUNCTION_ARGS_QUERY = `
SELECT pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
WHERE p.proname = $1
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`;

/**
 * This function creates a notebook with common operations for a PostgreSQL function.
 * It retrieves the function's definition, arguments, and description from the database,
 * and generates a notebook with cells for viewing the function definition, calling the function,
 * and dropping the function.
 *
 * @param {DatabaseTreeItem} item - The selected function item from the tree view.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdFunctionOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const client = await ConnectionManager.getInstance().getConnection({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            database: item.databaseName,
            name: connection.name
        });

        try {
            const functionResult = await client.query(FUNCTION_INFO_QUERY, [item.label, item.schema]);
            if (functionResult.rows.length === 0) {
                throw new Error('Function not found');
            }

            const functionInfo = functionResult.rows[0];
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Function Operations: \`${item.schema}.${item.label}\`

${functionInfo.description ? `<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;"><strong>ℹ️ Description:</strong> ${functionInfo.description}</div>` : ''}

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> This notebook contains common operations for the PostgreSQL function. Run the cells below to execute the operations.
</div>

#### 🎯 Available Operations

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Operation</th><th style="text-align: left;">Description</th></tr>
    <tr><td><strong>View Definition</strong></td><td>Show the current function code</td></tr>
    <tr><td><strong>Call Function</strong></td><td>Template for executing the function</td></tr>
    <tr><td><strong>Drop</strong></td><td>Delete the function (Warning: Irreversible)</td></tr>
</table>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 Function Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Current function definition\n${functionInfo.definition} `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📞 Call Function`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Call function\nSELECT ${item.schema}.${item.label} (${functionInfo.arguments ?
                        '\n  -- Replace with actual values:\n  ' + functionInfo.arguments.split(',').join(',\n  ')
                        : ''
                    }); `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop Function`,
                    'markdown'
                ),
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create function operations notebook: ${err.message} `);
    }
}

/**
 * This function creates a notebook for replacing a PostgreSQL function.
 * It retrieves the function's definition from the database and generates a notebook
 * with a cell for editing the function definition.
 *
 * @param {DatabaseTreeItem} item - The selected function item from the tree view.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdEditFunction(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const client = await ConnectionManager.getInstance().getConnection({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            database: item.databaseName,
            name: connection.name
        });

        try {
            const functionResult = await client.query(FUNCTION_DEF_QUERY, [item.label, item.schema]);
            if (functionResult.rows.length === 0) {
                throw new Error('Function not found');
            }

            const functionInfo = functionResult.rows[0];
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Edit Function: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the function definition below and execute the cell to update the function.
</div>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 Function Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    functionInfo.definition,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create function edit notebook: ${err.message} `);
    }
}

/**
 * This function creates a notebook for calling a PostgreSQL function.
 * It retrieves the function's arguments and result type from the database
 * and generates a notebook with a cell for calling the function.
 *
 * @param {DatabaseTreeItem} item - The selected function item from the tree view.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdCallFunction(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const client = await ConnectionManager.getInstance().getConnection({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            database: item.databaseName,
            name: connection.name
        });

        try {
            const functionResult = await client.query(FUNCTION_SIGN_QUERY, [item.label, item.schema]);
            if (functionResult.rows.length === 0) {
                throw new Error('Function not found');
            }

            const functionInfo = functionResult.rows[0];
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Call Function: \`${item.schema}.${item.label}\`

${functionInfo.description ? `<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;"><strong>ℹ️ Description:</strong> ${functionInfo.description}</div>` : ''}

<table style="font-size: 11px; width: 100%; border-collapse: collapse; margin-bottom: 15px;">
    <tr><td style="font-weight: bold; width: 100px;">Arguments:</td><td><code>${functionInfo.arguments || 'None'}</code></td></tr>
    <tr><td style="font-weight: bold;">Returns:</td><td><code>${functionInfo.result_type}</code></td></tr>
</table>

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Edit the argument values below and execute the cell to call the function.
</div>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📞 Execution`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Call function\nSELECT ${item.schema}.${item.label} (${functionInfo.arguments ?
                        '\n  -- Replace with actual values:\n  ' + functionInfo.arguments.split(',').join(',\n  ')
                        : ''
                    }); `,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create function call notebook: ${err.message} `);
    }
}

/**
 * This function creates a notebook for dropping a PostgreSQL function.
 * It generates a notebook with a cell for dropping the function.
 *
 * @param {DatabaseTreeItem} item - The selected function item from the tree view.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdDropFunction(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const client = await ConnectionManager.getInstance().getConnection({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            database: item.databaseName,
            name: connection.name
        });

        try {
            const functionResult = await client.query(FUNCTION_ARGS_QUERY, [item.label, item.schema]);
            if (functionResult.rows.length === 0) {
                throw new Error('Function not found');
            }

            const functionInfo = functionResult.rows[0];
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Drop Function: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>🛑 Caution:</strong> This action will permanently delete the function. This operation cannot be undone.
</div>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop Command`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop function\nDROP FUNCTION IF EXISTS ${item.schema}.${item.label} (${functionInfo.arguments}); `,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create drop function notebook: ${err.message} `);
    }
}

/**
 * This function shows the properties of a PostgreSQL function in a panel.
 * It retrieves the function's details from the database and displays them in a table.
 * 
 * @param {DatabaseTreeItem} item - The selected function item from the tree view.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdShowFunctionProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const client = await ConnectionManager.getInstance().getConnection({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            database: item.databaseName,
            name: connection.name
        });

        try {
            await TablePropertiesPanel.show(client, item.schema, item.label, false, true);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to show function properties: ${err.message} `);
    }
}

/**
 * cmdRefreshFunction - Refreshes the function item in the tree view.
 */
export async function cmdRefreshFunction(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    databaseTreeProvider?.refresh(item);
}

/**
 * cmdCreateFunction - Command to create a new function in the database.
 */
export async function cmdCreateFunction(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Create New Function in Schema: \`${item.schema}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the function definition below and execute the cell to create the function.
</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 Function Definition`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create new function
CREATE OR REPLACE FUNCTION ${item.schema}.function_name(param1 integer, param2 text)
RETURNS text AS $$
BEGIN
    -- Function logic here
    RETURN 'Result: ' || param2;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION ${item.schema}.function_name(integer, text) IS 'Function description';`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create function notebook: ${err.message}`);
    }
}