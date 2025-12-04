import * as vscode from 'vscode';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { ConnectionManager } from '../services/ConnectionManager';
import { TablePropertiesPanel } from '../tableProperties';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from './connection';
import { MarkdownUtils, ErrorHandlers } from './helper';

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
        const client = await ConnectionManager.getInstance().getConnection({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            database: item.databaseName,
            name: connection.name
        });

        try {
            // Gather comprehensive table information
            const [tableInfo, columnInfo, constraintInfo, indexInfo, statsInfo, sizeInfo] = await Promise.all([
                // Basic table info
                client.query(`
                    SELECT 
                        c.relname as table_name,
                        n.nspname as schema_name,
                        pg_get_userbyid(c.relowner) as owner,
                        obj_description(c.oid) as comment,
                        c.reltuples::bigint as row_estimate,
                        c.relpages as page_count,
                        c.relhasindex as has_indexes,
                        c.relispartition as is_partition
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = $1 AND c.relname = $2
                `, [item.schema, item.label]),
                
                // Column details
                client.query(`
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
                    WHERE table_schema = $1 AND table_name = $2
                    ORDER BY ordinal_position
                `, [item.schema, item.label]),
                
                // Constraints
                client.query(`
                    SELECT 
                        tc.constraint_name,
                        tc.constraint_type,
                        string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns,
                        CASE 
                            WHEN tc.constraint_type = 'FOREIGN KEY' THEN
                                ccu.table_schema || '.' || ccu.table_name
                            ELSE NULL
                        END as referenced_table
                    FROM information_schema.table_constraints tc
                    LEFT JOIN information_schema.key_column_usage kcu 
                        ON tc.constraint_name = kcu.constraint_name
                        AND tc.table_schema = kcu.table_schema
                    LEFT JOIN information_schema.constraint_column_usage ccu
                        ON tc.constraint_name = ccu.constraint_name
                        AND tc.table_schema = ccu.constraint_schema
                    WHERE tc.table_schema = $1 AND tc.table_name = $2
                    GROUP BY tc.constraint_name, tc.constraint_type, ccu.table_schema, ccu.table_name
                    ORDER BY tc.constraint_type, tc.constraint_name
                `, [item.schema, item.label]),
                
                // Indexes
                client.query(`
                    SELECT 
                        i.relname as index_name,
                        ix.indisunique as is_unique,
                        ix.indisprimary as is_primary,
                        string_agg(a.attname, ', ' ORDER BY a.attnum) as columns,
                        pg_get_indexdef(i.oid) as definition,
                        pg_size_pretty(pg_relation_size(i.oid)) as index_size
                    FROM pg_index ix
                    JOIN pg_class i ON i.oid = ix.indexrelid
                    JOIN pg_class t ON t.oid = ix.indrelid
                    JOIN pg_namespace n ON n.oid = t.relnamespace
                    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
                    WHERE n.nspname = $1 AND t.relname = $2
                    GROUP BY i.relname, ix.indisunique, ix.indisprimary, i.oid
                    ORDER BY ix.indisprimary DESC, ix.indisunique DESC, i.relname
                `, [item.schema, item.label]),
                
                // Table statistics
                client.query(`
                    SELECT 
                        n_live_tup as live_tuples,
                        n_dead_tup as dead_tuples,
                        n_mod_since_analyze as modifications_since_analyze,
                        last_vacuum,
                        last_autovacuum,
                        last_analyze,
                        last_autoanalyze,
                        vacuum_count,
                        autovacuum_count,
                        analyze_count,
                        autoanalyze_count
                    FROM pg_stat_user_tables
                    WHERE schemaname = $1 AND relname = $2
                `, [item.schema, item.label]),
                
                // Size information
                client.query(`
                    SELECT 
                        pg_size_pretty(pg_total_relation_size($1::regclass)) as total_size,
                        pg_size_pretty(pg_relation_size($1::regclass)) as table_size,
                        pg_size_pretty(pg_indexes_size($1::regclass)) as indexes_size,
                        pg_size_pretty(pg_total_relation_size($1::regclass) - pg_relation_size($1::regclass)) as toast_size
                `, [`${item.schema}.${item.label}`])
            ]);

            const table = tableInfo.rows[0];
            const columns = columnInfo.rows;
            const constraints = constraintInfo.rows;
            const indexes = indexInfo.rows;
            const stats = statsInfo.rows[0] || {};
            const sizes = sizeInfo.rows[0];

            const metadata = createMetadata(connection, item.databaseName);

            // Build CREATE TABLE script
            const columnDefs = columns.map(col => {
                // Check if column uses a sequence (auto-increment)
                const hasSequence = col.column_default && col.column_default.includes('nextval(');
                
                // Build proper data type
                let dataType = col.data_type;
                
                // Convert integer types with sequences to serial types
                if (hasSequence) {
                    if (col.data_type === 'integer') {
                        dataType = 'serial';
                    } else if (col.data_type === 'bigint') {
                        dataType = 'bigserial';
                    } else if (col.data_type === 'smallint') {
                        dataType = 'smallserial';
                    }
                } else if (col.character_maximum_length && (col.data_type === 'character varying' || col.data_type === 'character' || col.data_type === 'varchar' || col.data_type === 'char')) {
                    dataType = `${col.data_type}(${col.character_maximum_length})`;
                } else if (col.numeric_precision && (col.data_type === 'numeric' || col.data_type === 'decimal')) {
                    dataType = `${col.data_type}(${col.numeric_precision}${col.numeric_scale ? ',' + col.numeric_scale : ''})`;
                }
                
                let colDef = `    ${col.column_name} ${dataType}`;
                
                // For serial types, NOT NULL is implicit, don't add DEFAULT
                if (hasSequence && (dataType === 'serial' || dataType === 'bigserial' || dataType === 'smallserial')) {
                    // NOT NULL is automatic for serial types
                } else {
                    if (col.is_nullable === 'NO') colDef += ' NOT NULL';
                    if (col.column_default) colDef += ` DEFAULT ${col.column_default}`;
                }
                
                return colDef;
            }).join(',\n');

            // Build constraint definitions
            const constraintDefs = constraints.map(c => {
                if (c.constraint_type === 'PRIMARY KEY') {
                    return `    CONSTRAINT ${c.constraint_name} PRIMARY KEY (${c.columns})`;
                } else if (c.constraint_type === 'FOREIGN KEY') {
                    return `    CONSTRAINT ${c.constraint_name} FOREIGN KEY (${c.columns}) REFERENCES ${c.referenced_table}`;
                } else if (c.constraint_type === 'UNIQUE') {
                    return `    CONSTRAINT ${c.constraint_name} UNIQUE (${c.columns})`;
                }
                return null;
            }).filter(c => c !== null);

            const createTableScript = `-- DROP TABLE IF EXISTS ${item.schema}.${item.label};

CREATE TABLE ${item.schema}.${item.label} (
${columnDefs}${constraintDefs.length > 0 ? ',\n' + constraintDefs.join(',\n') : ''}
);

-- Table comment
${table.comment ? `COMMENT ON TABLE ${item.schema}.${item.label} IS '${table.comment.replace(/'/g, "''")}';` : `-- COMMENT ON TABLE ${item.schema}.${item.label} IS 'table description';`}

