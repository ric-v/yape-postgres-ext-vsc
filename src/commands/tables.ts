import { Client } from 'pg';
import * as vscode from 'vscode';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { TablePropertiesPanel } from '../tableProperties';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from './connection';
import { ConnectionManager } from '../services/ConnectionManager';

// ... (keep existing queries) ...
const TABLE_INFO_QUERY = `
WITH columns AS (
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
    ) as columns
    FROM information_schema.columns
    WHERE table_schema = $1 
    AND table_name = $2
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
    LEFT JOIN information_schema.referential_constraints rc 
        ON tc.constraint_name = rc.constraint_name
        AND tc.constraint_schema = rc.constraint_schema
    LEFT JOIN information_schema.constraint_column_usage ccu 
        ON rc.unique_constraint_name = ccu.constraint_name
        AND rc.unique_constraint_schema = ccu.constraint_schema
    WHERE tc.table_schema = $1 
    AND tc.table_name = $2
    GROUP BY tc.constraint_name, tc.constraint_type, ccu.table_schema, ccu.table_name
) 
SELECT 
    c.columns,
    COALESCE(
        json_agg(
            json_build_object(
                'name', cs.constraint_name,
                'type', cs.constraint_type,
                'columns', cs.columns,
                'reference', cs.foreign_key_reference
            )
            ORDER BY cs.constraint_name
        ) FILTER (WHERE cs.constraint_name IS NOT NULL),
        '[]'::json
    ) as constraints
FROM columns c
LEFT JOIN constraints cs ON true
GROUP BY c.columns`;

const COLUMN_INFO_QUERY = `
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = $1 
AND table_name = $2 
ORDER BY ordinal_position`;

const COLUMN_WITH_PK_QUERY = `
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

// ... (keep existing functions) ...

export async function cmdScriptSelect(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    await createSimpleNotebook(item, 'SELECT Script', `SELECT * FROM ${item.schema}.${item.label} LIMIT 100;`);
}

export async function cmdScriptInsert(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    await cmdInsertTable(item, context);
}

export async function cmdScriptUpdate(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    await cmdUpdateTable(item, context);
}

export async function cmdScriptDelete(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    await createSimpleNotebook(item, 'DELETE Script',
        `-- Delete rows
DELETE FROM ${item.schema}.${item.label}
WHERE condition; -- e.g., id = 1

-- Delete with RETURNING
/*
DELETE FROM ${item.schema}.${item.label}
WHERE condition
RETURNING *;
*/`);
}

export async function cmdScriptCreate(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    await cmdEditTable(item, context);
}

export async function cmdMaintenanceVacuum(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    await createSimpleNotebook(item, 'VACUUM', `VACUUM (VERBOSE, ANALYZE) ${item.schema}.${item.label};`);
}

export async function cmdMaintenanceAnalyze(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    await createSimpleNotebook(item, 'ANALYZE', `ANALYZE VERBOSE ${item.schema}.${item.label};`);
}

export async function cmdMaintenanceReindex(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    await createSimpleNotebook(item, 'REINDEX', `REINDEX TABLE ${item.schema}.${item.label};`);
}

async function createSimpleNotebook(item: DatabaseTreeItem, title: string, sql: string) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# ${title}: ${item.schema}.${item.label}\n\nExecute the cell below to run the query.`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                sql,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create ${title} notebook: ${err.message}`);
    }
}

// ... (keep existing exports) ...
export async function cmdTableOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    // ... (existing implementation) ...
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
            const result = await client.query(TABLE_INFO_QUERY, [item.schema, item.label]);
            const tableDefinition = buildTableDefinition(item.schema!, item.label, result.rows[0]);
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `# Table Operations: ${item.schema}.${item.label}\n\nThis notebook contains common operations for the PostgreSQL table. Run the cells below to execute the operations.\n\n## Available Operations\n- **View Definition**: Show the CREATE TABLE statement\n- **Query Data**: Select the first 100 rows\n- **Insert Data**: Template for inserting new rows\n- **Update Data**: Template for updating existing rows\n- **Delete Data**: Template for deleting rows\n- **Truncate**: Remove all data (Warning: Irreversible)\n- **Drop**: Delete the table (Warning: Irreversible)`,
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
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create table operations notebook: ${err.message}`);
    }
}

export async function cmdEditTable(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const result = await client.query(TABLE_INFO_QUERY, [item.schema, item.label]);
            const tableDefinition = buildTableDefinition(item.schema!, item.label, result.rows[0]);
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `# Edit Table: ${item.schema}.${item.label}\n\nModify the table definition below and execute the cell to update the table structure.\n\n> **Note:** This will create a new table. If you need to migrate data, please do so separately.`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    tableDefinition,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create table edit notebook: ${err.message}`);
    }
}

