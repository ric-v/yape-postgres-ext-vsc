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
 * Show constraint properties in a notebook
 */
export async function showConstraintProperties(treeItem: DatabaseTreeItem): Promise<void> {
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
        const constraintName = treeItem.label;

        // Get detailed constraint information
        const result = await client.query(`
            SELECT 
                tc.constraint_name,
                tc.constraint_type,
                tc.table_schema,
                tc.table_name,
                tc.is_deferrable,
                tc.initially_deferred,
                string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns,
                cc.check_clause,
                pg_get_constraintdef(con.oid) as constraint_definition,
                obj_description(con.oid) as comment
            FROM information_schema.table_constraints tc
            LEFT JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name 
                AND tc.table_schema = kcu.table_schema
            LEFT JOIN information_schema.check_constraints cc
                ON tc.constraint_name = cc.constraint_name
                AND tc.constraint_schema = cc.constraint_schema
            LEFT JOIN pg_constraint con ON con.conname = tc.constraint_name
                AND con.connamespace = (SELECT oid FROM pg_namespace WHERE nspname = tc.constraint_schema)
            WHERE tc.constraint_name = $1
                AND tc.table_schema = $2
                AND tc.table_name = $3
            GROUP BY tc.constraint_name, tc.constraint_type, tc.table_schema, tc.table_name, 
                     tc.is_deferrable, tc.initially_deferred, cc.check_clause, con.oid
        `, [constraintName, schema, tableName]);

        if (result.rows.length === 0) {
            vscode.window.showErrorMessage('Constraint not found');
            return;
        }

        const constraint = result.rows[0];
        const metadata = createMetadata(connection, treeItem.databaseName);

        // Build constraint type icon
        const typeIcon = ObjectUtils.getConstraintIcon(constraint.constraint_type);

        let markdown = MarkdownUtils.header(`${typeIcon} Constraint Properties: \`${constraint.constraint_name}\``) +
            MarkdownUtils.infoBox(`Table: \`${schema}.${tableName}\``) +
            `\n\n#### 📊 Basic Information\n\n` +
            MarkdownUtils.propertiesTable({
                'Constraint Name': `<code>${constraint.constraint_name}</code>`,
                'Type': `<code>${constraint.constraint_type}</code>`,
                'Columns': `<code>${constraint.columns || '—'}</code>`,
                'Deferrable': FormatHelpers.formatBoolean(constraint.is_deferrable === 'YES'),
                'Initially Deferred': FormatHelpers.formatBoolean(constraint.initially_deferred === 'YES')
            });

        if (constraint.constraint_definition) {
            markdown += `\n\n#### 🔧 Definition\n\n\`\`\`sql\n${constraint.constraint_definition}\n\`\`\``;
        }

        if (constraint.check_clause) {
            markdown += `\n\n#### ✓ Check Clause\n\n\`\`\`sql\n${constraint.check_clause}\n\`\`\``;
        }

        if (constraint.comment) {
            markdown += `\n\n#### 💬 Comment\n\n\`\`\`\n${constraint.comment}\n\`\`\``;
        }

        // Get foreign key details if applicable
        if (constraint.constraint_type === 'FOREIGN KEY') {
            const fkResult = await client.query(`
                SELECT 
                    kcu.column_name,
                    ccu.table_schema as foreign_table_schema,
                    ccu.table_name as foreign_table_name,
                    ccu.column_name as foreign_column_name,
                    rc.update_rule,
                    rc.delete_rule
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu 
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu 
                    ON tc.constraint_name = ccu.constraint_name
                    AND tc.table_schema = ccu.constraint_schema
                JOIN information_schema.referential_constraints rc
                    ON tc.constraint_name = rc.constraint_name
                    AND tc.table_schema = rc.constraint_schema
                WHERE tc.constraint_name = $1
                    AND tc.table_schema = $2
                ORDER BY kcu.ordinal_position
            `, [constraintName, schema]);

            if (fkResult.rows.length > 0) {
                markdown += `\n#### 🔗 Foreign Key References\n\n<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Column</th><th style="text-align: left;">References</th><th style="text-align: left;">On Update</th><th style="text-align: left;">On Delete</th></tr>`;

                fkResult.rows.forEach(row => {
                    markdown += `\n    <tr><td><code>${row.column_name}</code></td><td><code>${row.foreign_table_schema}.${row.foreign_table_name}.${row.foreign_column_name}</code></td><td>${row.update_rule}</td><td>${row.delete_rule}</td></tr>`;
                });

                markdown += '\n</table>';
            }
        }

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `\n\n##### 📖 Query Constraint Details`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- View constraint details
SELECT * FROM information_schema.table_constraints 
WHERE constraint_name = '${constraintName}' 
    AND table_schema = '${schema}';`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'show constraint properties');
    }
}

/**
 * Copy constraint name to clipboard
 */
export async function copyConstraintName(treeItem: DatabaseTreeItem): Promise<void> {
    const constraintName = treeItem.label;
    await vscode.env.clipboard.writeText(constraintName);
    vscode.window.showInformationMessage(`Copied: ${constraintName}`);
}

/**
 * Generate DROP CONSTRAINT script
 */
export async function generateDropConstraintScript(treeItem: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(treeItem);
        const connection = await getConnectionWithPassword(treeItem.connectionId!);
        const metadata = createMetadata(connection, treeItem.databaseName);

        const schema = treeItem.schema!;
        const tableName = treeItem.tableName!;
        const constraintName = treeItem.label;

        const markdown = MarkdownUtils.header(`🗑️ DROP CONSTRAINT: \`${constraintName}\``) +
            MarkdownUtils.dangerBox('This will remove the constraint from the table. Data integrity checks enforced by this constraint will no longer apply.') +
            MarkdownUtils.infoBox(`Table: \`${schema}.${tableName}\``);

        const sql = SQL_TEMPLATES.DROP.CONSTRAINT(schema, tableName, constraintName);

        await createSimpleNotebook(treeItem, 'DROP CONSTRAINT', sql, markdown);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate drop constraint script');
    }
}