-- Indexes
${indexes.map(idx => idx.definition).join('\n')}`;

            // Build column table HTML
            const columnRows = columns.map(col => {
                const dataType = col.character_maximum_length 
                    ? `${col.data_type}(${col.character_maximum_length})`
                    : col.numeric_precision 
                        ? `${col.data_type}(${col.numeric_precision}${col.numeric_scale ? ',' + col.numeric_scale : ''})`
                        : col.data_type;
                return `    <tr>
        <td>${col.ordinal_position}</td>
        <td><strong>${col.column_name}</strong></td>
        <td><code>${dataType}</code></td>
        <td>${col.is_nullable === 'YES' ? '✅' : '🚫'}</td>
        <td>${col.column_default ? `<code>${col.column_default}</code>` : '—'}</td>
    </tr>`;
            }).join('\n');

            // Build constraints HTML
            const constraintRows = constraints.map(c => {
                const icon = c.constraint_type === 'PRIMARY KEY' ? '🔑' : 
                           c.constraint_type === 'FOREIGN KEY' ? '🔗' :
                           c.constraint_type === 'UNIQUE' ? '⭐' : '✓';
                const ref = c.referenced_table ? ` → ${c.referenced_table}` : '';
                return `    <tr>
        <td>${icon} ${c.constraint_type}</td>
        <td><code>${c.constraint_name}</code></td>
        <td>${c.columns || ''}</td>
        <td>${c.referenced_table || '—'}</td>
    </tr>`;
            }).join('\n');

            // Build indexes HTML
            const indexRows = indexes.map(idx => {
                const badges = [];
                if (idx.is_primary) badges.push('🔑 PRIMARY');
                if (idx.is_unique) badges.push('⭐ UNIQUE');
                return `    <tr>
        <td><strong>${idx.index_name}</strong>${badges.length > 0 ? ` <span style="font-size: 9px;">${badges.join(' ')}</span>` : ''}</td>
        <td>${idx.columns || ''}</td>
        <td>${idx.index_size}</td>
    </tr>`;
            }).join('\n');

            // Build maintenance history rows
            const maintenanceRows = [];
            if (stats.last_vacuum) {
                maintenanceRows.push(`    <tr>
        <td>Manual VACUUM</td>
        <td>${new Date(stats.last_vacuum).toLocaleString()}</td>
        <td>${stats.vacuum_count || 0}</td>
    </tr>`);
            }
            if (stats.last_autovacuum) {
                maintenanceRows.push(`    <tr>
        <td>Auto VACUUM</td>
        <td>${new Date(stats.last_autovacuum).toLocaleString()}</td>
        <td>${stats.autovacuum_count || 0}</td>
    </tr>`);
            }
            if (stats.last_analyze) {
                maintenanceRows.push(`    <tr>
        <td>Manual ANALYZE</td>
        <td>${new Date(stats.last_analyze).toLocaleString()}</td>
        <td>${stats.analyze_count || 0}</td>
    </tr>`);
            }
            if (stats.last_autoanalyze) {
                maintenanceRows.push(`    <tr>
        <td>Auto ANALYZE</td>
        <td>${new Date(stats.last_autoanalyze).toLocaleString()}</td>
        <td>${stats.autoanalyze_count || 0}</td>
    </tr>`);
            }

            const markdown = `### 📊 Table Properties: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Owner:</strong> ${table.owner} ${table.comment ? `| <strong>Comment:</strong> ${table.comment}` : ''}
