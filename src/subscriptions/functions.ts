import * as vscode from 'vscode';
import { closeClient, createAndShowNotebook, createMetadata, createPgClient, getConnectionWithPassword } from './connection';
import { DatabaseTreeItem } from '../databaseTreeProvider';
import { validateItem } from './connection';

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
export async function cmdAllFunctionOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const client = await createPgClient(connection, item.databaseName);

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
                    `# Function Operations: ${item.schema}.${item.label}\n\n` +
                    `${functionInfo.description ? '**Description:** ' + functionInfo.description + '\n\n' : ''}` +
                    `This notebook contains common operations for the PostgreSQL function:\n` +
                    `- View current function definition\n` +
                    `- Call function\n` +
                    `- Drop function`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Current function definition\n${functionInfo.definition}`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Call function\nSELECT ${item.schema}.${item.label}(${functionInfo.arguments ?
                        '\n  -- Replace with actual values:\n  ' + functionInfo.arguments.split(',').join(',\n  ')
                        : ''});`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop function\nDROP FUNCTION IF EXISTS ${item.schema}.${item.label}(${functionInfo.arguments});`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            await closeClient(client);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create function operations notebook: ${err.message}`);
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
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const client = await createPgClient(connection, item.databaseName);

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
                    `# Edit Function: ${item.schema}.${item.label}\n\nModify the function definition below and execute the cell to update the function.`,
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
            await closeClient(client);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create function edit notebook: ${err.message}`);
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
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const client = await createPgClient(connection, item.databaseName);

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
                    `# Call Function: ${item.schema}.${item.label}\n\n${functionInfo.description ? '**Description:** ' + functionInfo.description + '\n\n' : ''}` +
                    `**Arguments:** ${functionInfo.arguments || 'None'}\n` +
                    `**Returns:** ${functionInfo.result_type}\n\n` +
                    `Edit the argument values below and execute the cell to call the function.`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Call function\nSELECT ${item.schema}.${item.label}(${functionInfo.arguments ?
                        '\n  -- Replace with actual values:\n  ' + functionInfo.arguments.split(',').join(',\n  ')
                        : ''});`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            await closeClient(client);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create function call notebook: ${err.message}`);
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
        const connection = await getConnectionWithPassword(item.connectionId, context);
        const client = await createPgClient(connection, item.databaseName);

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
                    `# Drop Function: ${item.schema}.${item.label}\n\nExecute the cell below to permanently remove this function. This action cannot be undone.`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop function\nDROP FUNCTION IF EXISTS ${item.schema}.${item.label}(${functionInfo.arguments});`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            await closeClient(client);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create drop function notebook: ${err.message}`);
    }
}
