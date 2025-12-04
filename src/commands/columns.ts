import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { ConnectionManager } from '../services/ConnectionManager';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from './connection';
import { 
    MarkdownUtils, 
    FormatHelpers, 
    ValidationHelpers, 
    ErrorHandlers,
    SQL_TEMPLATES,
    createSimpleNotebook 
} from './helper';

export async function showColumnProperties(item: DatabaseTreeItem) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const client = await ConnectionManager.getInstance().getConnection({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            database: item.databaseName!,
            name: connection.name
        });

        const columnName = item.columnName!;
        const tableName = item.tableName!;

        const result = await client.query(`
            SELECT 
                c.column_name,
                c.data_type,
                c.character_maximum_length,
                c.numeric_precision,
                c.numeric_scale,
                c.is_nullable,
                c.column_default,
                c.udt_name,
                c.ordinal_position,
                col_description((c.table_schema||'.'||c.table_name)::regclass::oid, c.ordinal_position) as column_comment,
                CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
                CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_foreign_key,
                fk.foreign_table_schema,
                fk.foreign_table_name,
                fk.foreign_column_name,
                CASE WHEN uq.column_name IS NOT NULL THEN true ELSE false END as is_unique
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT ku.column_name, ku.table_schema, ku.table_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage ku 
                    ON tc.constraint_name = ku.constraint_name
                    AND tc.table_schema = ku.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
            ) pk ON c.column_name = pk.column_name 
                AND c.table_schema = pk.table_schema 
                AND c.table_name = pk.table_name
            LEFT JOIN (
                SELECT 
                    kcu.column_name,
                    kcu.table_schema,
                    kcu.table_name,
                    ccu.table_schema AS foreign_table_schema,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
            ) fk ON c.column_name = fk.column_name 
                AND c.table_schema = fk.table_schema 
                AND c.table_name = fk.table_name
            LEFT JOIN (
                SELECT ku.column_name, ku.table_schema, ku.table_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage ku 
                    ON tc.constraint_name = ku.constraint_name
                    AND tc.table_schema = ku.table_schema
                WHERE tc.constraint_type = 'UNIQUE'
            ) uq ON c.column_name = uq.column_name 
                AND c.table_schema = uq.table_schema 
                AND c.table_name = uq.table_name
            WHERE c.table_schema = $1 
                AND c.table_name = $2 
                AND c.column_name = $3
        `, [item.schema, tableName, columnName]);

        if (result.rows.length === 0) {
            vscode.window.showErrorMessage('Column not found');
            return;
        }

        const col = result.rows[0];
        const metadata = createMetadata(connection, item.databaseName);

        const dataTypeDetails = col.character_maximum_length 
            ? `${col.data_type}(${col.character_maximum_length})`
            : col.numeric_precision 
                ? `${col.data_type}(${col.numeric_precision}${col.numeric_scale ? ',' + col.numeric_scale : ''})`
                : col.data_type;

        const constraints = [];
        if (col.is_primary_key) constraints.push('🔑 PRIMARY KEY');
        if (col.is_foreign_key) constraints.push(`🔗 FOREIGN KEY → ${col.foreign_table_schema}.${col.foreign_table_name}.${col.foreign_column_name}`);
        if (col.is_unique) constraints.push('⭐ UNIQUE');
        if (col.is_nullable === 'NO') constraints.push('🚫 NOT NULL');

        let markdown = MarkdownUtils.header(`📋 Column Properties: \`${col.column_name}\``) +
            MarkdownUtils.infoBox(`Table: \`${item.schema}.${tableName}\``) +
            `\n\n#### 📊 Basic Information\n\n` +
            MarkdownUtils.propertiesTable({
                'Column Name': `<code>${col.column_name}</code>`,
                'Data Type': `<code>${dataTypeDetails}</code>`,
                'UDT Name': `<code>${col.udt_name}</code>`,
                'Position': `${col.ordinal_position}`,
                'Nullable': FormatHelpers.formatBoolean(col.is_nullable === 'YES'),
                'Default Value': col.column_default ? `<code>${col.column_default}</code>` : '—'
            });

        if (constraints.length > 0) {
            markdown += `\n\n#### 🔒 Constraints\n\n${constraints.map(c => `- ${c}`).join('\n')}`;
        }

        if (col.column_comment) {
            markdown += `\n\n#### 💬 Comment\n\n\`\`\`\n${col.column_comment}\n\`\`\``;
        }

        markdown += '\n\n---';

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📖 Query Column`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Select column\nSELECT ${columnName}\nFROM ${item.schema}.${tableName}\nLIMIT 100;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📊 Column Statistics`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Column statistics (run ANALYZE first if no data)\nSELECT \n    n_distinct,\n    null_frac,\n    avg_width,\n    correlation\nFROM pg_stats\nWHERE schemaname = '${item.schema}' \n    AND tablename = '${tableName}' \n    AND attname = '${columnName}';`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);

    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'get column properties');
    }
}

export async function copyColumnName(item: DatabaseTreeItem) {
    const columnName = item.columnName!;
    await vscode.env.clipboard.writeText(columnName);
    vscode.window.showInformationMessage(`Copied: ${columnName}`);
}

export async function copyColumnNameQuoted(item: DatabaseTreeItem) {
    const columnName = item.columnName!;
    await vscode.env.clipboard.writeText(`"${columnName}"`);
    vscode.window.showInformationMessage(`Copied: "${columnName}"`);
}

export async function generateSelectStatement(item: DatabaseTreeItem) {
    try {
        validateItem(item);
        const columnName = item.columnName!;
        const tableName = item.tableName!;

        const markdown = MarkdownUtils.header(`📖 SELECT Statement: \`${columnName}\``) +
            MarkdownUtils.infoBox(`Query specific column from \`${item.schema}.${tableName}\``);

        const sql = `-- Select ${columnName} column
SELECT ${columnName}
FROM ${item.schema}.${tableName}
LIMIT 100;`;

        await createSimpleNotebook(item, 'SELECT Statement', sql, markdown);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate SELECT statement');
    }
}

