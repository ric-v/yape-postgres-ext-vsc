import * as vscode from 'vscode';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from '../commands/connection';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { ConnectionManager } from '../services/ConnectionManager';

/**
 * SQL Queries for materialized view operations
 */

/**
 * MATVIEW_INFO_QUERY - Query to get materialized view details
 * fetches - definition, schema, name, owner, tablespace, indexes, populated status
 * from pg_matviews table
 */
const MATVIEW_INFO_QUERY = `
SELECT pg_get_viewdef($1::regclass, true) as definition,
       schemaname,
       matviewname,
       matviewowner,
       tablespace,
       hasindexes,
       ispopulated,
       pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, matviewname))) as size
FROM pg_matviews
WHERE schemaname = $2 AND matviewname = $3`;

/**
 * MATVIEW_DEF_QUERY - Query to get materialized view definition
 */
const MATVIEW_DEF_QUERY = `
SELECT pg_get_viewdef($1::regclass, true) as definition
FROM pg_matviews
WHERE schemaname = $2 AND matviewname = $3`;

export async function cmdRefreshMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Refresh Materialized View: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Execute the cell below to refresh the materialized view data.
</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔄 Refresh Command`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `REFRESH MATERIALIZED VIEW ${item.schema}.${item.label};`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create refresh materialized view notebook: ${err.message}`);
    }
}

export async function cmdEditMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const result = await client.query(MATVIEW_DEF_QUERY, [`${item.schema}.${item.label}`, item.schema, item.label]);
            if (!result.rows[0]?.definition) {
                throw new Error('Materialized view definition not found');
            }

            const viewDef = (result.rows[0].definition || '').replace(/;\s*$/, '');
            const createMatViewStatement = `CREATE MATERIALIZED VIEW ${item.schema}.${item.label} AS\n${viewDef}\nWITH DATA;`;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Edit Materialized View: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the materialized view definition below and execute the cell to update it.
</div>

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>⚠️ Warning:</strong> This will drop and recreate the materialized view.
</div>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 View Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};\n\n${createMatViewStatement}\nWITH DATA;`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create materialized view edit notebook: ${err.message}`);
    }
}

