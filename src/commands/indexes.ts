import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from './connection';
import {
    MarkdownUtils,
    FormatHelpers,
    ErrorHandlers,
    SQL_TEMPLATES,
    ObjectUtils,
    createSimpleNotebook
} from './helper';

/**
 * Show index properties in a notebook
 */
export async function showIndexProperties(treeItem: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(treeItem);
        const connection = await getConnectionWithPassword(treeItem.connectionId!);
        const client = await ConnectionManager.getInstance().getConnection({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            database: treeItem.databaseName!,
            name: connection.name
        });

        const schema = treeItem.schema!;
        const tableName = treeItem.tableName!;
        const indexName = treeItem.label;

        // Get detailed index information
        const result = await client.query(`
            SELECT 
                i.relname as index_name,
                ix.indisunique as is_unique,
                ix.indisprimary as is_primary,
                ix.indisclustered as is_clustered,
                ix.indisvalid as is_valid,
                ix.indisready as is_ready,
                ix.indislive as is_live,
                am.amname as access_method,
                pg_size_pretty(pg_relation_size(i.oid)) as index_size,
                pg_relation_size(i.oid) as index_size_bytes,
                pg_get_indexdef(ix.indexrelid) as index_definition,
                obj_description(i.oid) as comment,
                t.reltuples::bigint as estimated_rows,
                string_agg(a.attname, ', ' ORDER BY array_position(ix.indkey, a.attnum)) as columns
            FROM pg_index ix
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            WHERE i.relname = $1
                AND n.nspname = $2
                AND t.relname = $3
            GROUP BY i.relname, ix.indisunique, ix.indisprimary, ix.indisclustered, ix.indisvalid,
                     ix.indisready, ix.indislive, am.amname, i.oid, ix.indexrelid, t.reltuples
        `, [indexName, schema, tableName]);

        if (result.rows.length === 0) {
            vscode.window.showErrorMessage('Index not found');
            return;
        }

        const idx = result.rows[0];
        const metadata = createMetadata(connection, treeItem.databaseName);

        // Get index statistics - combining pg_stat and pg_statio views
        const statsResult = await client.query(`
            SELECT 
                s.idx_scan as scans,
                s.idx_tup_read as tuples_read,
                s.idx_tup_fetch as tuples_fetched,
                COALESCE(io.idx_blks_hit, 0) as cache_hits,
                COALESCE(io.idx_blks_read, 0) as disk_reads,
                CASE 
                    WHEN (COALESCE(io.idx_blks_hit, 0) + COALESCE(io.idx_blks_read, 0)) = 0 THEN 0
                    ELSE ROUND(100.0 * io.idx_blks_hit / (io.idx_blks_hit + io.idx_blks_read), 2)
                END as cache_hit_ratio
            FROM pg_stat_user_indexes s
            LEFT JOIN pg_statio_user_indexes io 
                ON s.indexrelid = io.indexrelid
            WHERE s.indexrelname = $1
                AND s.schemaname = $2
                AND s.relname = $3
        `, [indexName, schema, tableName]);

        const stats = statsResult.rows[0] || {};

        // Build index type icon
        const typeIcon = ObjectUtils.getIndexIcon(idx.is_primary, idx.is_unique);

        const attributes = [];
        if (idx.is_primary) attributes.push('🔑 PRIMARY KEY');
        if (idx.is_unique && !idx.is_primary) attributes.push('⭐ UNIQUE');
        if (idx.is_clustered) attributes.push('📍 CLUSTERED');
        if (!idx.is_valid) attributes.push('⚠️ INVALID');

        let markdown = MarkdownUtils.header(`${typeIcon} Index Properties: \`${idx.index_name}\``) +
            MarkdownUtils.infoBox(`Table: \`${schema}.${tableName}\``) +
            `\n\n#### 📊 Basic Information\n\n` +
            MarkdownUtils.propertiesTable({
                'Index Name': `<code>${idx.index_name}</code>`,
                'Access Method': `<code>${idx.access_method}</code>`,
                'Columns': `<code>${idx.columns}</code>`,
                'Index Size': `<code>${idx.index_size}</code>`,
                'Estimated Rows': idx.estimated_rows?.toLocaleString() || '—',
                'Valid': FormatHelpers.formatBoolean(idx.is_valid),
                'Ready': FormatHelpers.formatBoolean(idx.is_ready),
                'Live': FormatHelpers.formatBoolean(idx.is_live)
            });

        if (attributes.length > 0) {
            markdown += `\n\n#### 🏷️ Attributes\n\n${attributes.map(a => `- ${a}`).join('\n')}`;
        }

        markdown += `\n\n#### 🔧 Definition\n\n\`\`\`sql\n${idx.index_definition}\n\`\`\`\n\n`;
        markdown += `\n\n#### 📈 Usage Statistics\n\n` +
            MarkdownUtils.propertiesTable({
                'Index Scans': stats.scans?.toLocaleString() || '0',
                'Tuples Read': stats.tuples_read?.toLocaleString() || '0',
                'Tuples Fetched': stats.tuples_fetched?.toLocaleString() || '0',
                'Cache Hits': stats.cache_hits?.toLocaleString() || '0',
                'Disk Reads': stats.disk_reads?.toLocaleString() || '0',
                'Cache Hit Ratio': `${stats.cache_hit_ratio || '0'}%`
            });

        if (stats.scans === 0) {
            markdown += '\n\n⚠️ **Warning:** This index has never been used. Consider dropping it if not needed.\n';
        }

        if (idx.comment) {
            markdown += `\n\n#### 💬 Comment\n\n\`\`\`\n${idx.comment}\n\`\`\``;
        }

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔧 Recreate Index`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Recreate this index
${idx.index_definition};`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🗑️ Drop Index`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Drop this index
DROP INDEX "${schema}"."${indexName}";

-- Drop index concurrently (doesn't block writes)
-- DROP INDEX CONCURRENTLY "${schema}"."${indexName}";`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📖 Query Index Details`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- View index details
SELECT * FROM pg_indexes 
WHERE indexname = '${indexName}' 
    AND schemaname = '${schema}';`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'show index properties');
    }
}