</div>

#### 💾 Size & Statistics

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left; width: 30%;">Metric</th><th style="text-align: left;">Value</th></tr>
    <tr><td><strong>Total Size</strong></td><td>${sizes.total_size}</td></tr>
    <tr><td><strong>Table Size</strong></td><td>${sizes.table_size}</td></tr>
    <tr><td><strong>Indexes Size</strong></td><td>${sizes.indexes_size}</td></tr>
    <tr><td><strong>TOAST Size</strong></td><td>${sizes.toast_size}</td></tr>
    <tr><td><strong>Row Estimate</strong></td><td>${table.row_estimate?.toLocaleString() || 'N/A'}</td></tr>
    <tr><td><strong>Live Tuples</strong></td><td>${stats.live_tuples?.toLocaleString() || 'N/A'}</td></tr>
    <tr><td><strong>Dead Tuples</strong></td><td>${stats.dead_tuples?.toLocaleString() || 'N/A'}</td></tr>
</table>

#### 📋 Columns (${columns.length})

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 5%;">#</th>
        <th style="text-align: left; width: 25%;">Name</th>
        <th style="text-align: left; width: 25%;">Data Type</th>
        <th style="text-align: left; width: 10%;">Nullable</th>
        <th style="text-align: left;">Default</th>
    </tr>
