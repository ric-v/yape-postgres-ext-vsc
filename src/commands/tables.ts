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
    const markdown = `### 📖 SELECT Script: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Execute the query below to retrieve data from the table.
</div>`;
    await createSimpleNotebook(item, 'SELECT Script', `SELECT * FROM ${item.schema}.${item.label} LIMIT 100;`, markdown);
}

export async function cmdScriptInsert(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    await cmdInsertTable(item, context);
}

export async function cmdScriptUpdate(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    await cmdUpdateTable(item, context);
}

export async function cmdScriptDelete(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    const markdown = `### 🗑️ DELETE Script: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>⚠️ Warning:</strong> This will delete rows from the table. Always use a WHERE clause!
</div>`;

    await createSimpleNotebook(item, 'DELETE Script',
        `-- Delete rows
DELETE FROM ${item.schema}.${item.label}
WHERE condition; -- e.g., id = 1

-- Delete with RETURNING
/*
DELETE FROM ${item.schema}.${item.label}
WHERE condition
RETURNING *;
*/`, markdown);
}

export async function cmdScriptCreate(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    await cmdEditTable(item, context);
}

export async function cmdMaintenanceVacuum(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    const markdown = `### 🧹 VACUUM: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> VACUUM reclaims storage occupied by dead tuples and updates statistics for the query planner.
</div>

#### 🎯 What VACUUM Does

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Operation</th><th style="text-align: left;">Description</th><th style="text-align: left;">Benefit</th></tr>
    <tr><td><strong>Dead Tuple Cleanup</strong></td><td>Removes obsolete row versions</td><td>Frees disk space</td></tr>
    <tr><td><strong>Update Statistics</strong></td><td>Refreshes table statistics</td><td>Improves query planning</td></tr>
    <tr><td><strong>Prevent Wraparound</strong></td><td>Freezes old transaction IDs</td><td>Ensures database health</td></tr>
    <tr><td><strong>Update Visibility Map</strong></td><td>Marks pages as all-visible</td><td>Speeds up index-only scans</td></tr>
</table>

#### 📊 VACUUM Options

- **VACUUM**: Standard maintenance, doesn't lock table
- **VACUUM FULL**: Reclaims more space but requires exclusive lock
- **VACUUM ANALYZE**: Combines cleanup with statistics update (recommended)
- **VACUUM VERBOSE**: Shows detailed progress information

#### ⏱️ When to Run

- After large batch DELETE or UPDATE operations
- Regularly on high-transaction tables
- When query performance degrades
- Before major reporting operations

<div style="font-size: 12px; background-color: #2d3e30; border-left: 3px solid #2ecc71; padding: 6px 10px; margin-top: 15px; border-radius: 3px;">
    <strong>💡 Tip:</strong> PostgreSQL has autovacuum running automatically, but manual VACUUM can be useful after bulk operations. Use VACUUM FULL only during maintenance windows as it locks the table.
</div>`;

    await createSimpleNotebook(item, 'VACUUM', `VACUUM (VERBOSE, ANALYZE) ${item.schema}.${item.label};`, markdown);
}

export async function cmdMaintenanceAnalyze(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    const markdown = `### 📊 ANALYZE: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> ANALYZE collects statistics about the contents of tables for the query planner to optimize query execution plans.
</div>

#### 🎯 What ANALYZE Does

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Statistic Collected</th><th style="text-align: left;">Purpose</th></tr>
    <tr><td><strong>Row Count</strong></td><td>Estimates total rows in table</td></tr>
    <tr><td><strong>Most Common Values</strong></td><td>Identifies frequently occurring values</td></tr>
    <tr><td><strong>Value Distribution</strong></td><td>Analyzes value ranges and histograms</td></tr>
    <tr><td><strong>NULL Frequency</strong></td><td>Counts NULL values per column</td></tr>
    <tr><td><strong>Column Correlation</strong></td><td>Measures correlation between columns</td></tr>
</table>

#### 📈 Impact on Performance

**Before ANALYZE:**
- Query planner uses outdated statistics
- May choose suboptimal execution plans
- Queries might use wrong indexes or scan methods

**After ANALYZE:**
- ✅ Accurate table statistics
- ✅ Better query plan selection
- ✅ Improved query performance
- ✅ More efficient index usage

#### ⏱️ When to Run

- ✅ After bulk INSERT, UPDATE, or DELETE operations
- ✅ After importing large datasets
- ✅ When query performance suddenly degrades
- ✅ After creating or modifying indexes
- ✅ When table size changes significantly

<div style="font-size: 12px; background-color: #2d3e30; border-left: 3px solid #2ecc71; padding: 6px 10px; margin-top: 15px; border-radius: 3px;">
    <strong>💡 Tip:</strong> ANALYZE is fast and non-blocking. Run it frequently, especially after data changes. Use VERBOSE to see detailed statistics updates.
</div>`;

    await createSimpleNotebook(item, 'ANALYZE', `ANALYZE VERBOSE ${item.schema}.${item.label};`, markdown);
}