/**
 * Generate ALTER CONSTRAINT script
 */
export async function generateAlterConstraintScript(treeItem: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(treeItem);
        const connection = await getConnectionWithPassword(treeItem.connectionId!);
        const metadata = createMetadata(connection, treeItem.databaseName);

        const schema = treeItem.schema!;
        const tableName = treeItem.tableName!;
        const constraintName = treeItem.label;

        const markdown = MarkdownUtils.header(`✏️ ALTER CONSTRAINT: \`${constraintName}\``) +
            MarkdownUtils.infoBox(`Table: \`${schema}.${tableName}\``) +
            `\n\n#### Available Operations\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '<strong>RENAME</strong>', description: 'Change the name of the constraint' },
                { operation: '<strong>VALIDATE</strong>', description: 'Validate a constraint that was created as NOT VALID' }
            ]);

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Rename constraint
ALTER TABLE "${schema}"."${tableName}"
RENAME CONSTRAINT "${constraintName}" TO "${constraintName}_new";`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Validate a NOT VALID constraint
ALTER TABLE "${schema}"."${tableName}"
VALIDATE CONSTRAINT "${constraintName}";`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate alter constraint script');
    }
}

/**
 * Validate constraint
 */
export async function validateConstraint(treeItem: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(treeItem);
        const connection = await getConnectionWithPassword(treeItem.connectionId!);
        const metadata = createMetadata(connection, treeItem.databaseName);

        const schema = treeItem.schema!;
        const tableName = treeItem.tableName!;
        const constraintName = treeItem.label;

        const markdown = MarkdownUtils.header(`✅ VALIDATE CONSTRAINT: \`${constraintName}\``) +
            MarkdownUtils.infoBox('Validates a constraint that was previously created with `NOT VALID`. This scans the table to ensure all rows satisfy the constraint.') +
            MarkdownUtils.infoBox(`Table: \`${schema}.${tableName}\``);

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Validate constraint ${constraintName}
ALTER TABLE "${schema}"."${tableName}"
VALIDATE CONSTRAINT "${constraintName}";`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'validate constraint');
    }
}

/**
 * Generate ADD CONSTRAINT template script
 */
export async function generateAddConstraintScript(treeItem: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(treeItem);
        const connection = await getConnectionWithPassword(treeItem.connectionId!);
        const metadata = createMetadata(connection, treeItem.databaseName);

        const schema = treeItem.schema!;
        const tableName = treeItem.tableName!;

        const markdown = MarkdownUtils.header('➕ ADD CONSTRAINT Templates') +
            MarkdownUtils.infoBox(`Table: \`${schema}.${tableName}\``) +
            `\n\n#### Constraint Types\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '<strong>PRIMARY KEY</strong>', description: 'Uniquely identifies each row' },
                { operation: '<strong>FOREIGN KEY</strong>', description: 'Ensures referential integrity' },
                { operation: '<strong>UNIQUE</strong>', description: 'Ensures all values in a column are different' },
                { operation: '<strong>CHECK</strong>', description: 'Ensures that all values in a column satisfy a specific condition' }
            ]);

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add Primary Key Constraint
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT "${tableName}_pkey" 
PRIMARY KEY (column_name);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add Foreign Key Constraint
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT "${tableName}_fkey" 
FOREIGN KEY (column_name) 
REFERENCES other_schema.other_table(other_column)
ON DELETE CASCADE
ON UPDATE CASCADE;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add Unique Constraint
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT "${tableName}_unique" 
UNIQUE (column_name);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add Check Constraint
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT "${tableName}_check" 
CHECK (column_name > 0);`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate add constraint script');
    }
}