export async function cmdViewMatViewData(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### View Data: \`${item.schema}.${item.label}\`

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
                `SELECT *
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

export async function cmdViewMatViewProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            // Gather comprehensive materialized view information
            const [matviewInfo, columnInfo, indexInfo, dependenciesInfo, referencedInfo, statsInfo] = await Promise.all([
                // Basic materialized view info
                client.query(`
                    SELECT 
                        c.relname as matview_name,
                        n.nspname as schema_name,
                        pg_get_userbyid(c.relowner) as owner,
                        obj_description(c.oid) as comment,
                        c.reltuples::bigint as row_estimate,
                        pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
                        pg_size_pretty(pg_relation_size(c.oid)) as table_size,
                        pg_size_pretty(pg_indexes_size(c.oid)) as indexes_size,
                        mv.ispopulated
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    LEFT JOIN pg_matviews mv ON mv.schemaname = n.nspname AND mv.matviewname = c.relname
                    WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'm'
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
                        ordinal_position,
                        col_description((table_schema||'.'||table_name)::regclass::oid, ordinal_position) as description
                    FROM information_schema.columns
                    WHERE table_schema = $1 AND table_name = $2
                    ORDER BY ordinal_position
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
                
                // Dependent objects
                client.query(`
                    SELECT DISTINCT
                        dependent_ns.nspname as schema,
                        dependent_view.relname as name,
                        dependent_view.relkind as kind
                    FROM pg_depend 
                    JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid 
                    JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid 
                    JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
                    WHERE pg_depend.refobjid = $1::regclass
                    AND dependent_view.relname != $2
                    ORDER BY schema, name
                `, [`${item.schema}.${item.label}`, item.label]),
                
                // Referenced objects
                client.query(`
                    SELECT DISTINCT
                        ref_nsp.nspname as schema,
                        ref_class.relname as name,
                        ref_class.relkind as kind
                    FROM pg_depend dep
                    JOIN pg_rewrite rew ON dep.objid = rew.oid
                    JOIN pg_class ref_class ON dep.refobjid = ref_class.oid
                    JOIN pg_namespace ref_nsp ON ref_nsp.oid = ref_class.relnamespace
                    WHERE rew.ev_class = $1::regclass
                    AND ref_class.relname != $2
                    AND ref_class.relkind IN ('r', 'v', 'm')
                    ORDER BY schema, name
                `, [`${item.schema}.${item.label}`, item.label]),
                
                // Statistics
                client.query(`
                    SELECT 
                        n_live_tup as live_tuples,
                        n_dead_tup as dead_tuples,
                        last_vacuum,
                        last_autovacuum,
                        last_analyze,
                        last_autoanalyze
                    FROM pg_stat_user_tables
                    WHERE schemaname = $1 AND relname = $2
                `, [item.schema, item.label])
            ]);

            if (matviewInfo.rows.length === 0) {
                throw new Error('Materialized view not found');
            }

            const matview = matviewInfo.rows[0];
            const columns = columnInfo.rows;
            const indexes = indexInfo.rows;
            const dependents = dependenciesInfo.rows;
            const references = referencedInfo.rows;
            const stats = statsInfo.rows[0] || {};

            // Get definition
            const viewDefResult = await client.query(`SELECT pg_get_viewdef($1::regclass, true) as definition`, [`${item.schema}.${item.label}`]);
            const viewDefinition = (viewDefResult.rows[0]?.definition || '').replace(/;\s*$/, '');

            const metadata = createMetadata(connection, item.databaseName);

            const getKindLabel = (kind: string) => {
                switch (kind) {
                    case 'r': return '📊 Table';
                    case 'v': return '👁️ View';
                    case 'm': return '💾 Materialized View';
                    default: return kind;
                }
            };

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
        <td>${col.default_value ? `<code>${col.default_value}</code>` : '—'}</td>
        <td>${col.description || '—'}</td>
    </tr>`;
            }).join('\n');

            // Build indexes table HTML
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

            // Build dependencies table HTML
            const dependencyRows = dependents.map(dep => {
                return `    <tr>
        <td>${getKindLabel(dep.kind)}</td>
        <td><code>${dep.schema}.${dep.name}</code></td>
    </tr>`;
            }).join('\n');

            // Build references table HTML
            const referenceRows = references.map(ref => {
                return `    <tr>
        <td>${getKindLabel(ref.kind)}</td>
        <td><code>${ref.schema}.${ref.name}</code></td>
    </tr>`;
            }).join('\n');

            const markdown = `### 💾 Materialized View Properties: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Owner:</strong> ${matview.owner} | <strong>Populated:</strong> ${matview.ispopulated ? '✅ Yes' : '🚫 No'} ${matview.comment ? `| <strong>Comment:</strong> ${matview.comment}` : ''}
</div>

#### 📊 General Information

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left; width: 30%;">Property</th><th style="text-align: left;">Value</th></tr>
    <tr><td><strong>Schema</strong></td><td>${matview.schema_name}</td></tr>
    <tr><td><strong>Name</strong></td><td>${matview.matview_name}</td></tr>
    <tr><td><strong>Owner</strong></td><td>${matview.owner}</td></tr>
    <tr><td><strong>Is Populated</strong></td><td>${matview.ispopulated ? '✅ Yes' : '🚫 No'}</td></tr>
    <tr><td><strong>Total Size</strong></td><td>${matview.total_size}</td></tr>
    <tr><td><strong>Table Size</strong></td><td>${matview.table_size}</td></tr>
    <tr><td><strong>Indexes Size</strong></td><td>${matview.indexes_size}</td></tr>
    <tr><td><strong>Row Estimate</strong></td><td>${matview.row_estimate?.toLocaleString() || 'N/A'}</td></tr>
    <tr><td><strong>Live Tuples</strong></td><td>${stats.live_tuples?.toLocaleString() || 'N/A'}</td></tr>
    <tr><td><strong>Dead Tuples</strong></td><td>${stats.dead_tuples?.toLocaleString() || 'N/A'}</td></tr>
