import * as vscode from 'vscode';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from '../commands/connection';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { ConnectionManager } from '../services/ConnectionManager';
import { TablePropertiesPanel } from '../tableProperties';

/**
 * SQL query to get the view definition from PostgreSQL.
 */

/**
 * VIEW_DEFINITION_QUERY - SQL query to get the view definition from PostgreSQL.
 * fetches - the view definition from the database.
 */
const VIEW_DEFINITION_QUERY = `SELECT pg_get_viewdef($1:: regclass, true) as definition`;

/**
 * COLUMN_INFO_QUERY - SQL query to get column information for a view
 */
const COLUMN_INFO_QUERY = `
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = $1
AND table_name = $2
ORDER BY ordinal_position`;

/**
 * createSimpleNotebook - Helper function to create a simple notebook with markdown and SQL cells
 */
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

/**
 * cmdScriptSelect - Command to generate a SELECT script for a view
 */
export async function cmdScriptSelect(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    const markdown = `### 📖 SELECT Script: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Execute the query below to retrieve data from the view.
</div>`;
    await createSimpleNotebook(item, 'SELECT Script', `SELECT * FROM ${item.schema}.${item.label} LIMIT 100;`, markdown);
}

/**
 * cmdScriptCreate - Command to generate a CREATE script for a view
 */
export async function cmdScriptCreate(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    await cmdEditView(item, context);
}

/**
 * viewEditCmd - Command to edit a PostgreSQL view in a notebook.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdEditView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const viewResult = await client.query(VIEW_DEFINITION_QUERY, [`${item.schema}.${item.label} `]);
            if (!viewResult.rows[0]?.definition) {
                throw new Error('View definition not found');
            }

            const createViewStatement = `CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS\n${viewResult.rows[0].definition} `;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### Edit View: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the view definition below and execute the cell to update the view.
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
                    createViewStatement,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create view edit notebook: ${err.message} `);
    }
}

/**
 * viewViewDataCmd - Command to view data from a PostgreSQL view in a notebook.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdViewData(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
                `-- View data
SELECT *
    FROM ${item.schema}.${item.label}
LIMIT 100; `,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create view data notebook: ${err.message} `);
    }
}

/**
 * viewDropCmd - Command to drop a PostgreSQL view in a notebook.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdDropView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Drop View: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>🛑 Caution:</strong> This action will permanently delete the view. This operation cannot be undone.
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
                `-- Drop view
DROP VIEW IF EXISTS ${item.schema}.${item.label}; `,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create drop view notebook: ${err.message} `);
    }
}

/**
 * viewOperationsCmd - Command to create a notebook for common operations on a PostgreSQL view.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdViewOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const viewResult = await client.query(VIEW_DEFINITION_QUERY, [`${item.schema}.${item.label} `]);
            if (!viewResult.rows[0]?.definition) {
                throw new Error('View definition not found');
            }

            // Get column information
            const columnsResult = await client.query(COLUMN_INFO_QUERY, [item.schema, item.label]);
            const columns = columnsResult.rows;

            const viewDefinition = `CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS\n${viewResult.rows[0].definition} `;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `### View Operations: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> This notebook contains common operations for the PostgreSQL view. Run the cells below to execute the operations.
</div>

#### 📋 View Information

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Property</th><th style="text-align: left;">Value</th></tr>
    <tr><td><strong>Schema</strong></td><td>${item.schema}</td></tr>
    <tr><td><strong>View Name</strong></td><td>${item.label}</td></tr>
    <tr><td><strong>Column Count</strong></td><td>${columns.length}</td></tr>
</table>

#### 🎯 Available Operations

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Operation</th><th style="text-align: left;">Description</th></tr>
    <tr><td><strong>View Columns</strong></td><td>Display column definitions</td></tr>
    <tr><td><strong>View Definition</strong></td><td>Show the CREATE VIEW statement</td></tr>
    <tr><td><strong>Query Data</strong></td><td>Select the first 100 rows</td></tr>
    <tr><td><strong>Query with Filters</strong></td><td>Advanced SELECT with WHERE clause</td></tr>
    <tr><td><strong>Query with Aggregation</strong></td><td>Group and aggregate data</td></tr>
    <tr><td><strong>Modify Definition</strong></td><td>Template for updating the view</td></tr>
    <tr><td><strong>Drop</strong></td><td>Delete the view (Warning: Irreversible)</td></tr>
</table>`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📋 View Columns`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- View columns\nSELECT \n    column_name,\n    data_type,\n    is_nullable,\n    column_default\nFROM information_schema.columns\nWHERE table_schema = '${item.schema}'\n  AND table_name = '${item.label}'\nORDER BY ordinal_position;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 View Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- View definition\n${viewDefinition} `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📖 Query Data`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Query view data
SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔍 Query with Filters`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Query with filters
SELECT *
FROM ${item.schema}.${item.label}
WHERE condition = value
ORDER BY column_name
LIMIT 100;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📊 Query with Aggregation`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Query with aggregation
SELECT 
    column_name,
    COUNT(*) as count,
    AVG(numeric_column) as average
FROM ${item.schema}.${item.label}
GROUP BY column_name
ORDER BY count DESC;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ✏️ Modify Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Modify view definition
CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS
SELECT * FROM source_table
WHERE condition;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop View`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop view
DROP VIEW IF EXISTS ${item.schema}.${item.label};`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create view operations notebook: ${err.message} `);
    }
}

/**
 * Show properties of a PostgreSQL view.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the properties are shown.
 */