export async function generateWhereClause(item: DatabaseTreeItem) {
    try {
        validateItem(item);
        const columnName = item.columnName!;
        const tableName = item.tableName!;

        const markdown = MarkdownUtils.header(`🔍 WHERE Clause Templates: \`${columnName}\``) +
            MarkdownUtils.infoBox(`Common WHERE clause patterns for filtering by \`${columnName}\``);

        const sql = `-- Exact match
SELECT * FROM ${item.schema}.${tableName}
WHERE ${columnName} = 'value';

-- Multiple values
SELECT * FROM ${item.schema}.${tableName}
WHERE ${columnName} IN ('value1', 'value2', 'value3');

-- Range query
SELECT * FROM ${item.schema}.${tableName}
WHERE ${columnName} BETWEEN 'start' AND 'end';

-- Pattern matching (for text columns)
SELECT * FROM ${item.schema}.${tableName}
WHERE ${columnName} LIKE '%pattern%';

-- NULL check
SELECT * FROM ${item.schema}.${tableName}
WHERE ${columnName} IS NULL;

-- NOT NULL check
SELECT * FROM ${item.schema}.${tableName}
WHERE ${columnName} IS NOT NULL;`;

        await createSimpleNotebook(item, 'WHERE Clause Templates', sql, markdown);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate WHERE clause');
    }
}