</table>

#### 📋 Columns (${columns.length})

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 5%;">#</th>
        <th style="text-align: left; width: 20%;">Name</th>
        <th style="text-align: left; width: 20%;">Data Type</th>
        <th style="text-align: left; width: 10%;">Nullable</th>
        <th style="text-align: left; width: 20%;">Default</th>
        <th style="text-align: left;">Description</th>
    </tr>
${columnRows}
</table>

${indexes.length > 0 ? `#### 🔍 Indexes (${indexes.length})

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 35%;">Index Name</th>
        <th style="text-align: left; width: 40%;">Columns</th>
        <th style="text-align: left;">Size</th>
    </tr>
${indexRows}
</table>

` : ''}${references.length > 0 ? `#### 🔗 Referenced Objects (${references.length})

<div style="font-size: 11px; background-color: #2d3a42; border-left: 3px solid #9b59b6; padding: 6px 10px; margin-bottom: 10px; border-radius: 3px;">
    Objects that this materialized view depends on:
</div>

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 20%;">Type</th>
        <th style="text-align: left;">Object</th>
    </tr>
${referenceRows}
</table>

` : ''}${dependents.length > 0 ? `#### 🔄 Dependent Objects (${dependents.length})

<div style="font-size: 11px; background-color: #3a2d42; border-left: 3px solid #e67e22; padding: 6px 10px; margin-bottom: 10px; border-radius: 3px;">
    Objects that depend on this materialized view:
</div>

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 20%;">Type</th>
        <th style="text-align: left;">Object</th>
    </tr>
${dependencyRows}
</table>

` : ''}---`;

            const cells = [
                new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 CREATE MATERIALIZED VIEW Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};\n\nCREATE MATERIALIZED VIEW ${item.schema}.${item.label} AS\n${viewDefinition}\nWITH DATA;\n\n-- Materialized view comment\n${matview.comment ? `COMMENT ON MATERIALIZED VIEW ${item.schema}.${item.label} IS '${matview.comment.replace(/'/g, "''")}';` : `-- COMMENT ON MATERIALIZED VIEW ${item.schema}.${item.label} IS 'view description';`}\n\n-- Indexes\n${indexes.map(idx => idx.definition).join('\n')}`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔄 Refresh Materialized View`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Refresh materialized view (blocking)\nREFRESH MATERIALIZED VIEW ${item.schema}.${item.label};\n\n-- Refresh materialized view (concurrent, allows reads during refresh)\n-- REFRESH MATERIALIZED VIEW CONCURRENTLY ${item.schema}.${item.label};`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🗑️ DROP Materialized View Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop materialized view (with dependencies)\nDROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label} CASCADE;\n\n-- Drop materialized view (without dependencies - will fail if referenced)\n-- DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label} RESTRICT;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔍 Query Materialized View Data`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Query materialized view data\nSELECT * FROM ${item.schema}.${item.label}\nLIMIT 100;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📊 Statistics and Metadata`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Get detailed statistics\nSELECT \n    schemaname,\n    matviewname,\n    matviewowner,\n    tablespace,\n    hasindexes,\n    ispopulated,\n    pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as total_size\nFROM pg_matviews\nWHERE schemaname = '${item.schema}' AND matviewname = '${item.label}';\n\n-- Check when it was last refreshed\nSELECT \n    schemaname,\n    relname,\n    last_vacuum,\n    last_autovacuum,\n    last_analyze,\n    last_autoanalyze,\n    n_live_tup,\n    n_dead_tup\nFROM pg_stat_user_tables\nWHERE schemaname = '${item.schema}' AND relname = '${item.label}';`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to show materialized view properties: ${err.message}`);
    }
}

export async function cmdDropMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Drop Materialized View: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>🛑 Caution:</strong> This action will permanently delete the materialized view. This operation cannot be undone.
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
                `-- Drop materialized view
DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create drop materialized view notebook: ${err.message}`);
    }
}

