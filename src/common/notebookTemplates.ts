/**
 * Reusable notebook cell templates for consistent notebook generation
 * This module provides builders for common notebook patterns
 */

import * as vscode from 'vscode';
import { MarkdownBuilder, NotebookTemplates } from './htmlStyles';

/**
 * Builder for creating consistent notebook cells
 */
export class NotebookCellBuilder {
    private cells: vscode.NotebookCellData[] = [];

    /**
     * Add a markdown cell
     */
    addMarkdown(content: string): this {
        this.cells.push(new vscode.NotebookCellData(
            vscode.NotebookCellKind.Markup,
            content,
            'markdown'
        ));
        return this;
    }

    /**
     * Add a SQL code cell
     */
    addSQL(sql: string): this {
        this.cells.push(new vscode.NotebookCellData(
            vscode.NotebookCellKind.Code,
            sql,
            'sql'
        ));
        return this;
    }

    /**
     * Add a section with header and SQL
     */
    addSection(title: string, sql: string, icon?: string): this {
        this.addMarkdown(NotebookTemplates.sectionHeader(title, icon));
        this.addSQL(sql);
        return this;
    }

    /**
     * Add a header with info box
     */
    addHeader(title: string, description: string, icon?: string): this {
        this.addMarkdown(NotebookTemplates.header(title, description, icon));
        return this;
    }

    /**
     * Add an info/warning/tip box
     */
    addInfoBox(message: string, type: 'info' | 'warning' | 'success' | 'danger' = 'info', title?: string): this {
        let content: string;
        switch (type) {
            case 'warning':
                content = MarkdownBuilder.warningBox(message, title);
                break;
            case 'success':
                content = MarkdownBuilder.successBox(message, title);
                break;
            case 'danger':
                content = MarkdownBuilder.dangerBox(message, title);
                break;
            default:
                content = MarkdownBuilder.infoBox(message, title);
        }
        this.addMarkdown(content);
        return this;
    }

    /**
     * Add a divider
     */
    addDivider(): this {
        this.addMarkdown(MarkdownBuilder.divider());
        return this;
    }

    /**
     * Get all cells
     */
    build(): vscode.NotebookCellData[] {
        return this.cells;
    }
}

/**
 * Pre-built notebook templates for common operations
 */
export class CommonNotebookTemplates {
    /**
     * Create a SELECT query notebook
     */
    static selectQuery(schema: string, tableName: string): vscode.NotebookCellData[] {
        return new NotebookCellBuilder()
            .addHeader(
                `SELECT Script: \`${schema}.${tableName}\``,
                'Execute the query below to retrieve data from the table.',
                '📖'
            )
            .addSection('Query Data', `SELECT * FROM ${schema}.${tableName} LIMIT 100;`, '📖')
            .build();
    }

    /**
     * Create an INSERT query notebook
     */
    static insertQuery(
        schema: string,
        tableName: string,
        columns: Array<{ name: string; type: string; default?: string }>
    ): vscode.NotebookCellData[] {
        const builder = new NotebookCellBuilder()
            .addHeader(
                `INSERT Data: \`${schema}.${tableName}\``,
                'Replace placeholder values below with your actual data. Use the data type reference to format values correctly.',
                '➕'
            );

        // Add data type reference table
        builder.addMarkdown(`${MarkdownBuilder.heading('Common Data Type Formats', 4, '📋')}

${MarkdownBuilder.table(
    ['Data Type', 'Example Value', 'Notes'],
    [
        ['Text/Varchar', MarkdownBuilder.inlineCode("'example text'"), 'Single quotes required'],
        ['Integer/Numeric', MarkdownBuilder.inlineCode('42') + ' or ' + MarkdownBuilder.inlineCode('3.14'), 'No quotes'],
        ['Boolean', MarkdownBuilder.inlineCode('true') + ' or ' + MarkdownBuilder.inlineCode('false'), 'Lowercase, no quotes'],
        ['Date', MarkdownBuilder.inlineCode("'2024-01-15'"), 'Format: YYYY-MM-DD'],
        ['Timestamp', MarkdownBuilder.inlineCode("'2024-01-15 14:30:00'"), 'Or use ' + MarkdownBuilder.inlineCode('NOW()')],
        ['UUID', MarkdownBuilder.inlineCode("'550e8400...'"), 'Or use ' + MarkdownBuilder.inlineCode('gen_random_uuid()')],
        ['JSON/JSONB', MarkdownBuilder.inlineCode('\'{"key": "value"}\''), 'Valid JSON in quotes'],
        ['NULL', MarkdownBuilder.inlineCode('NULL'), 'For optional fields'],
    ]
)}

${MarkdownBuilder.successBox('Use `RETURNING *` to see the inserted row immediately. For bulk inserts, specify multiple value tuples.')}`);

        // Generate INSERT statement
        const columnNames = columns.map(c => c.name).join(',\n    ');
        const placeholders = columns.map(col => {
            if (col.default) return 'DEFAULT';
            const type = col.type.toLowerCase();
            if (type.includes('char') || type.includes('text') || type.includes('uuid') || 
                type.includes('date') || type.includes('time')) {
                return "'value'";
            } else if (type.includes('int') || type.includes('numeric') || type.includes('decimal') || 
                      type.includes('real') || type.includes('double')) {
                return '0';
            } else if (type.includes('bool')) {
                return 'false';
            } else if (type.includes('json')) {
                return "'{}'";
            }
            return 'NULL';
        }).join(',\n    ');

        builder.addSQL(`-- Insert single row
INSERT INTO ${schema}.${tableName} (
    ${columnNames}
)
VALUES (
    ${placeholders}
)
RETURNING *;

-- Insert multiple rows (example)
/*
INSERT INTO ${schema}.${tableName} (
    ${columnNames}
)
VALUES
    (${placeholders.replace(/\n    /g, ', ')}),
    (${placeholders.replace(/\n    /g, ', ')})
RETURNING *;
*/`);

        return builder.build();
    }