/**
 * Copy index name to clipboard
 */
export async function copyIndexName(treeItem: DatabaseTreeItem): Promise<void> {
    const indexName = treeItem.label;
    await vscode.env.clipboard.writeText(indexName);
    vscode.window.showInformationMessage(`Copied: ${indexName}`);
}

/**
 * Generate DROP INDEX script
 */
export async function generateDropIndexScript(treeItem: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(treeItem);
        const connection = await getConnectionWithPassword(treeItem.connectionId!);
        const metadata = createMetadata(connection, treeItem.databaseName);

        const schema = treeItem.schema!;
        const indexName = treeItem.label.replace(/^[🔑⭐🔍]\s+/, '');

        const markdown = MarkdownUtils.header(`🗑️ Drop Index: \`${indexName}\``) +
            MarkdownUtils.dangerBox('This will permanently remove the index. Query performance may be affected.') +
            MarkdownUtils.infoBox(`Schema: \`${schema}\``);

        const sql = `${SQL_TEMPLATES.DROP.INDEX(schema, indexName)}

-- Drop index concurrently (doesn't block writes)
-- DROP INDEX CONCURRENTLY "${schema}"."${indexName}";`;

        await createSimpleNotebook(treeItem, 'Drop Index', sql, markdown);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate drop index script');
    }
}

/**
 * Generate REINDEX script
 */
export async function generateReindexScript(treeItem: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(treeItem);
        const connection = await getConnectionWithPassword(treeItem.connectionId!);
        const metadata = createMetadata(connection, treeItem.databaseName);

        const schema = treeItem.schema!;
        const tableName = treeItem.tableName!;
        const indexName = treeItem.label;

        const markdown = MarkdownUtils.header(`🔄 Reindex: \`${indexName}\``) +
            MarkdownUtils.warningBox('Reindexing will lock the table unless done concurrently.') +
            MarkdownUtils.infoBox(`Schema: \`${schema}\` | Table: \`${tableName}\``);

        const sql = `-- Reindex (locks the table)
REINDEX INDEX "${schema}"."${indexName}";

-- Reindex concurrently (doesn't block writes, requires PostgreSQL 12+)
-- REINDEX INDEX CONCURRENTLY "${schema}"."${indexName}";`;

        await createSimpleNotebook(treeItem, 'Reindex', sql, markdown);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate reindex script');
    }
}