export async function cmdMaintenanceReindex(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    const markdown = `### 🔄 REINDEX: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>⚠️ Warning:</strong> REINDEX rebuilds all indexes on the table. This operation locks the table and can take significant time on large tables.
</div>

#### 🎯 What REINDEX Does

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Operation</th><th style="text-align: left;">Impact</th></tr>
    <tr><td><strong>Rebuild Indexes</strong></td><td>Creates fresh index structures</td></tr>
    <tr><td><strong>Fix Corruption</strong></td><td>Repairs damaged indexes</td></tr>
    <tr><td><strong>Remove Bloat</strong></td><td>Eliminates index bloat</td></tr>
    <tr><td><strong>Update Statistics</strong></td><td>Refreshes index statistics</td></tr>
</table>

#### 🔍 When to Use REINDEX

**Use REINDEX when:**
- ✅ Indexes are corrupted (rare, but can happen after crashes)
- ✅ Index bloat is significant (check with pg_stat_all_indexes)
- ✅ Query performance degraded despite VACUUM
- ✅ After PostgreSQL version upgrades (sometimes recommended)

**Don't use REINDEX when:**
- ❌ Normal maintenance (use VACUUM instead)
- ❌ On production during peak hours (requires locks)
- ❌ Trying to fix query performance (analyze query plans first)

#### ⚠️ Performance Impact

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Aspect</th><th style="text-align: left;">Impact</th></tr>
    <tr><td><strong>Duration</strong></td><td>Can be long on large tables/indexes</td></tr>
    <tr><td><strong>Locking</strong></td><td>Table locked during rebuild</td></tr>
    <tr><td><strong>I/O</strong></td><td>High disk I/O activity</td></tr>
    <tr><td><strong>Space</strong></td><td>Requires disk space for new index</td></tr>
</table>

#### 🔄 Alternatives

- **REINDEX CONCURRENTLY** (PostgreSQL 12+): Rebuilds without locking, but slower
- **CREATE INDEX CONCURRENTLY + DROP**: Manual rebuild without exclusive locks
- **VACUUM FULL**: May be sufficient if bloat is the issue

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-top: 15px; border-radius: 3px;">
    <strong>🛑 Caution:</strong> REINDEX locks the table for writes. Schedule during maintenance windows or use REINDEX CONCURRENTLY if supported.
</div>`;

    await createSimpleNotebook(item, 'REINDEX', `REINDEX TABLE ${item.schema}.${item.label};`, markdown);
}

async function createSimpleNotebook(item: DatabaseTreeItem, title: string, sql: string, markdownContent?: string) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const defaultMarkdown = `# ${title}: \`${item.schema}.${item.label}\`\n\nExecute the cell below to run the query.`;

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                markdownContent || defaultMarkdown,
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
                    `### 📊 Table Operations: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> This notebook provides comprehensive CRUD (Create, Read, Update, Delete) operations and maintenance tools for your PostgreSQL table. Each cell is a ready-to-execute template.
</div>

#### 🎯 Available Operations

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Operation</th><th style="text-align: left;">Description</th><th style="text-align: left;">Risk Level</th></tr>
    <tr><td>🔍 <strong>View Definition</strong></td><td>Display CREATE TABLE statement</td><td>✅ Safe</td></tr>
    <tr><td>📖 <strong>Query Data</strong></td><td>Select and view table rows</td><td>✅ Safe</td></tr>
    <tr><td>➕ <strong>Insert Data</strong></td><td>Add new rows to the table</td><td>⚠️ Modifies Data</td></tr>
    <tr><td>✏️ <strong>Update Data</strong></td><td>Modify existing rows</td><td>⚠️ Modifies Data</td></tr>
    <tr><td>🗑️ <strong>Delete Data</strong></td><td>Remove specific rows</td><td>⚠️ Modifies Data</td></tr>
    <tr><td>🧹 <strong>Truncate</strong></td><td>Remove ALL data (fast)</td><td>🔴 Destructive</td></tr>
    <tr><td>❌ <strong>Drop Table</strong></td><td>Delete table permanently</td><td>🔴 Destructive</td></tr>
</table>

<div style="font-size: 12px; background-color: #2d3e30; border-left: 3px solid #2ecc71; padding: 6px 10px; margin-top: 15px; border-radius: 3px;">
    <strong>💡 Tip:</strong> Use \`Ctrl+Enter\` to execute individual cells. Consider wrapping destructive operations in transactions for safety.
</div>

---`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔍 Table Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Table definition\n${tableDefinition}`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📖 Query Data`,
                    'markdown'
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
                    vscode.NotebookCellKind.Markup,
                    `#### ➕ Insert Data

Add new rows to the table. Replace placeholder comments with actual column names and values.`,
                    'markdown'
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
                    vscode.NotebookCellKind.Markup,
                    `#### ✏️ Update Data

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>⚠️ Warning:</strong> Always include a WHERE clause to avoid updating all rows unintentionally. Test with SELECT first!
</div>`,
                    'markdown'
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
                    vscode.NotebookCellKind.Markup,
                    `#### 🗑️ Delete Data

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>⚠️ Warning:</strong> Deleted rows cannot be recovered unless you have backups. Always include a WHERE clause!
</div>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Delete data
DELETE FROM ${item.schema}.${item.label}
WHERE condition;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `#### 🧹 Truncate Table

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>🛑 Caution:</strong> This removes <strong>ALL DATA</strong> from the table instantly. This operation cannot be undone. Consider backing up data first.
</div>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Truncate table (remove all data)
TRUNCATE TABLE ${item.schema}.${item.label};`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `#### ❌ Drop Table

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>🛑 Caution:</strong> This <strong>PERMANENTLY DELETES</strong> the table and all its data, indexes, and constraints. This cannot be undone!
</div>

