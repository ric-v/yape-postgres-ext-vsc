import * as vscode from 'vscode';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from '../commands/connection';
import { ConnectionManager } from '../services/ConnectionManager';

/**
 * SQL Queries for type operations
 */

/**
 * TYPE_INFO_QUERY - Query to get detailed type information including fields and constraints
 */
const TYPE_INFO_QUERY = `
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

/**
 * TYPE_FIELDS_QUERY - Query to get type fields for editing
 */
const TYPE_FIELDS_QUERY = `
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

export async function cmdAllOperationsTypes(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const typeResult = await client.query(TYPE_FIELDS_QUERY, [item.label, item.schema]);
            if (typeResult.rows.length === 0) {
                throw new Error('Type not found');
            }

            const typeDefinition = `CREATE TYPE ${item.schema}.${item.label} AS (\n    ${typeResult.rows.map(row => `${row.attname} ${row.data_type}`).join(',\n    ')}\n);`;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Type Operations: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> This notebook contains operations for managing the PostgreSQL type. Run the cells below to execute the operations.
</div>

#### 🎯 Available Operations

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Operation</th><th style="text-align: left;">Description</th></tr>
    <tr><td><strong>View Definition</strong></td><td>Show the CREATE TYPE statement</td></tr>
    <tr><td><strong>Edit Type</strong></td><td>Template for modifying the type (requires recreation)</td></tr>
    <tr><td><strong>Drop Type</strong></td><td>Delete the type (Warning: Irreversible)</td></tr>
</table>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 Type Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Current type definition\n${typeDefinition}`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ✏️ Edit Type`,
                    'markdown'
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
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop Type`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop type
DROP TYPE IF EXISTS ${item.schema}.${item.label} CASCADE;`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create type operations notebook: ${err.message}`);
    }
}

export async function cmdEditTypes(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const typeResult = await client.query(TYPE_FIELDS_QUERY, [item.label, item.schema]);
            if (typeResult.rows.length === 0) {
                throw new Error('Type not found');
            }

            const fields = typeResult.rows.map(row => `    ${row.attname} ${row.data_type}`).join(',\n');
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Edit Type: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the type definition below and execute the cells to update it.
</div>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 Type Definition`,
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
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create type edit notebook: ${err.message}`);
    }
}

export async function cmdViewTypeProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const typeResult = await client.query(TYPE_INFO_QUERY, [item.label, item.schema]);
            if (typeResult.rows.length === 0) {
                throw new Error('Type not found');
            }

            const typeInfo = typeResult.rows[0];
            const fields = typeResult.rows.map(row => ({
                name: row.attname,
                type: row.data_type,
                position: row.ordinal_position
            }));

            const panel = vscode.window.createWebviewPanel(
                'typeProperties',
                `${item.schema}.${item.label} Properties`,
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

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
        .info-row:last-child { border-bottom: none; }
        .label {
            color: var(--vscode-foreground);
            opacity: 0.8;
        }
        .value { color: var(--vscode-editor-foreground); }
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
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to show type properties: ${err.message}`);
    }
}

/**
 * View properties of a PostgreSQL type
 */
export async function cmdShowTypeProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const typeResult = await client.query(TYPE_INFO_QUERY, [item.label, item.schema]);
            if (typeResult.rows.length === 0) {
                throw new Error('Type not found');
            }

            // Rest of the function remains the same
            const typeInfo = typeResult.rows[0];
            const fields = typeResult.rows.map(row => ({
                name: row.attname,
                type: row.data_type,
                position: row.ordinal_position
            }));

            const panel = vscode.window.createWebviewPanel(
                'typeProperties',
                `${item.schema}.${item.label} Properties`,
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            panel.webview.html = `
            // ... rest of the existing WebView HTML ...
            `;
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to show type properties: ${err.message}`);
    }
}

export async function cmdDropType(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Drop Type: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>🛑 Caution:</strong> This action will permanently delete the type. This operation cannot be undone.
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
                `-- Drop type
DROP TYPE IF EXISTS ${item.schema}.${item.label} CASCADE;`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create drop type notebook: ${err.message}`);
    }
}

/**
 * cmdRefreshType - Refreshes the type item in the tree view.
 */
export async function cmdRefreshType(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    databaseTreeProvider?.refresh(item);
}

/**
 * cmdCreateType - Command to create a new type in the database.
 */
export async function cmdCreateType(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Create New Type in Schema: \`${item.schema}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the type definition below and execute the cell to create the type.
</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 Type Definition`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create new composite type
CREATE TYPE ${item.schema}.type_name AS (
    field1 text,
    field2 integer
);

-- Or create an enum type
/*
CREATE TYPE ${item.schema}.status_enum AS ENUM (
    'active',
    'inactive',
    'pending'
);
*/

-- Add comment
COMMENT ON TYPE ${item.schema}.type_name IS 'Type description';`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create type notebook: ${err.message}`);
    }
}