export async function cmdMatViewOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const markdown = `### 🔄 Materialized View Operations: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 8px 12px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ About Materialized Views:</strong> Materialized views store query results as physical tables that need periodic refreshing. They provide faster query performance at the cost of data freshness.
</div>

#### 📋 Common Operations

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 25%;">Operation</th>
        <th style="text-align: left; width: 50%;">Description</th>
        <th style="text-align: left;">Use Case</th>
    </tr>
    <tr>
        <td><strong>🔄 Refresh</strong></td>
        <td>Updates the materialized view with fresh data from underlying tables. Locks the view during refresh.</td>
        <td>Standard data refresh</td>
    </tr>
    <tr>
        <td><strong>⚡ Concurrent Refresh</strong></td>
        <td>Refreshes without locking (requires unique index). Allows reads during refresh.</td>
        <td>High-availability scenarios</td>
    </tr>
    <tr>
        <td><strong>🔍 Create Index</strong></td>
        <td>Adds indexes to improve query performance on the materialized view.</td>
        <td>Query optimization</td>
    </tr>
    <tr>
        <td><strong>📊 Analyze</strong></td>
        <td>Updates statistics for the query planner to optimize query execution.</td>
        <td>After large refreshes</td>
    </tr>
    <tr>
        <td><strong>🔍 Query Data</strong></td>
        <td>Query the materialized view data like a regular table.</td>
        <td>Data analysis</td>
    </tr>
    <tr>
        <td><strong>📈 Check Freshness</strong></td>
        <td>View when the materialized view was last refreshed.</td>
        <td>Monitoring data staleness</td>
    </tr>
</table>

---`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔄 Standard Refresh\n\n<div style="font-size: 11px; background-color: #2d3842; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 8px; border-radius: 3px;">\n    <strong>⚠️ Warning:</strong> This operation locks the materialized view and prevents reads during refresh.\n</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Refresh materialized view (blocking operation)\nREFRESH MATERIALIZED VIEW ${item.schema}.${item.label};\n\n-- Alternative: Truncate and rebuild\nREFRESH MATERIALIZED VIEW ${item.schema}.${item.label} WITH DATA;\n\n-- Clear data without dropping structure\nREFRESH MATERIALIZED VIEW ${item.schema}.${item.label} WITH NO DATA;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ⚡ Concurrent Refresh\n\n<div style="font-size: 11px; background-color: #2d3842; border-left: 3px solid #f39c12; padding: 6px 10px; margin-bottom: 8px; border-radius: 3px;">\n    <strong>📝 Note:</strong> Requires a unique index. Allows queries during refresh but is slower than standard refresh.\n</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Concurrent refresh (non-blocking, requires unique index)\nREFRESH MATERIALIZED VIEW CONCURRENTLY ${item.schema}.${item.label};\n\n-- First, ensure you have a unique index\n-- Example:\n-- CREATE UNIQUE INDEX ${item.label}_unique_idx ON ${item.schema}.${item.label} (id);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔍 Create Indexes\n\n<div style="font-size: 11px; background-color: #2d3842; border-left: 3px solid #2ecc71; padding: 6px 10px; margin-bottom: 8px; border-radius: 3px;">\n    <strong>💡 Tip:</strong> Indexes on materialized views improve query performance, just like on regular tables.\n</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create a unique index (enables concurrent refresh)\nCREATE UNIQUE INDEX ${item.label}_unique_idx \n    ON ${item.schema}.${item.label} (id);\n\n-- Create a regular B-tree index\nCREATE INDEX ${item.label}_column_idx \n    ON ${item.schema}.${item.label} (column_name);\n\n-- Create a multi-column index\nCREATE INDEX ${item.label}_multi_idx \n    ON ${item.schema}.${item.label} (col1, col2);\n\n-- Create a partial index (with WHERE clause)\nCREATE INDEX ${item.label}_partial_idx \n    ON ${item.schema}.${item.label} (status)\n    WHERE status = 'active';\n\n-- Create a GiST index (for spatial/full-text data)\nCREATE INDEX ${item.label}_gist_idx \n    ON ${item.schema}.${item.label} USING GIST (column_name);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📊 Update Statistics`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Update query planner statistics\nANALYZE ${item.schema}.${item.label};\n\n-- Analyze specific columns\nANALYZE ${item.schema}.${item.label} (column1, column2);\n\n-- Verbose analyze (shows detailed output)\nANALYZE VERBOSE ${item.schema}.${item.label};`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔍 Query Data`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Query materialized view data\nSELECT * FROM ${item.schema}.${item.label}\nLIMIT 100;\n\n-- Count rows\nSELECT COUNT(*) as row_count\nFROM ${item.schema}.${item.label};\n\n-- Get column statistics\nSELECT column_name, data_type, is_nullable\nFROM information_schema.columns\nWHERE table_schema = '${item.schema}' \n  AND table_name = '${item.label}'\nORDER BY ordinal_position;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📈 Monitor Freshness and Performance`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Check when materialized view was last refreshed\nSELECT \n    schemaname,\n    matviewname,\n    matviewowner,\n    tablespace,\n    hasindexes,\n    ispopulated,\n    pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as total_size\nFROM pg_matviews\nWHERE schemaname = '${item.schema}' AND matviewname = '${item.label}';\n\n-- Check statistics and last maintenance\nSELECT \n    schemaname,\n    tablename,\n    last_vacuum,\n    last_autovacuum,\n    last_analyze,\n    last_autoanalyze,\n    n_live_tup as live_rows,\n    n_dead_tup as dead_rows\nFROM pg_stat_user_tables\nWHERE schemaname = '${item.schema}' AND tablename = '${item.label}';\n\n-- View all indexes on the materialized view\nSELECT \n    indexname,\n    indexdef,\n    pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size\nFROM pg_indexes\nWHERE schemaname = '${item.schema}' AND tablename = '${item.label}'\nORDER BY indexname;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔧 Advanced Operations`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Change materialized view owner\nALTER MATERIALIZED VIEW ${item.schema}.${item.label} OWNER TO new_owner;\n\n-- Rename materialized view\nALTER MATERIALIZED VIEW ${item.schema}.${item.label} RENAME TO new_name;\n\n-- Move to different schema\nALTER MATERIALIZED VIEW ${item.schema}.${item.label} SET SCHEMA new_schema;\n\n-- Change tablespace\nALTER MATERIALIZED VIEW ${item.schema}.${item.label} SET TABLESPACE new_tablespace;\n\n-- Add comment\nCOMMENT ON MATERIALIZED VIEW ${item.schema}.${item.label} IS 'Description of the materialized view';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📚 Best Practices\n\n<div style="font-size: 11px; background-color: #2d3842; border-left: 3px solid #9b59b6; padding: 8px 12px; margin-top: 8px; border-radius: 3px;\">\n    <strong>✨ Refresh Strategy:</strong>\n    <ul style=\"margin: 5px 0;\">\n        <li>Use <code>REFRESH MATERIALIZED VIEW CONCURRENTLY</code> for high-availability scenarios (requires unique index)</li>\n        <li>Schedule regular refreshes based on data freshness requirements</li>\n        <li>Run <code>ANALYZE</code> after large refreshes to update statistics</li>\n        <li>Monitor materialized view size and query performance</li>\n        <li>Consider partitioning for very large materialized views</li>\n    </ul>\n</div>`,
                'markdown'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to show materialized view operations: ${err.message}`);
    }
}

/**
 * cmdCreateMaterializedView - Command to create a new materialized view in the database.
 */
export async function cmdCreateMaterializedView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Create New Materialized View in Schema: \`${item.schema}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the definition below and execute the cell to create the materialized view.
</div>`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 Materialized View Definition`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create new materialized view
CREATE MATERIALIZED VIEW ${item.schema}.matview_name AS
SELECT 
    column1, 
    column2
FROM source_table
WHERE condition = true
WITH DATA;

-- Add unique index (recommended, enables concurrent refresh)
CREATE UNIQUE INDEX idx_matview_name_column1 ON ${item.schema}.matview_name (column1);

-- Add comment
COMMENT ON MATERIALIZED VIEW ${item.schema}.matview_name IS 'Materialized view description';`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create materialized view notebook: ${err.message}`);
    }
}