**Before dropping:**
- ✅ Verify you're targeting the correct table
- ✅ Ensure you have recent backups
- ✅ Check for dependent objects (views, foreign keys)`,
                    'markdown'
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
                    `### Edit Table: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the table definition below and execute the cell to update the table structure. This will create a new table.
</div>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 Table Definition`,
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
                    `### ➕ Insert Data: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Replace placeholder values below with your actual data. Use the data type reference to format values correctly.
</div>

#### 📋 Common Data Type Formats

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Data Type</th><th style="text-align: left;">Example Value</th><th style="text-align: left;">Notes</th></tr>
    <tr><td><strong>Text/Varchar</strong></td><td><code>'example text'</code></td><td>Single quotes required</td></tr>
    <tr><td><strong>Integer/Numeric</strong></td><td><code>42</code> or <code>3.14</code></td><td>No quotes</td></tr>
    <tr><td><strong>Boolean</strong></td><td><code>true</code> or <code>false</code></td><td>Lowercase, no quotes</td></tr>
    <tr><td><strong>Date</strong></td><td><code>'2024-01-15'</code></td><td>Format: YYYY-MM-DD</td></tr>
    <tr><td><strong>Timestamp</strong></td><td><code>'2024-01-15 14:30:00'</code></td><td>Or use <code>NOW()</code></td></tr>
    <tr><td><strong>UUID</strong></td><td><code>'550e8400...'</code></td><td>Or use <code>gen_random_uuid()</code></td></tr>
    <tr><td><strong>JSON/JSONB</strong></td><td><code>'{"key": "value"}'</code></td><td>Valid JSON in quotes</td></tr>
    <tr><td><strong>NULL</strong></td><td><code>NULL</code></td><td>For optional fields</td></tr>
</table>