${columnRows}
</table>

${constraints.length > 0 ? `#### 🔒 Constraints (${constraints.length})

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 20%;">Type</th>
        <th style="text-align: left; width: 30%;">Name</th>
        <th style="text-align: left; width: 25%;">Columns</th>
        <th style="text-align: left;">References</th>
    </tr>
${constraintRows}
</table>

` : ''}${indexes.length > 0 ? `#### 🔍 Indexes (${indexes.length})

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 35%;">Index Name</th>
        <th style="text-align: left; width: 40%;">Columns</th>
        <th style="text-align: left;">Size</th>
    </tr>
${indexRows}
</table>

` : ''}${maintenanceRows.length > 0 ? `#### 🧹 Maintenance History

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left;">Operation</th>
        <th style="text-align: left;">Last Run</th>
        <th style="text-align: left;">Count</th>
    </tr>
${maintenanceRows.join('\n')}
</table>

` : ''}---`;

            const cells = [
                new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 CREATE TABLE Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    createTableScript,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🗑️ DROP TABLE Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop table (with dependencies)
DROP TABLE IF EXISTS ${item.schema}.${item.label} CASCADE;

-- Drop table (without dependencies - will fail if referenced)
-- DROP TABLE IF EXISTS ${item.schema}.${item.label} RESTRICT;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔍 Query Table Data`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Select all data
SELECT * FROM ${item.schema}.${item.label}
LIMIT 100;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📊 Detailed Statistics`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Table bloat and statistics
SELECT 
    schemaname,
    relname,
    n_live_tup,
    n_dead_tup,
    ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_tuple_percent,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = '${item.schema}' AND relname = '${item.label}';

-- Column statistics
SELECT 
    attname as column_name,
    n_distinct,
    ROUND((null_frac * 100)::numeric, 2) as null_percentage,
    avg_width,
    correlation
FROM pg_stats
WHERE schemaname = '${item.schema}' AND tablename = '${item.label}'
ORDER BY attname;`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
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

        const schema = item.schema!;

        const markdown = MarkdownUtils.header(`➕ Create New Table in Schema: \`${schema}\``) +
            MarkdownUtils.infoBox('This notebook provides templates for creating tables. Choose the template that best fits your use case.') +
            `\n\n#### 📋 Table Design Guidelines\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '<strong>Naming</strong>', description: 'Use snake_case for table names (e.g., user_accounts, order_items)' },
                { operation: '<strong>Primary Key</strong>', description: 'Every table should have a primary key. Use SERIAL/BIGSERIAL or UUID' },
                { operation: '<strong>Timestamps</strong>', description: 'Include created_at and updated_at for audit trails' },
                { operation: '<strong>Constraints</strong>', description: 'Add NOT NULL, UNIQUE, CHECK constraints to enforce data integrity' },
                { operation: '<strong>Foreign Keys</strong>', description: 'Reference related tables with ON DELETE/UPDATE actions' }
            ]) +
            `\n\n#### 🏷️ Common Data Types Reference\n\n` +
            MarkdownUtils.propertiesTable({
                'SERIAL / BIGSERIAL': 'Auto-incrementing integer (4/8 bytes)',
                'UUID': 'Universally unique identifier (use gen_random_uuid())',
                'VARCHAR(n) / TEXT': 'Variable-length character strings',
                'INTEGER / BIGINT': 'Whole numbers (4/8 bytes)',
                'NUMERIC(p,s)': 'Exact decimal numbers for money/precision',
                'BOOLEAN': 'true/false values',
                'TIMESTAMPTZ': 'Timestamp with timezone (recommended)',
                'DATE / TIME': 'Date or time only',
                'JSONB': 'Binary JSON for flexible schema data',
                'ARRAY': 'Array of any type (e.g., TEXT[], INTEGER[])'
            }) +
            MarkdownUtils.successBox('Use TIMESTAMPTZ instead of TIMESTAMP for timezone-aware applications.') +
            `

---`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 Basic Table (Recommended Start)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create basic table with common patterns
CREATE TABLE ${schema}.table_name (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Add table comment
COMMENT ON TABLE ${schema}.table_name IS 'Description of what this table stores';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔑 Table with UUID Primary Key`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Table using UUID as primary key (better for distributed systems)
CREATE TABLE ${schema}.table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔗 Table with Foreign Key References`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Table with foreign key relationships
CREATE TABLE ${schema}.order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES ${schema}.orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES ${schema}.products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on foreign key columns for better join performance
CREATE INDEX idx_order_items_order_id ON ${schema}.order_items(order_id);
CREATE INDEX idx_order_items_product_id ON ${schema}.order_items(product_id);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ⭐ Table with Unique Constraints`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Table with unique constraints
CREATE TABLE ${schema}.users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    username VARCHAR(50) NOT NULL,
    display_name VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraints
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_username_unique UNIQUE (username)
);

-- Partial unique index (unique only for non-deleted)
-- CREATE UNIQUE INDEX users_email_active_unique 
-- ON ${schema}.users(email) WHERE deleted_at IS NULL;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ✓ Table with CHECK Constraints`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Table with validation constraints
CREATE TABLE ${schema}.products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(50) NOT NULL UNIQUE,
    price NUMERIC(10,2) NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    weight_kg NUMERIC(6,3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Check constraints
    CONSTRAINT products_price_positive CHECK (price >= 0),
    CONSTRAINT products_stock_non_negative CHECK (stock_quantity >= 0),
    CONSTRAINT products_status_valid CHECK (status IN ('draft', 'active', 'discontinued', 'archived')),
    CONSTRAINT products_weight_positive CHECK (weight_kg IS NULL OR weight_kg > 0)
);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📄 Table with JSONB Column`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Table with JSONB for flexible/dynamic data
CREATE TABLE ${schema}.events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create GIN index for efficient JSONB queries
CREATE INDEX idx_events_payload ON ${schema}.events USING GIN (payload);

-- Query examples:
-- SELECT * FROM events WHERE payload->>'user_id' = '123';
-- SELECT * FROM events WHERE payload @> '{"status": "completed"}';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🕐 Table with Soft Delete Pattern`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Table with soft delete (keeps data, marks as deleted)
CREATE TABLE ${schema}.documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    created_by INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ  -- NULL = active, timestamp = deleted
);