export async function cmdShowViewProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            // Gather comprehensive view information
            const [viewInfo, columnInfo, dependenciesInfo, referencedInfo, sizeInfo] = await Promise.all([
                // Basic view info
                client.query(`
                    SELECT 
                        c.relname as view_name,
                        n.nspname as schema_name,
                        pg_get_userbyid(c.relowner) as owner,
                        obj_description(c.oid) as comment,
                        c.reltuples::bigint as row_estimate
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'v'
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
                
                // Dependent objects (views/tables that depend on this view)
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
                
                // Referenced objects (tables/views this view depends on)
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
                
                // Size information
                client.query(`
                    SELECT 
                        pg_size_pretty(pg_relation_size($1::regclass)) as view_size
                `, [`${item.schema}.${item.label}`])
            ]);

            const view = viewInfo.rows[0];
            const columns = columnInfo.rows;
            const dependents = dependenciesInfo.rows;
            const references = referencedInfo.rows;
            const sizes = sizeInfo.rows[0];

            // Get view definition
            const viewDefResult = await client.query(`SELECT pg_get_viewdef($1::regclass, true) as definition`, [`${item.schema}.${item.label}`]);
            const viewDefinition = viewDefResult.rows[0]?.definition || '';

            const metadata = createMetadata(connection, item.databaseName);

            const getKindLabel = (kind: string) => {
                switch (kind) {
                    case 'r': return '📊 Table';
                    case 'v': return '👁️ View';
                    case 'm': return '💾 Materialized View';
                    case 'f': return '🌐 Foreign Table';
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

            // Build CREATE VIEW script
            const createViewScript = `-- DROP VIEW IF EXISTS ${item.schema}.${item.label};

CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS
${viewDefinition};

-- View comment
${view.comment ? `COMMENT ON VIEW ${item.schema}.${item.label} IS '${view.comment.replace(/'/g, "''")}';` : `-- COMMENT ON VIEW ${item.schema}.${item.label} IS 'view description';`}`;

            const markdown = `### 👁️ View Properties: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Owner:</strong> ${view.owner} ${view.comment ? `| <strong>Comment:</strong> ${view.comment}` : ''}
</div>

#### 📊 General Information

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left; width: 30%;">Property</th><th style="text-align: left;">Value</th></tr>
    <tr><td><strong>Schema</strong></td><td>${view.schema_name}</td></tr>
    <tr><td><strong>View Name</strong></td><td>${view.view_name}</td></tr>
    <tr><td><strong>Owner</strong></td><td>${view.owner}</td></tr>
    <tr><td><strong>Size</strong></td><td>${sizes.view_size}</td></tr>
    <tr><td><strong>Row Estimate</strong></td><td>${view.row_estimate?.toLocaleString() || 'N/A'}</td></tr>
    <tr><td><strong>Column Count</strong></td><td>${columns.length}</td></tr>
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

${references.length > 0 ? `#### 🔗 Referenced Objects (${references.length})

<div style="font-size: 11px; background-color: #2d3a42; border-left: 3px solid #9b59b6; padding: 6px 10px; margin-bottom: 10px; border-radius: 3px;">
    Objects that this view depends on (base tables and views):
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
    Objects that depend on this view (other views that reference this one):
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
                    `##### 📝 CREATE VIEW Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    createViewScript,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🗑️ DROP VIEW Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop view (with dependencies)
DROP VIEW IF EXISTS ${item.schema}.${item.label} CASCADE;

-- Drop view (without dependencies - will fail if referenced)
-- DROP VIEW IF EXISTS ${item.schema}.${item.label} RESTRICT;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔍 Query View Data`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Select all data from view
SELECT * FROM ${item.schema}.${item.label}
LIMIT 100;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📊 View Definition Details`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Get detailed view information
SELECT 
    schemaname,
    viewname,
    viewowner,
    definition
FROM pg_views
WHERE schemaname = '${item.schema}' AND viewname = '${item.label}';

-- Check view dependencies
SELECT DISTINCT
    v.table_schema,
    v.table_name,
    v.column_name
FROM information_schema.view_column_usage v
WHERE v.view_schema = '${item.schema}' 
AND v.view_name = '${item.label}'
ORDER BY v.table_schema, v.table_name, v.column_name;`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to show view properties: ${err.message}`);
    }
}

/**
 * cmdRefreshView - Refreshes the view item in the tree view.
 */
export async function cmdRefreshView(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    databaseTreeProvider?.refresh(item);
}

/**
 * cmdCreateView - Command to create a new view in the database.
 */
export async function cmdCreateView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `### Create New View in Schema: \`${item.schema}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Modify the view definition below and execute the cell to create the view.
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
                `-- Create new view
CREATE OR REPLACE VIEW ${item.schema}.view_name AS
SELECT 
    column1, 
    column2
FROM 
    source_table
WHERE 
    condition;

-- Add comment
COMMENT ON VIEW ${item.schema}.view_name IS 'View description';`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create view notebook: ${err.message}`);
    }
}