/**
 * Generate CREATE INDEX template script
 */
export async function generateCreateIndexScript(treeItem: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(treeItem);
        const connection = await getConnectionWithPassword(treeItem.connectionId!);
        const metadata = createMetadata(connection, treeItem.databaseName);

        const schema = treeItem.schema!;
        const tableName = treeItem.tableName!;

        const markdown = MarkdownUtils.header('📐 Create Index Templates') +
            MarkdownUtils.infoBox(`Schema: \`${schema}\` | Table: \`${tableName}\``) +
            MarkdownUtils.successBox('Choose the index type that best fits your query patterns.');

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                markdown,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create Basic B-tree Index
CREATE INDEX idx_${tableName}_column_name 
ON "${schema}"."${tableName}" (column_name);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create Unique Index
CREATE UNIQUE INDEX idx_${tableName}_column_name_unique 
ON "${schema}"."${tableName}" (column_name);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create Partial Index (with WHERE clause)
CREATE INDEX idx_${tableName}_column_name_partial 
ON "${schema}"."${tableName}" (column_name)
WHERE column_name IS NOT NULL;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create Composite Index (multiple columns)
CREATE INDEX idx_${tableName}_composite 
ON "${schema}"."${tableName}" (column1, column2, column3);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create Index Concurrently (doesn't block writes)
CREATE INDEX CONCURRENTLY idx_${tableName}_concurrent 
ON "${schema}"."${tableName}" (column_name);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create GIN Index (for arrays, JSONB, full-text search)
CREATE INDEX idx_${tableName}_gin 
ON "${schema}"."${tableName}" USING GIN (jsonb_column);`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate create index script');
    }
}

/**
 * Analyze index usage
 */
export async function analyzeIndexUsage(treeItem: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(treeItem);
        const connection = await getConnectionWithPassword(treeItem.connectionId!);
        const metadata = createMetadata(connection, treeItem.databaseName);

        const schema = treeItem.schema!;
        const tableName = treeItem.tableName!;
        const indexName = treeItem.label;

        const markdown = MarkdownUtils.header(`📊 Index Usage Analysis: \`${indexName}\``) +
            MarkdownUtils.infoBox(`Schema: \`${schema}\` | Table: \`${tableName}\``);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                markdown,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Index Usage Statistics
SELECT 
    schemaname,
    relname,
    indexrelid,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) as size,
    CASE 
        WHEN idx_scan = 0 THEN 'UNUSED'
        WHEN idx_scan < 100 THEN 'RARELY USED'
        WHEN idx_scan < 1000 THEN 'MODERATELY USED'
        ELSE 'HEAVILY USED'
    END as usage_level
FROM pg_stat_user_indexes
WHERE indexrelid = (
        SELECT oid FROM pg_class WHERE relname='${indexName}'
    )
    AND schemaname = '${schema}'
    AND relname = '${tableName}';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Compare with table scans
SELECT 
    'Index Scans' as scan_type,  
    idx_scan as count
FROM pg_stat_user_indexes
WHERE indexrelname = '${indexName}'
    AND schemaname = '${schema}'
UNION ALL
SELECT 
    'Sequential Scans' as scan_type,
    seq_scan as count
FROM pg_stat_user_tables
WHERE schemaname = '${schema}'
    AND relname = '${tableName}';`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'analyze index usage');
    }
}

/**
 * Generate ALTER INDEX script
 */
export async function generateAlterIndexScript(treeItem: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(treeItem);
        const connection = await getConnectionWithPassword(treeItem.connectionId!);
        const metadata = createMetadata(connection, treeItem.databaseName);

        const schema = treeItem.schema!;
        const indexName = treeItem.label;

        const markdown = MarkdownUtils.header(`✏️ Alter Index: \`${indexName}\``) +
            MarkdownUtils.infoBox(`Schema: \`${schema}\``);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                markdown,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Rename Index
ALTER INDEX "${schema}"."${indexName}" 
RENAME TO "${indexName}_new";`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Set Storage Parameters
ALTER INDEX "${schema}"."${indexName}" 
SET (fillfactor = 90);`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate alter index script');
    }
}