export async function cmdInsertTable(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const result = await client.query(COLUMN_INFO_QUERY, [item.schema, item.label]);
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

            const metadata = createMetadata(connection, item.databaseName);
            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `# Insert Data: ${item.schema}.${item.label}\n\nReplace the placeholder values in the INSERT statement below with your actual data.`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Insert single row
INSERT INTO ${item.schema}.${item.label} (
    ${columns.join(',\n    ')}
)
VALUES (
    ${placeholders.join(',\n    ')}
)
RETURNING *;

-- Insert multiple rows (example)
/*
INSERT INTO ${item.schema}.${item.label} (
    ${columns.join(',\n    ')}
)
VALUES
    (${placeholders.join(', ')}),
    (${placeholders.join(', ')})
RETURNING *;
*/`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create insert notebook: ${err.message}`);
    }
}

export async function cmdUpdateTable(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const result = await client.query(COLUMN_WITH_PK_QUERY, [item.schema, item.label]);
            const pkColumns = result.rows.filter(col => col.is_primary_key).map(col => col.column_name);
            const whereClause = pkColumns.length > 0 ?
                `WHERE ${pkColumns.map(col => `${col} = value`).join(' AND ')}` :
                '-- Add your WHERE clause here to identify rows to update';

            const metadata = createMetadata(connection, item.databaseName);
            const cells = [
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

-- Example of updating multiple columns with CASE
/*
UPDATE ${item.schema}.${item.label}
SET
    ${result.rows.map(col => `${col.column_name} = CASE 
        WHEN ${col.data_type.toLowerCase().includes('char') || col.data_type.toLowerCase() === 'text' ?
                            `condition THEN 'new_value'` :
                            `condition THEN 0`}
        ELSE ${col.column_name}
    END`).join(',\n    ')}
${whereClause}
RETURNING *;
*/`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create update notebook: ${err.message}`);
    }
}

export async function cmdViewTableData(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
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
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create view data notebook: ${err.message}`);
    }
}

export async function cmdDropTable(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Drop Table: ${item.schema}.${item.label}\n\n> [!WARNING]\n> **Warning:** This action will permanently delete the table and all its data. This operation cannot be undone.`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Drop table
DROP TABLE IF EXISTS ${item.schema}.${item.label};`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create drop table notebook: ${err.message}`);
    }
}

export async function cmdTruncateTable(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Truncate Table: ${item.schema}.${item.label}\n\n> [!WARNING]\n> **Warning:** This action will remove all data from the table. This operation cannot be undone.`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Truncate table
TRUNCATE TABLE ${item.schema}.${item.label};`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create truncate notebook: ${err.message}`);
    }
}

export async function cmdShowTableProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);

        try {
            const client = await ConnectionManager.getInstance().getConnection({
                id: connection.id,
                host: connection.host,
                port: connection.port,
                username: connection.username,
                database: item.databaseName,
                name: connection.name
            });
            await TablePropertiesPanel.show(client, item.schema!, item.label);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to show table properties: ${err.message}`);
    }
}

function buildTableDefinition(schema: string, tableName: string, result: any): string {
    const createTable = `CREATE TABLE ${schema}.${tableName} (\n    ${result.columns}`;
    const constraints = Array.isArray(result.constraints) && result.constraints[0]?.name ?
        result.constraints.map((c: { type: string; name: string; columns: string[]; reference?: { schema: string; table: string; columns: string[] } }) => {
            switch (c.type) {
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

    return `${createTable}${constraints ? ',\n' + constraints : ''}\n);`;
}

export async function cmdRefreshTable(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    databaseTreeProvider?.refresh(item);
}