/**
 * View constraint dependencies
 */
export async function viewConstraintDependencies(treeItem: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(treeItem);
        const connection = await getConnectionWithPassword(treeItem.connectionId!);
        const metadata = createMetadata(connection, treeItem.databaseName);

        const schema = treeItem.schema!;
        const tableName = treeItem.tableName!;
        const constraintName = treeItem.label;

        const markdown = MarkdownUtils.header(`🕸️ Constraint Dependencies: \`${constraintName}\``) +
            MarkdownUtils.infoBox(`Table: \`${schema}.${tableName}\``) +
            MarkdownUtils.infoBox('Shows objects that depend on this constraint.');

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Find all dependencies for this constraint
SELECT 
    d.deptype as dependency_type,
    c.relname as dependent_object,
    n.nspname as dependent_schema,
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'i' THEN 'index'
        WHEN 'S' THEN 'sequence'
        WHEN 'f' THEN 'foreign table'
        ELSE c.relkind::text
    END as object_type
FROM pg_constraint con
JOIN pg_depend d ON d.refobjid = con.oid
JOIN pg_class c ON c.oid = d.objid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE con.conname = '${constraintName}'
    AND con.connamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')
ORDER BY dependent_schema, dependent_object;`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'view constraint dependencies');
    }
}

export async function cmdConstraintOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const operationsMarkdown = MarkdownUtils.header(`🛡️ Constraint Operations: \`${item.label}\``) +
            MarkdownUtils.infoBox('This notebook provides a dashboard for managing your constraint. Each cell is a ready-to-execute template.') +
            `\n\n#### 🎯 Available Operations\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '🔍 <strong>View Definition</strong>', description: 'Display constraint definition', riskLevel: '✅ Safe' },
                { operation: '✅ <strong>Validate</strong>', description: 'Check existing data against constraint', riskLevel: '✅ Safe' },
                { operation: '✏️ <strong>Rename</strong>', description: 'Change constraint name', riskLevel: '⚠️ Low Risk' },
                { operation: '❌ <strong>Drop</strong>', description: 'Remove constraint permanently', riskLevel: '🔴 Destructive' }
            ]) + `\n` +
            MarkdownUtils.successBox('Use `Ctrl+Enter` to execute individual cells.') +
            `\n---`;

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                operationsMarkdown,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔍 View Definition`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- View constraint definition
SELECT pg_get_constraintdef(oid) as constraint_def
FROM pg_constraint
WHERE conname = '${item.label}'
AND conrelid = '${item.schema}.${item.tableName}'::regclass;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `#### ✅ Validate Constraint\n\n` +
                MarkdownUtils.infoBox('Validating a constraint ensures all existing rows satisfy the condition. This is useful for constraints added as NOT VALID.'),
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Validate constraint
ALTER TABLE ${item.schema}.${item.tableName}
VALIDATE CONSTRAINT ${item.label};`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `#### ✏️ Rename Constraint`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Rename constraint
ALTER TABLE ${item.schema}.${item.tableName}
RENAME CONSTRAINT ${item.label} TO new_constraint_name;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `#### ❌ Drop Constraint\n\n` +
                MarkdownUtils.dangerBox('This will remove the constraint. Data integrity checks enforced by this constraint will no longer apply.', 'Caution'),
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Drop constraint
ALTER TABLE ${item.schema}.${item.tableName}
DROP CONSTRAINT ${item.label};`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create constraint operations notebook');
    }
}

/**
 * Add new constraint to table - generates a comprehensive notebook with guidelines and SQL templates
 */
export async function cmdAddConstraint(item: DatabaseTreeItem): Promise<void> {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const schema = item.schema!;
        const tableName = item.tableName!;

        const markdown = MarkdownUtils.header(`➕ Add New Constraint to \`${schema}.${tableName}\``) +
            MarkdownUtils.infoBox('This notebook provides templates for adding constraints. Constraints enforce data integrity rules.') +
            `\n\n#### 📋 Constraint Types Overview\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '🔑 <strong>PRIMARY KEY</strong>', description: 'Uniquely identifies each row. Only one per table. Cannot be NULL.' },
                { operation: '🔗 <strong>FOREIGN KEY</strong>', description: 'References primary key in another table. Enforces referential integrity.' },
                { operation: '⭐ <strong>UNIQUE</strong>', description: 'Ensures all values in column(s) are distinct. Multiple allowed per table.' },
                { operation: '✓ <strong>CHECK</strong>', description: 'Validates data against a boolean expression. Flexible validation rules.' },
                { operation: '⊗ <strong>EXCLUSION</strong>', description: 'Prevents overlapping values using operators (useful for ranges, schedules).' },
                { operation: '⊕ <strong>NOT NULL</strong>', description: 'Prevents NULL values in a column.' }
            ]) +
            `\n\n#### ⚡ Important Considerations\n\n` +
            MarkdownUtils.warningBox('Adding constraints to large tables may take time and lock the table. Consider using NOT VALID with later VALIDATE.') +
            `

---`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔑 Primary Key Constraint`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add primary key constraint
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT ${tableName}_pkey PRIMARY KEY (id);

-- Composite primary key (multiple columns)
-- ALTER TABLE "${schema}"."${tableName}"
-- ADD CONSTRAINT ${tableName}_pkey PRIMARY KEY (column1, column2);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔗 Foreign Key Constraint`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add foreign key constraint
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT fk_${tableName}_reference
    FOREIGN KEY (reference_id) 
    REFERENCES ${schema}.other_table(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- Foreign Key Actions:
-- ON DELETE CASCADE    - Delete child rows when parent is deleted
-- ON DELETE SET NULL   - Set to NULL when parent is deleted
-- ON DELETE RESTRICT   - Prevent deletion if children exist
-- ON UPDATE CASCADE    - Update child values when parent key changes`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ⭐ Unique Constraint`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add unique constraint on single column
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT ${tableName}_email_unique UNIQUE (email);

-- Unique constraint on multiple columns (composite)
-- ALTER TABLE "${schema}"."${tableName}"
-- ADD CONSTRAINT ${tableName}_multi_unique UNIQUE (column1, column2);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ✓ Check Constraint`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add CHECK constraint for value validation
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT ${tableName}_status_check 
    CHECK (status IN ('active', 'inactive', 'pending'));

-- Range check
-- ALTER TABLE "${schema}"."${tableName}"
-- ADD CONSTRAINT ${tableName}_age_check CHECK (age >= 0 AND age <= 150);

-- Compare columns
-- ALTER TABLE "${schema}"."${tableName}"
-- ADD CONSTRAINT ${tableName}_date_check CHECK (end_date > start_date);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ⊗ Exclusion Constraint (for non-overlapping ranges)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Prevent overlapping time ranges (requires btree_gist extension)
-- CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT ${tableName}_no_overlap 
    EXCLUDE USING gist (
        resource_id WITH =,
        tsrange(start_time, end_time) WITH &&
    );`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ⊕ NOT NULL Constraint`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add NOT NULL constraint
ALTER TABLE "${schema}"."${tableName}"
ALTER COLUMN column_name SET NOT NULL;

-- Remove NOT NULL constraint
-- ALTER TABLE "${schema}"."${tableName}"
-- ALTER COLUMN column_name DROP NOT NULL;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ⚡ Add Constraint Without Locking (Large Tables)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Add constraint without validating existing data (faster, no lock)
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT ${tableName}_check_new
    CHECK (column_name IS NOT NULL) NOT VALID;

-- Later, validate existing data in background
ALTER TABLE "${schema}"."${tableName}"
VALIDATE CONSTRAINT ${tableName}_check_new;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.successBox('After adding constraints, test with sample data to ensure they work as expected.'),
                'markdown'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'add constraint');
    }
}