    /**
     * Create an UPDATE query notebook
     */
    static updateQuery(
        schema: string,
        tableName: string,
        primaryKeys: string[] = []
    ): vscode.NotebookCellData[] {
        const whereClause = primaryKeys.length > 0
            ? `WHERE ${primaryKeys.map(pk => `${pk} = value`).join(' AND ')}`
            : '-- Add your WHERE clause here to identify rows to update';

        return new NotebookCellBuilder()
            .addHeader(
                `Update Data: \`${schema}.${tableName}\``,
                'Always include a WHERE clause to avoid updating all rows unintentionally. Test with SELECT first!',
                '✏️'
            )
            .addInfoBox(
                'This will modify the existing database. Always include a WHERE clause!',
                'warning',
                'Warning'
            )
            .addMarkdown(`${MarkdownBuilder.heading('Safety Checklist', 4, '🎯')}

${MarkdownBuilder.table(
    ['Action', 'Description'],
    [
        ['✅ Test WHERE', 'Test your WHERE clause with a SELECT query first'],
        ['✅ Transaction', 'Consider using a transaction (BEGIN/COMMIT/ROLLBACK)'],
        ['✅ Verify Count', 'Verify the number of affected rows matches expectations'],
        ['✅ Backup', 'Have a backup if updating critical data'],
    ]
)}

${MarkdownBuilder.successBox('Use `RETURNING *` to see updated rows. For safer updates, wrap in a transaction and review changes before committing.')}`)
            .addSection(
                'Update Command',
                `-- Update data
UPDATE ${schema}.${tableName}
SET
    -- List columns to update:
    column_name = new_value
${whereClause}
RETURNING *;`,
                '📝'
            )
            .build();
    }

    /**
     * Create a DELETE query notebook
     */
    static deleteQuery(schema: string, tableName: string): vscode.NotebookCellData[] {
        return new NotebookCellBuilder()
            .addHeader(
                `DELETE Script: \`${schema}.${tableName}\``,
                'This will delete rows from the table. Always use a WHERE clause!',
                '🗑️'
            )
            .addInfoBox(
                'This will delete rows from the table. Always use a WHERE clause!',
                'warning',
                'Warning'
            )
            .addSection(
                'Delete Command',
                `-- Delete rows
DELETE FROM ${schema}.${tableName}
WHERE condition; -- e.g., id = 1

-- Delete with RETURNING
/*
DELETE FROM ${schema}.${tableName}
WHERE condition
RETURNING *;
*/`
            )
            .build();
    }

    /**
     * Create a VACUUM notebook
     */
    static vacuumTable(schema: string, tableName: string): vscode.NotebookCellData[] {
        return new NotebookCellBuilder()
            .addHeader(
                `VACUUM: \`${schema}.${tableName}\``,
                'VACUUM reclaims storage occupied by dead tuples and updates statistics for the query planner.',
                '🧹'
            )
            .addMarkdown(`${MarkdownBuilder.heading('What VACUUM Does', 4, '🎯')}

${MarkdownBuilder.table(
    ['Operation', 'Description', 'Benefit'],
    [
        ['Dead Tuple Cleanup', 'Removes obsolete row versions', 'Frees disk space'],
        ['Update Statistics', 'Refreshes table statistics', 'Improves query planning'],
        ['Prevent Wraparound', 'Freezes old transaction IDs', 'Ensures database health'],
        ['Update Visibility Map', 'Marks pages as all-visible', 'Speeds up index-only scans'],
    ]
)}

${MarkdownBuilder.successBox('PostgreSQL has autovacuum running automatically, but manual VACUUM can be useful after bulk operations. Use VACUUM FULL only during maintenance windows as it locks the table.')}`)
            .addSection('VACUUM Command', `VACUUM (VERBOSE, ANALYZE) ${schema}.${tableName};`)
            .build();
    }