export async function generateAlterColumnScript(item: DatabaseTreeItem) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);
        const columnName = item.columnName!;
        const tableName = item.tableName!;

        const markdown = MarkdownUtils.header(`✏️ ALTER COLUMN Script: \`${columnName}\``) +
            MarkdownUtils.warningBox('Modifying column structure may fail if data doesn\'t match new constraints or type.') +
            `\n\n#### Available Modifications\n\n` +
            MarkdownUtils.operationsTable([
                { operation: 'Change Data Type', description: 'Convert column to different type' },
                { operation: 'Set NOT NULL', description: 'Prevent NULL values' },
                { operation: 'Drop NOT NULL', description: 'Allow NULL values' },
                { operation: 'Set Default', description: 'Add default value for new rows' },
                { operation: 'Drop Default', description: 'Remove default value' }
            ]);

        const sql = `-- Change data type
ALTER TABLE ${item.schema}.${tableName}
    ALTER COLUMN ${columnName} TYPE varchar(255);

-- Set NOT NULL constraint
ALTER TABLE ${item.schema}.${tableName}
    ALTER COLUMN ${columnName} SET NOT NULL;

-- Drop NOT NULL constraint
ALTER TABLE ${item.schema}.${tableName}
    ALTER COLUMN ${columnName} DROP NOT NULL;

-- Set default value
ALTER TABLE ${item.schema}.${tableName}
    ALTER COLUMN ${columnName} SET DEFAULT 'default_value';

-- Drop default value
ALTER TABLE ${item.schema}.${tableName}
    ALTER COLUMN ${columnName} DROP DEFAULT;

-- Multiple changes in one statement
ALTER TABLE ${item.schema}.${tableName}
    ALTER COLUMN ${columnName} TYPE integer USING ${columnName}::integer,
    ALTER COLUMN ${columnName} SET NOT NULL,
    ALTER COLUMN ${columnName} SET DEFAULT 0;`;

        await createSimpleNotebook(item, 'ALTER COLUMN Script', sql, markdown);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate ALTER COLUMN script');
    }
}

export async function generateDropColumnScript(item: DatabaseTreeItem) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);
        const columnName = item.columnName!;
        const tableName = item.tableName!;

        const markdown = MarkdownUtils.header(`🗑️ DROP COLUMN Script: \`${columnName}\``) +
            MarkdownUtils.dangerBox('This will permanently delete the column and ALL its data! This operation cannot be undone.') +
            `\n\n#### Before You Drop\n\n` +
            `1. **Backup your data** - Export table or create a snapshot\n` +
            `2. **Check dependencies** - Views, functions, or triggers may use this column\n` +
            `3. **Test on non-production** - Verify the change works as expected\n\n` +
            `\n\n#### Options\n\n` +
            `- **RESTRICT** (default): Fails if column has dependencies\n` +
            `- **CASCADE**: Automatically drops dependent objects (views, triggers, etc.)`;

        const sql = `-- Drop column (safe - fails if dependencies exist)
ALTER TABLE ${item.schema}.${tableName}
    DROP COLUMN ${columnName};

-- Drop column with CASCADE (removes all dependent objects)
-- ALTER TABLE ${item.schema}.${tableName}
--     DROP COLUMN ${columnName} CASCADE;

-- Drop only if exists
-- ALTER TABLE ${item.schema}.${tableName}
--     DROP COLUMN IF EXISTS ${columnName};`;

        await createSimpleNotebook(item, 'DROP COLUMN Script', sql, markdown);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate DROP COLUMN script');
    }
}

export async function generateRenameColumnScript(item: DatabaseTreeItem) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);
        const columnName = item.columnName!;
        const tableName = item.tableName!;

        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new column name',
            value: columnName,
            validateInput: ValidationHelpers.validateColumnName
        });

        if (!newName || newName === columnName) {
            return;
        }

        const markdown = MarkdownUtils.header(`🔄 RENAME COLUMN: \`${columnName}\` → \`${newName}\``) +
            MarkdownUtils.infoBox('Renaming is safe and atomic. Dependent objects (views, functions) will be automatically updated.');

        const sql = `-- Rename column from '${columnName}' to '${newName}'
ALTER TABLE ${item.schema}.${tableName}
    RENAME COLUMN ${columnName} TO ${newName};`;

        await createSimpleNotebook(item, 'RENAME COLUMN', sql, markdown);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate RENAME COLUMN script');
    }
}

export async function addColumnComment(item: DatabaseTreeItem) {
    try {
        validateItem(item);
        const columnName = item.columnName!;
        const tableName = item.tableName!;

        const comment = await vscode.window.showInputBox({
            prompt: `Enter comment for column ${columnName}`,
            placeHolder: 'Column description...'
        });

        if (comment === undefined) {
            return;
        }

        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const markdown = MarkdownUtils.header(`💬 Add Column Comment: \`${columnName}\``) +
            MarkdownUtils.infoBox('Column comments are stored in PostgreSQL system catalogs and visible in `pg_stats`');

        const sql = `-- Add/update comment for column ${columnName}
${SQL_TEMPLATES.COMMENT.COLUMN(item.schema, tableName, columnName, comment)}

-- To remove a comment, use:
-- COMMENT ON COLUMN ${item.schema}.${tableName}.${columnName} IS NULL;`;

        await createSimpleNotebook(item, 'Add Column Comment', sql, markdown);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate comment script');
    }
}