-- Partial index for efficient queries on active records
CREATE INDEX idx_documents_active ON ${schema}.documents(created_at) 
WHERE deleted_at IS NULL;

-- View for only active documents
CREATE VIEW ${schema}.active_documents AS
SELECT * FROM ${schema}.documents WHERE deleted_at IS NULL;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📊 Table with Composite Primary Key`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Many-to-many junction table with composite key
CREATE TABLE ${schema}.user_roles (
    user_id INTEGER NOT NULL REFERENCES ${schema}.users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES ${schema}.roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by INTEGER REFERENCES ${schema}.users(id),
    
    -- Composite primary key
    PRIMARY KEY (user_id, role_id)
);

-- Indexes for reverse lookups
CREATE INDEX idx_user_roles_role_id ON ${schema}.user_roles(role_id);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📅 Partitioned Table (for large datasets)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Partitioned table by date range (for time-series data)
CREATE TABLE ${schema}.logs (
    id BIGSERIAL,
    log_level VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    context JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create partitions for each month
CREATE TABLE ${schema}.logs_2024_01 PARTITION OF ${schema}.logs
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
    
CREATE TABLE ${schema}.logs_2024_02 PARTITION OF ${schema}.logs
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Create index on partitioned table
CREATE INDEX idx_logs_created_at ON ${schema}.logs(created_at);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.warningBox('After creating a table, remember to: 1) Add appropriate indexes for query patterns, 2) Set up foreign key relationships, 3) Grant necessary permissions to roles.'),
                'markdown'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create table notebook');
    }
}