    /**
     * Create an ANALYZE notebook
     */
    static analyzeTable(schema: string, tableName: string): vscode.NotebookCellData[] {
        return new NotebookCellBuilder()
            .addHeader(
                `ANALYZE: \`${schema}.${tableName}\``,
                'ANALYZE collects statistics about the contents of tables for the query planner to optimize query execution plans.',
                '📊'
            )
            .addMarkdown(`${MarkdownBuilder.heading('What ANALYZE Does', 4, '🎯')}

${MarkdownBuilder.table(
    ['Statistic Collected', 'Purpose'],
    [
        ['Row Count', 'Estimates total rows in table'],
        ['Most Common Values', 'Identifies frequently occurring values'],
        ['Value Distribution', 'Analyzes value ranges and histograms'],
        ['NULL Frequency', 'Counts NULL values per column'],
        ['Column Correlation', 'Measures correlation between columns'],
    ]
)}

${MarkdownBuilder.successBox('ANALYZE is fast and non-blocking. Run it frequently, especially after data changes. Use VERBOSE to see detailed statistics updates.')}`)
            .addSection('ANALYZE Command', `ANALYZE VERBOSE ${schema}.${tableName};`)
            .build();
    }

    /**
     * Create a DROP TABLE notebook
     */
    static dropTable(schema: string, tableName: string): vscode.NotebookCellData[] {
        return new NotebookCellBuilder()
            .addHeader(
                `Drop Table: \`${schema}.${tableName}\``,
                'This action will PERMANENTLY DELETE the table and ALL DATA. This cannot be undone!',
                '❌'
            )
            .addInfoBox(
                'This action will <strong>PERMANENTLY DELETE</strong> the table and <strong>ALL DATA</strong>. This cannot be undone!',
                'danger',
                'Caution'
            )
            .addMarkdown(`${MarkdownBuilder.heading('Pre-Drop Checklist', 4, '🔍')}

${MarkdownBuilder.table(
    ['Check', 'Question'],
    [
        ['✅ Backups', 'Do you have recent backups of this data?'],
        ['✅ Verification', 'Is this definitely the table you want to drop?'],
        ['✅ Dependencies', 'Check for views, foreign keys, and app usage'],
        ['✅ Production', 'Have you followed change management procedures?'],
    ]
)}`)
            .addSection('Drop Command', `-- Drop table\nDROP TABLE IF EXISTS ${schema}.${tableName};`, '❌')
            .build();
    }

    /**
     * Create a TRUNCATE notebook
     */
    static truncateTable(schema: string, tableName: string): vscode.NotebookCellData[] {
        return new NotebookCellBuilder()
            .addHeader(
                `Truncate Table: \`${schema}.${tableName}\``,
                'This removes ALL DATA from the table instantly. This operation cannot be undone.',
                '🧹'
            )
            .addInfoBox(
                'This removes <strong>ALL DATA</strong> from the table instantly. This operation cannot be undone.',
                'danger',
                'Caution'
            )
            .addMarkdown(`${MarkdownBuilder.heading('TRUNCATE vs DELETE', 4, '🔄')}

${MarkdownBuilder.table(
    ['Feature', 'TRUNCATE', 'DELETE'],
    [
        ['Speed', '⚡ Very fast', '🐌 Slower'],
        ['Triggers', '❌ No triggers', '✅ Fires triggers'],
        ['Rollback', '⚠️ Transaction only', '✅ Can rollback'],
        ['Space', '✅ Reclaimed', '⚠️ Needs VACUUM'],
    ]
)}

${MarkdownBuilder.successBox('To truncate despite foreign key constraints, use `TRUNCATE TABLE ${schema}.${tableName} CASCADE`. This will also truncate tables that reference this table (use with extreme caution!).')}`)
            .addSection('Truncate Command', `-- Truncate table\nTRUNCATE TABLE ${schema}.${tableName};`, '🧹')
            .build();
    }

    /**
     * Create a table properties/CREATE script notebook
     */
    static tableDefinition(schema: string, tableName: string, createScript: string): vscode.NotebookCellData[] {
        return new NotebookCellBuilder()
            .addHeader(
                `Table Definition: \`${schema}.${tableName}\``,
                'Complete CREATE TABLE script for recreating this table structure.',
                '📝'
            )
            .addSection('CREATE TABLE Script', createScript, '📄')
            .build();
    }
}