export async function generateIndexOnColumn(item: DatabaseTreeItem) {
    try {
        validateItem(item);
        const columnName = item.columnName!;
        const tableName = item.tableName!;

        const indexName = await vscode.window.showInputBox({
            prompt: 'Enter index name',
            value: `idx_${tableName}_${columnName}`,
            validateInput: (value) => ValidationHelpers.validateIdentifier(value, 'index')
        });

        if (!indexName) {
            return;
        }

        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const markdown = MarkdownUtils.header(`🔍 CREATE INDEX: \`${indexName}\``) +
            MarkdownUtils.infoBox('Indexes improve query performance but slow down write operations. Choose the right index type for your use case.') +
            `\n\n#### Index Types\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '<strong>B-tree</strong> (default)', description: 'Most queries, equality and range' },
                { operation: '<strong>Hash</strong>', description: 'Simple equality comparisons only' },
                { operation: '<strong>GIN</strong>', description: 'Array, JSONB, full-text search' },
                { operation: '<strong>GiST</strong>', description: 'Geometric data, full-text search' }
            ]) + `\n` +
            MarkdownUtils.successBox('Use `CREATE INDEX CONCURRENTLY` to avoid locking the table during index creation on production databases.');

        const sql = `-- Basic index (B-tree)
CREATE INDEX ${indexName} 
ON ${item.schema}.${tableName} (${columnName});

-- Unique index (prevents duplicate values)
-- CREATE UNIQUE INDEX ${indexName} 
-- ON ${item.schema}.${tableName} (${columnName});

-- Concurrent index (doesn't lock table, slower creation)
-- CREATE INDEX CONCURRENTLY ${indexName} 
-- ON ${item.schema}.${tableName} (${columnName});

-- Index with specific method
-- CREATE INDEX ${indexName} 
-- ON ${item.schema}.${tableName} USING btree (${columnName});

-- Partial index (index only matching rows)
-- CREATE INDEX ${indexName} 
-- ON ${item.schema}.${tableName} (${columnName}) 
-- WHERE ${columnName} IS NOT NULL;

-- Index with sorting and null handling
-- CREATE INDEX ${indexName} 
-- ON ${item.schema}.${tableName} (${columnName} DESC NULLS LAST);

-- Functional/expression index
-- CREATE INDEX ${indexName} 
-- ON ${item.schema}.${tableName} (LOWER(${columnName}));`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(vscode.NotebookCellKind.Code, sql, 'sql')
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate CREATE INDEX script');
    }
}

export async function viewColumnStatistics(item: DatabaseTreeItem) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);
        const columnName = item.columnName!;
        const tableName = item.tableName!;

        const markdown = MarkdownUtils.header(`📊 Column Statistics: \`${columnName}\``) +
            MarkdownUtils.infoBox(`Statistics are collected by \`ANALYZE\` and used by the query planner for optimization. Run \`ANALYZE ${item.schema}.${tableName};\` if statistics are missing.`) +
            `\n\n#### Statistics Explained\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '<strong>n_distinct</strong>', description: 'Estimated number of distinct values (-1 = all unique, 0-1 = fraction, >1 = count)' },
                { operation: '<strong>null_frac</strong>', description: 'Fraction of NULL values (0.0 to 1.0)' },
                { operation: '<strong>avg_width</strong>', description: 'Average storage width in bytes' },
                { operation: '<strong>correlation</strong>', description: 'Statistical correlation between physical row order and logical order (-1 to 1)' }
            ]);

        const sql = `-- View column statistics
SELECT 
    schemaname,
    tablename,
    attname as column_name,
    n_distinct,
    ROUND((null_frac * 100)::numeric, 2) as null_percentage,
    avg_width as avg_bytes,
    ROUND(correlation::numeric, 4) as correlation
FROM pg_stats
WHERE schemaname = '${item.schema}' 
    AND tablename = '${tableName}' 
    AND attname = '${columnName}';

-- Get most common values and their frequencies
SELECT 
    attname as column_name,
    most_common_vals as common_values,
    most_common_freqs as frequencies
FROM pg_stats
WHERE schemaname = '${item.schema}' 
    AND tablename = '${tableName}' 
    AND attname = '${columnName}';

-- Refresh statistics
-- ANALYZE ${item.schema}.${tableName};`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(vscode.NotebookCellKind.Code, sql, 'sql')
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'view column statistics');
    }
}

/**
 * Add new column to table - generates a comprehensive notebook with guidelines and SQL templates
 */
export async function cmdAddColumn(item: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const schema = item.schema!;
        const tableName = item.tableName!;

        const markdown = MarkdownUtils.header(`➕ Add New Column to \`${schema}.${tableName}\``) +
            MarkdownUtils.infoBox('This notebook provides templates for adding new columns. Modify the templates below and execute to add columns.') +
            `\n\n#### 📋 Guidelines for Adding Columns\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '<strong>Naming</strong>', description: 'Use snake_case (e.g., user_name, created_at). Avoid reserved words.' },
                { operation: '<strong>Data Types</strong>', description: 'Choose appropriate types: INTEGER, VARCHAR(n), TEXT, BOOLEAN, TIMESTAMP, JSONB, UUID' },
                { operation: '<strong>Constraints</strong>', description: 'Consider NOT NULL, DEFAULT, CHECK constraints at column level' },
                { operation: '<strong>Performance</strong>', description: 'Adding columns is fast but adding with DEFAULT on large tables may lock' }
            ]) +
            `\n\n#### 🏷️ Common Data Types Reference\n\n` +
            MarkdownUtils.propertiesTable({
                'INTEGER / BIGINT': 'Whole numbers (4/8 bytes)',
                'SERIAL / BIGSERIAL': 'Auto-incrementing integer',
                'VARCHAR(n) / TEXT': 'Variable-length strings',
                'BOOLEAN': 'true/false values',
                'TIMESTAMP / TIMESTAMPTZ': 'Date and time (with/without timezone)',
                'DATE / TIME': 'Date or time only',
                'NUMERIC(p,s)': 'Exact decimal numbers',
                'JSONB': 'Binary JSON (recommended for JSON data)',
                'UUID': 'Universally unique identifier',
                'ARRAY': 'Array of any type (e.g., INTEGER[])',
            }) +
            `

---`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 Basic Column (Recommended Start)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add a basic column\nALTER TABLE "${schema}"."${tableName}"\nADD COLUMN new_column_name VARCHAR(255);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔒 Column with NOT NULL and DEFAULT`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add column with NOT NULL constraint and default value\nALTER TABLE "${schema}"."${tableName}"\nADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'active';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ⏰ Timestamp Columns`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add created_at and updated_at timestamps\nALTER TABLE "${schema}"."${tableName}"\nADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\nADD COLUMN updated_at TIMESTAMPTZ;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ✅ Column with CHECK Constraint`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add column with inline CHECK constraint\nALTER TABLE "${schema}"."${tableName}"\nADD COLUMN priority INTEGER CHECK (priority >= 1 AND priority <= 10);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔗 Foreign Key Column`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add column with foreign key reference\nALTER TABLE "${schema}"."${tableName}"\nADD COLUMN category_id INTEGER REFERENCES ${schema}.categories(id) ON DELETE SET NULL;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📄 JSON Column`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add JSONB column (preferred over JSON for performance)\nALTER TABLE "${schema}"."${tableName}"\nADD COLUMN metadata JSONB DEFAULT '{}';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🆔 UUID Column`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add UUID column with auto-generation\n-- Note: Requires uuid-ossp or pgcrypto extension\nALTER TABLE "${schema}"."${tableName}"\nADD COLUMN external_id UUID DEFAULT gen_random_uuid();`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.warningBox('After adding columns, consider adding indexes for frequently queried columns and updating application code.'),
                'markdown'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'add column');
    }
}