/**
 * Add comment to index
 */
export async function addIndexComment(treeItem: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(treeItem);
        const connection = await getConnectionWithPassword(treeItem.connectionId!);
        const metadata = createMetadata(connection, treeItem.databaseName);

        const schema = treeItem.schema!;
        const indexName = treeItem.label;

        const markdown = MarkdownUtils.header(`💬 Add Comment to Index: \`${indexName}\``) +
            MarkdownUtils.infoBox(`Schema: \`${schema}\``);

        const sql = `-- Add or update comment on index
COMMENT ON INDEX "${schema}"."${indexName}" 
IS 'Your comment here describing the purpose of this index';`;

        await createSimpleNotebook(treeItem, 'Add Index Comment', sql, markdown);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'add index comment');
    }
}

/**
 * Alias for generateCreateIndexScript to match extension.ts import
 */
export { generateCreateIndexScript as generateScriptCreate };

/**
 * Show index operations notebook
 */
export async function cmdIndexOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const schema = item.schema!;
        const indexName = item.label;

        const operationsMarkdown = MarkdownUtils.header(`🔧 Index Operations: \`${indexName}\``) +
            MarkdownUtils.infoBox('This notebook provides common operations for managing your index. Each cell is a ready-to-execute template.') +
            `\n\n#### 🎯 Available Operations\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '🔍 <strong>Properties</strong>', description: 'View index definition and stats', riskLevel: '✅ Safe' },
                { operation: '📊 <strong>Analyze</strong>', description: 'Check usage statistics', riskLevel: '✅ Safe' },
                { operation: '🔄 <strong>Reindex</strong>', description: 'Rebuild the index', riskLevel: '⚠️ Locks Table' },
                { operation: '✏️ <strong>Alter</strong>', description: 'Rename or change settings', riskLevel: '⚠️ Modifies Schema' },
                { operation: '❌ <strong>Drop</strong>', description: 'Remove the index', riskLevel: '🔴 Destructive' }
            ]) + `\n---`;

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                operationsMarkdown,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔍 Index Definition`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- View index definition
SELECT pg_get_indexdef(indexrelid) as index_def
FROM pg_stat_user_indexes
WHERE indexrelname = '${indexName}'
AND schemaname = '${schema}';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📊 Analyze Usage`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Check index usage
SELECT 
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE indexrelname = '${indexName}'
AND schemaname = '${schema}';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔄 Reindex`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Reindex (locks table)
REINDEX INDEX "${schema}"."${indexName}";

-- Reindex concurrently (PostgreSQL 12+)
-- REINDEX INDEX CONCURRENTLY "${schema}"."${indexName}";`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ❌ Drop Index`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Drop index
DROP INDEX "${schema}"."${indexName}";

-- Drop concurrently
-- DROP INDEX CONCURRENTLY "${schema}"."${indexName}";`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'show index operations');
    }
}

/**
 * Add new index to table - generates a comprehensive notebook with guidelines and SQL templates
 */
export async function cmdAddIndex(item: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const schema = item.schema!;
        const tableName = item.tableName!;

        const markdown = MarkdownUtils.header(`➕ Add New Index to \`${schema}.${tableName}\``) +
            MarkdownUtils.infoBox('Indexes improve query performance by providing fast lookup paths. Choose the right index type for your use case.') +
            `\n\n#### 📋 Index Types Overview\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '🔍 <strong>B-tree</strong>', description: 'Default. Best for equality and range queries (=, <, >, BETWEEN).' },
                { operation: '📚 <strong>Hash</strong>', description: 'Equality comparisons only (=). Faster for exact matches.' },
                { operation: '🔎 <strong>GiST</strong>', description: 'Generalized. Good for geometric, full-text, and range types.' },
                { operation: '📖 <strong>GIN</strong>', description: 'Inverted index. Best for arrays, JSONB, and full-text search.' },
                { operation: '🔤 <strong>BRIN</strong>', description: 'Block Range. Very efficient for large, naturally ordered tables.' }
            ]) +
            `\n\n#### ⚡ Best Practices\n\n` +
            MarkdownUtils.propertiesTable({
                'WHERE clauses': 'Index columns frequently used in WHERE conditions',
                'JOIN columns': 'Index foreign keys and join columns',
                'ORDER BY': 'Index columns used for sorting',
                'Partial Index': 'Use WHERE clause to index subset of rows',
                'Expression Index': 'Index computed expressions (e.g., LOWER(email))',
                'Concurrently': 'Use CONCURRENTLY to avoid locking in production'
            }) +
            MarkdownUtils.warningBox('Too many indexes slow down INSERT/UPDATE/DELETE. Only create indexes for frequent queries.') +
            `

---`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔍 Basic B-tree Index (Most Common)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create basic B-tree index
CREATE INDEX idx_${tableName}_column_name 
ON "${schema}"."${tableName}" (column_name);

