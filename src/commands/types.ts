import * as vscode from 'vscode';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from '../commands/connection';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
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
        const metadata = createMetadata(connection, item.databaseName);

        const markdown = `### 🔧 Type Operations: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 8px 12px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ About PostgreSQL Types:</strong> Custom types allow you to define reusable data structures. Composite types group related fields, while enums define a set of allowed values.
</div>

#### 📋 Common Operations

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 25%;">Operation</th>
        <th style="text-align: left; width: 50%;">Description</th>
        <th style="text-align: left;">Use Case</th>
    </tr>
    <tr>
        <td><strong>📝 View Definition</strong></td>
        <td>Display the complete CREATE TYPE statement</td>
        <td>Documentation, recreation</td>
    </tr>
    <tr>
        <td><strong>✏️ Modify Type</strong></td>
        <td>Alter type properties (limited changes allowed)</td>
        <td>Add enum values, rename</td>
    </tr>
    <tr>
        <td><strong>🔄 Recreate Type</strong></td>
        <td>Drop and recreate with modifications (requires CASCADE)</td>
        <td>Change composite fields</td>
    </tr>
    <tr>
        <td><strong>🔍 Find Usage</strong></td>
        <td>Search for tables/columns using this type</td>
        <td>Impact analysis</td>
    </tr>
    <tr>
        <td><strong>💬 Add Comment</strong></td>
        <td>Document the type's purpose and usage</td>
        <td>Team collaboration</td>
    </tr>
</table>

---`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 View Type Definition\n\n<div style="font-size: 11px; background-color: #2d3842; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 8px; border-radius: 3px;">\n    <strong>ℹ️ Info:</strong> Query the system catalog to see the complete type definition.\n</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- View type information
SELECT 
    t.typname as type_name,
    n.nspname as schema_name,
    pg_get_userbyid(t.typowner) as owner,
    CASE t.typtype
        WHEN 'c' THEN 'composite'
        WHEN 'e' THEN 'enum'
        WHEN 'r' THEN 'range'
        ELSE t.typtype::text
    END as type_category,
    obj_description(t.oid, 'pg_type') as description
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typname = '${item.label}' AND n.nspname = '${item.schema}';

-- For composite types, view fields
SELECT 
    a.attname as field_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
    a.attnum as position
FROM pg_type t
JOIN pg_class c ON c.oid = t.typrelid
JOIN pg_attribute a ON a.attrelid = c.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typname = '${item.label}' 
  AND n.nspname = '${item.schema}'
  AND a.attnum > 0
ORDER BY a.attnum;

-- For enum types, view values
SELECT enumlabel as value, enumsortorder as sort_order
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = '${item.label}' 
                   AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${item.schema}'))
ORDER BY enumsortorder;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ✏️ Modify Type (Enum Only)\n\n<div style="font-size: 11px; background-color: #2d3842; border-left: 3px solid #f39c12; padding: 6px 10px; margin-bottom: 8px; border-radius: 3px;">\n    <strong>⚠️ Note:</strong> You can only add values to enum types. Composite types require recreation.\n</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add new value to enum type (at the end)
ALTER TYPE ${item.schema}.${item.label} ADD VALUE 'new_value';

-- Add new value before an existing value
ALTER TYPE ${item.schema}.${item.label} ADD VALUE 'new_value' BEFORE 'existing_value';

-- Add new value after an existing value
ALTER TYPE ${item.schema}.${item.label} ADD VALUE 'new_value' AFTER 'existing_value';

-- Rename type
ALTER TYPE ${item.schema}.${item.label} RENAME TO new_type_name;

-- Move to different schema
ALTER TYPE ${item.schema}.${item.label} SET SCHEMA new_schema;

-- Change owner
ALTER TYPE ${item.schema}.${item.label} OWNER TO new_owner;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔄 Recreate Type (Composite)\n\n<div style="font-size: 11px; background-color: #2d3842; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 8px; border-radius: 3px;">\n    <strong>⚠️ Warning:</strong> This will drop and recreate the type. Use CASCADE to drop dependent objects.\n</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Drop and recreate composite type
DROP TYPE IF EXISTS ${item.schema}.${item.label} CASCADE;

CREATE TYPE ${item.schema}.${item.label} AS (
    field1 text,
    field2 integer,
    field3 timestamp
);