<div style="font-size: 12px; background-color: #2d3e30; border-left: 3px solid #2ecc71; padding: 6px 10px; margin-top: 15px; border-radius: 3px;">
    <strong>💡 Tip:</strong> Use \`RETURNING *\` to see the inserted row immediately. For bulk inserts, specify multiple value tuples.
</div>`,
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
                    `### ✏️ Update Data: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>⚠️ Warning:</strong> Always include a WHERE clause to avoid updating all rows unintentionally. Test with SELECT first!
</div>

#### 🎯 Safety Checklist

<table style="font-size: 11px; width: 100%; border-collapse: collapse; margin-bottom: 15px;">
    <tr><td>✅ <strong>Test WHERE</strong></td><td>Test your WHERE clause with a SELECT query first</td></tr>
    <tr><td>✅ <strong>Transaction</strong></td><td>Consider using a transaction (BEGIN/COMMIT/ROLLBACK)</td></tr>
    <tr><td>✅ <strong>Verify Count</strong></td><td>Verify the number of affected rows matches expectations</td></tr>
    <tr><td>✅ <strong>Backup</strong></td><td>Have a backup if updating critical data</td></tr>
</table>

#### 💡 Common Update Patterns

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Pattern</th><th style="text-align: left;">Use Case</th></tr>
    <tr><td><strong>Single Column</strong></td><td><code>SET status = 'active'</code></td></tr>
    <tr><td><strong>Multiple Columns</strong></td><td><code>SET status = 'active', updated_at = NOW()</code></td></tr>
    <tr><td><strong>Conditional</strong></td><td><code>SET price = CASE WHEN qty > 10 THEN price * 0.9 ELSE price END</code></td></tr>
    <tr><td><strong>From Table</strong></td><td><code>FROM other_table WHERE table.id = other_table.ref_id</code></td></tr>
</table>

<div style="font-size: 12px; background-color: #2d3e30; border-left: 3px solid #2ecc71; padding: 6px 10px; margin-top: 15px; border-radius: 3px;">
    <strong>💡 Tip:</strong> Use \`RETURNING *\` to see updated rows. For safer updates, wrap in a transaction and review changes before committing.
</div>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 Update Command`,
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
                `### View Table Data: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the query below to filter or transform the data as needed.
</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📖 Query Data`,
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
                `### ❌ Drop Table: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>🛑 Caution:</strong> This action will <strong>PERMANENTLY DELETE</strong> the table and <strong>ALL DATA</strong>. This cannot be undone!
</div>

#### 🔍 Pre-Drop Checklist

<table style="font-size: 11px; width: 100%; border-collapse: collapse; margin-bottom: 15px;">
    <tr><td>✅ <strong>Backups</strong></td><td>Do you have recent backups of this data?</td></tr>
    <tr><td>✅ <strong>Verification</strong></td><td>Is this definitely the table you want to drop?</td></tr>
    <tr><td>✅ <strong>Dependencies</strong></td><td>Check for views, foreign keys, and app usage</td></tr>
    <tr><td>✅ <strong>Production</strong></td><td>Have you followed change management procedures?</td></tr>
</table>

#### 🔗 Check Dependencies

Run this query first to check for dependencies:

\`\`\`sql
-- Check views that depend on this table
SELECT DISTINCT view_name
FROM information_schema.view_table_usage
WHERE table_schema = '${item.schema}'
  AND table_name = '${item.label}';

-- Check foreign key constraints
SELECT 
    tc.table_schema, 
    tc.table_name, 
    kcu.column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND kcu.table_schema = '${item.schema}'
  AND kcu.table_name = '${item.label}';
\`\`\`

<div style="font-size: 12px; background-color: #2d3e30; border-left: 3px solid #2ecc71; padding: 6px 10px; margin-top: 15px; border-radius: 3px;">
    <strong>💡 Tip:</strong> Consider using \`DROP TABLE IF EXISTS\` to avoid errors. Use \`CASCADE\` to automatically drop dependent objects (use with extreme caution).
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
                `### 🧹 Truncate Table: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>🛑 Caution:</strong> This removes <strong>ALL DATA</strong> from the table instantly. This operation cannot be undone.
</div>

#### 🔄 TRUNCATE vs DELETE

<table style="font-size: 11px; width: 100%; border-collapse: collapse; margin-bottom: 15px;">
    <tr><th style="text-align: left;">Feature</th><th style="text-align: left;">TRUNCATE</th><th style="text-align: left;">DELETE</th></tr>
    <tr><td><strong>Speed</strong></td><td>⚡ Very fast</td><td>🐌 Slower</td></tr>
    <tr><td><strong>Triggers</strong></td><td>❌ No triggers</td><td>✅ Fires triggers</td></tr>
    <tr><td><strong>Rollback</strong></td><td>⚠️ Transaction only</td><td>✅ Can rollback</td></tr>
    <tr><td><strong>Space</strong></td><td>✅ Reclaimed</td><td>⚠️ Needs VACUUM</td></tr>
</table>

#### 🔒 Safety Recommendations

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><td>✅ <strong>Backup First</strong></td><td>Ensure you have recent backups</td></tr>
    <tr><td>✅ <strong>Verify Table</strong></td><td>Double-check you're truncating the correct table</td></tr>
    <tr><td>✅ <strong>Transaction</strong></td><td>Wrap in BEGIN/COMMIT for safety</td></tr>
    <tr><td>✅ <strong>References</strong></td><td>Ensure no foreign key constraints will break</td></tr>
</table>

<div style="font-size: 12px; background-color: #2d3e30; border-left: 3px solid #2ecc71; padding: 6px 10px; margin-top: 15px; border-radius: 3px;">
    <strong>💡 Tip:</strong> To truncate despite foreign key constraints, use \`TRUNCATE TABLE ${item.schema}.${item.label} CASCADE\`. This will also truncate tables that reference this table (use with extreme caution!).
</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🧹 Truncate Command`,
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

/**
 * cmdCreateTable - Command to create a new table in the database.
 */
export async function cmdCreateTable(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Create New Table in Schema: \`${item.schema}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the table definition below and execute the cell to create the table.
</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 Table Definition`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create new table
CREATE TABLE ${item.schema}.table_name (
    id serial PRIMARY KEY,
    column_name data_type,
    created_at timestamptz DEFAULT current_timestamp
);

-- Add comments
COMMENT ON TABLE ${item.schema}.table_name IS 'Table description';
COMMENT ON COLUMN ${item.schema}.table_name.column_name IS 'Column description';`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create table notebook: ${err.message}`);
    }
}