-- Create index concurrently (doesn't block writes)
-- CREATE INDEX CONCURRENTLY idx_${tableName}_column_name 
-- ON "${schema}"."${tableName}" (column_name);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ⭐ Unique Index`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create unique index (enforces uniqueness)
CREATE UNIQUE INDEX idx_${tableName}_unique_column 
ON "${schema}"."${tableName}" (column_name);

-- Unique index on multiple columns
-- CREATE UNIQUE INDEX idx_${tableName}_multi_unique 
-- ON "${schema}"."${tableName}" (col1, col2);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📊 Composite Index (Multiple Columns)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Composite index (column order matters!)
-- Place most selective columns first
CREATE INDEX idx_${tableName}_composite 
ON "${schema}"."${tableName}" (status, created_at, user_id);

-- Good for queries like:
-- WHERE status = 'active' AND created_at > '2024-01-01'`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📍 Partial Index (WHERE clause)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Partial index - only indexes rows matching condition
-- Smaller and faster than full index
CREATE INDEX idx_${tableName}_active_only 
ON "${schema}"."${tableName}" (created_at)
WHERE status = 'active';

-- Index only non-null values
-- CREATE INDEX idx_${tableName}_not_null 
-- ON "${schema}"."${tableName}" (email)
-- WHERE email IS NOT NULL;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔤 Expression Index`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Index on expression (for case-insensitive search)
CREATE INDEX idx_${tableName}_lower_email 
ON "${schema}"."${tableName}" (LOWER(email));

-- Date extraction
-- CREATE INDEX idx_${tableName}_year 
-- ON "${schema}"."${tableName}" (EXTRACT(YEAR FROM created_at));`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📖 GIN Index (for JSONB, Arrays, Full-Text)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- GIN index for JSONB column
CREATE INDEX idx_${tableName}_jsonb_gin 
ON "${schema}"."${tableName}" USING GIN (data);

-- GIN index for JSONB with specific operators
-- CREATE INDEX idx_${tableName}_jsonb_path 
-- ON "${schema}"."${tableName}" USING GIN (data jsonb_path_ops);

-- For array columns
-- CREATE INDEX idx_${tableName}_tags 
-- ON "${schema}"."${tableName}" USING GIN (tags);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔎 Full-Text Search Index`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Full-text search index
CREATE INDEX idx_${tableName}_fts 
ON "${schema}"."${tableName}" 
USING GIN (to_tsvector('english', title || ' ' || description));

-- Usage: 
-- SELECT * FROM ${tableName} 
-- WHERE to_tsvector('english', title || ' ' || description) @@ to_tsquery('search_term');`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔤 BRIN Index (for large, ordered tables)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- BRIN index - very compact, good for time-series data
-- Works best when data is naturally ordered by the indexed column
CREATE INDEX idx_${tableName}_brin 
ON "${schema}"."${tableName}" USING BRIN (created_at);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📈 Covering Index (INCLUDE columns)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Covering index with INCLUDE (PostgreSQL 11+)
-- Includes additional columns in the index for index-only scans
CREATE INDEX idx_${tableName}_covering 
ON "${schema}"."${tableName}" (user_id)
INCLUDE (username, email);

-- Useful for: SELECT username, email FROM ${tableName} WHERE user_id = 123;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.successBox('After creating an index, use EXPLAIN ANALYZE to verify it is being used by your queries.'),
                'markdown'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'add index');
    }
}