-- Add comment
COMMENT ON TYPE ${item.schema}.${item.label} IS 'Updated type description';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔍 Find Type Usage`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Find all columns using this type
SELECT 
    n.nspname as schema_name,
    c.relname as table_name,
    a.attname as column_name,
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'f' THEN 'foreign table'
    END as object_type
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_type t ON t.oid = a.atttypid
WHERE t.typname = '${item.label}'
  AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${item.schema}')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY n.nspname, c.relname, a.attname;

-- Find functions using this type
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proargtypes::oid[] && ARRAY[(SELECT oid FROM pg_type WHERE typname = '${item.label}' 
                                      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${item.schema}'))]::oid[]
   OR p.prorettype = (SELECT oid FROM pg_type WHERE typname = '${item.label}' 
                      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${item.schema}'))
ORDER BY n.nspname, p.proname;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 💬 Add or Update Comment`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add or update type comment
COMMENT ON TYPE ${item.schema}.${item.label} IS 'Description of the type, its purpose, and usage examples';

-- Remove comment
-- COMMENT ON TYPE ${item.schema}.${item.label} IS NULL;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📚 Type Usage Examples\n\n<div style="font-size: 11px; background-color: #2d3842; border-left: 3px solid #9b59b6; padding: 8px 12px; margin-top: 8px; border-radius: 3px;">\n    <strong>💡 Using Custom Types:</strong>\n    <ul style="margin: 5px 0;">\n        <li>Create columns with custom types in tables</li>\n        <li>Use as function parameters and return types</li>\n        <li>Define arrays of custom types</li>\n        <li>Cast values to and from custom types</li>\n    </ul>\n</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create table using the custom type
CREATE TABLE example_table (
    id serial PRIMARY KEY,
    data ${item.schema}.${item.label},
    data_array ${item.schema}.${item.label}[]
);

-- Insert data (composite type example)
INSERT INTO example_table (data) 
VALUES (ROW('value1', 123, '2025-01-01')::${item.schema}.${item.label});

-- Query and access composite type fields
SELECT 
    (data).field1,
    (data).field2,
    (data).field3
FROM example_table;

-- Use in function
CREATE OR REPLACE FUNCTION process_data(input_data ${item.schema}.${item.label})
RETURNS text AS $$
BEGIN
    RETURN 'Processed: ' || (input_data).field1;
END;
$$ LANGUAGE plpgsql;`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
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
            // Gather comprehensive type information
            const [typeInfoResult, enumValuesResult, dependenciesResult] = await Promise.all([
                // Basic type info with fields
                client.query(TYPE_INFO_QUERY, [item.label, item.schema]),
                
                // Enum values if it's an enum type
                client.query(`
                    SELECT enumlabel, enumsortorder
                    FROM pg_enum
                    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = $1 
                                      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2))
                    ORDER BY enumsortorder
                `, [item.label, item.schema]),
                
                // Objects using this type
                client.query(`
                    SELECT DISTINCT
                        n.nspname as schema,
                        c.relname as table_name,
                        a.attname as column_name,
                        c.relkind as object_kind
                    FROM pg_attribute a
                    JOIN pg_class c ON c.oid = a.attrelid
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    JOIN pg_type t ON t.oid = a.atttypid
                    WHERE t.typname = $1
                    AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)
                    AND a.attnum > 0
                    AND NOT a.attisdropped
                    ORDER BY n.nspname, c.relname, a.attname
                `, [item.label, item.schema])
            ]);

            if (typeInfoResult.rows.length === 0) {
                throw new Error('Type not found');
            }

            const typeInfo = typeInfoResult.rows[0];
            const fields = typeInfoResult.rows;
            const enumValues = enumValuesResult.rows;
            const dependencies = dependenciesResult.rows;
            const metadata = createMetadata(connection, item.databaseName);

            const getObjectKindLabel = (kind: string) => {
                switch (kind) {
                    case 'r': return '📊 Table';
                    case 'v': return '👁️ View';
                    case 'm': return '💾 Materialized View';
                    case 'f': return '🌍 Foreign Table';
                    default: return kind;
                }
            };

            // Build fields table HTML
            const fieldRows = fields.map(field => {
                return `    <tr>
        <td>${field.ordinal_position}</td>
        <td><strong>${field.attname}</strong></td>
        <td><code>${field.data_type}</code></td>
    </tr>`;
            }).join('\n');

            // Build enum values table HTML
            const enumRows = enumValues.map(val => {
                return `    <tr>
        <td>${val.enumsortorder}</td>
        <td><code>${val.enumlabel}</code></td>
    </tr>`;
            }).join('\n');

            // Build dependencies table HTML
            const dependencyRows = dependencies.map(dep => {
                return `    <tr>
        <td>${getObjectKindLabel(dep.object_kind)}</td>
        <td><code>${dep.schema}.${dep.table_name}</code></td>
        <td>${dep.column_name}</td>
    </tr>`;
            }).join('\n');

            const typeIcon = typeInfo.type_type === 'enum' ? '🏷️' : typeInfo.type_type === 'composite' ? '📦' : '🔧';

            const markdown = `### ${typeIcon} Type Properties: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Owner:</strong> ${typeInfo.owner} | <strong>Type:</strong> ${typeInfo.type_type.toUpperCase()} ${typeInfo.description ? `| <strong>Description:</strong> ${typeInfo.description}` : ''}
</div>

#### 📊 General Information

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left; width: 30%;">Property</th><th style="text-align: left;">Value</th></tr>
    <tr><td><strong>Schema</strong></td><td>${item.schema}</td></tr>
    <tr><td><strong>Name</strong></td><td>${item.label}</td></tr>
    <tr><td><strong>Owner</strong></td><td>${typeInfo.owner}</td></tr>
    <tr><td><strong>Type Category</strong></td><td>${typeInfo.type_type === 'composite' ? '📦 Composite Type' : typeInfo.type_type === 'enum' ? '🏷️ Enumeration Type' : typeInfo.type_type === 'range' ? '↔️ Range Type' : typeInfo.type_type}</td></tr>
    ${typeInfo.description ? `<tr><td><strong>Description</strong></td><td>${typeInfo.description}</td></tr>` : ''}
</table>

${typeInfo.type_type === 'composite' && fields.length > 0 ? `#### 📋 Fields (${fields.length})

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 10%;">#</th>
        <th style="text-align: left; width: 35%;">Name</th>
        <th style="text-align: left;">Data Type</th>
    </tr>
${fieldRows}
</table>

` : ''}${typeInfo.type_type === 'enum' && enumValues.length > 0 ? `#### 🏷️ Enum Values (${enumValues.length})

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 15%;">Order</th>
        <th style="text-align: left;">Value</th>
    </tr>
${enumRows}
</table>

` : ''}${dependencies.length > 0 ? `#### 🔗 Usage (${dependencies.length})

<div style="font-size: 11px; background-color: #2d3a42; border-left: 3px solid #9b59b6; padding: 6px 10px; margin-bottom: 10px; border-radius: 3px;">
    Objects that use this type:
</div>

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 20%;">Object Type</th>
        <th style="text-align: left; width: 40%;">Object Name</th>
        <th style="text-align: left;">Column</th>
    </tr>
${dependencyRows}
</table>

` : ''}---`;

            const cells = [
                new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 CREATE TYPE Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    typeInfo.type_type === 'enum' 
                        ? `-- DROP TYPE IF EXISTS ${item.schema}.${item.label};

CREATE TYPE ${item.schema}.${item.label} AS ENUM (
${enumValues.map(val => `    '${val.enumlabel}'`).join(',\n')}
);${typeInfo.description ? `\n\n-- Type comment\nCOMMENT ON TYPE ${item.schema}.${item.label} IS '${typeInfo.description.replace(/'/g, "''")}';` : `\n\n-- COMMENT ON TYPE ${item.schema}.${item.label} IS 'type description';`}`
                        : `-- DROP TYPE IF EXISTS ${item.schema}.${item.label};

CREATE TYPE ${item.schema}.${item.label} AS (
${fields.map(field => `    ${field.attname} ${field.data_type}`).join(',\n')}
);${typeInfo.description ? `\n\n-- Type comment\nCOMMENT ON TYPE ${item.schema}.${item.label} IS '${typeInfo.description.replace(/'/g, "''")}';` : `\n\n-- COMMENT ON TYPE ${item.schema}.${item.label} IS 'type description';`}`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🗑️ DROP Type Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop type (with dependencies)\nDROP TYPE IF EXISTS ${item.schema}.${item.label} CASCADE;\n\n-- Drop type (without dependencies - will fail if referenced)\n-- DROP TYPE IF EXISTS ${item.schema}.${item.label} RESTRICT;`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager
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