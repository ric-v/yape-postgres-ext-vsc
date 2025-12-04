import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword } from './connection';

/**
 * Common SQL query templates
 */
export const SQL_TEMPLATES = {
    DROP: {
        TABLE: (schema: string, name: string) => 
            `-- Drop table\nDROP TABLE IF EXISTS "${schema}"."${name}";`,
        VIEW: (schema: string, name: string) => 
            `-- Drop view\nDROP VIEW IF EXISTS ${schema}.${name};`,
        MATERIALIZED_VIEW: (schema: string, name: string) => 
            `-- Drop materialized view\nDROP MATERIALIZED VIEW IF EXISTS ${schema}.${name};`,
        FUNCTION: (schema: string, name: string, args: string) => 
            `-- Drop function\nDROP FUNCTION IF EXISTS ${schema}.${name}(${args});`,
        INDEX: (schema: string, name: string) => 
            `-- Drop index\nDROP INDEX "${schema}"."${name}";`,
        CONSTRAINT: (schema: string, table: string, name: string) => 
            `-- Drop constraint\nALTER TABLE "${schema}"."${table}"\nDROP CONSTRAINT "${name}";`,
        TYPE: (schema: string, name: string) => 
            `-- Drop type\nDROP TYPE IF EXISTS ${schema}.${name} CASCADE;`,
        EXTENSION: (name: string) => 
            `-- Drop extension\nDROP EXTENSION IF EXISTS "${name}" CASCADE;`
    },
    SELECT: {
        ALL: (schema: string, table: string, limit: number = 100) => 
            `SELECT * FROM ${schema}.${table} LIMIT ${limit};`,
        WITH_WHERE: (schema: string, table: string, limit: number = 100) => 
            `SELECT * FROM ${schema}.${table}\nWHERE condition\nLIMIT ${limit};`
    },
    COMMENT: {
        TABLE: (schema: string, name: string, comment: string) => 
            `COMMENT ON TABLE ${schema}.${name} IS '${comment.replace(/'/g, "''")}';`,
        COLUMN: (schema: string, table: string, column: string, comment: string) => 
            `COMMENT ON COLUMN ${schema}.${table}.${column} IS '${comment.replace(/'/g, "''")}';`,
        VIEW: (schema: string, name: string, comment: string) => 
            `COMMENT ON VIEW ${schema}.${name} IS '${comment.replace(/'/g, "''")}';`,
        FUNCTION: (schema: string, name: string, args: string, comment: string) => 
            `COMMENT ON FUNCTION ${schema}.${name}(${args}) IS '${comment.replace(/'/g, "''")}';`,
        TYPE: (schema: string, name: string, comment: string) => 
            `COMMENT ON TYPE ${schema}.${name} IS '${comment.replace(/'/g, "''")}';`
    }
};

/**
 * Markdown formatting utilities
 */
export const MarkdownUtils = {
    /**
     * Create an info box
     */
    infoBox: (message: string, title: string = 'Note'): string => 
        `<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ ${title}:</strong> ${message}
</div>`,

    /**
     * Create a warning box
     */
    warningBox: (message: string, title: string = 'Warning'): string => 
        `<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>⚠️ ${title}:</strong> ${message}
</div>`,

    /**
     * Create a danger/caution box
     */
    dangerBox: (message: string, title: string = 'DANGER'): string => 
        `<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>🛑 ${title}:</strong> ${message}
</div>`,

    /**
     * Create a success/tip box
     */
    successBox: (message: string, title: string = 'Tip'): string => 
        `<div style="font-size: 12px; background-color: #2d3e30; border-left: 3px solid #2ecc71; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>💡 ${title}:</strong> ${message}
</div>`,

    /**
     * Create a simple operations table
     */
    operationsTable: (operations: Array<{operation: string, description: string, riskLevel?: string}>): string => {
        const rows = operations.map(op => {
            const risk = op.riskLevel ? `<td>${op.riskLevel}</td>` : '';
            return `    <tr><td><strong>${op.operation}</strong></td><td>${op.description}</td>${risk}</tr>`;
        }).join('\n');
        
        const headers = operations[0]?.riskLevel 
            ? '<tr><th style="text-align: left;">Operation</th><th style="text-align: left;">Description</th><th style="text-align: left;">Risk Level</th></tr>'
            : '<tr><th style="text-align: left;">Operation</th><th style="text-align: left;">Description</th></tr>';

        return `<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    ${headers}
${rows}
</table>`;
    },

    /**
     * Create a properties table
     */
    propertiesTable: (properties: Record<string, string>): string => {
        const rows = Object.entries(properties).map(([key, value]) => 
            `    <tr><td><strong>${key}</strong></td><td>${value}</td></tr>`
        ).join('\n');

        return `<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left; width: 30%;">Property</th><th style="text-align: left;">Value</th></tr>
${rows}
</table>`;
    },

    /**
     * Create a header for notebook pages
     */
    header: (title: string, subtitle?: string): string => {
        const sub = subtitle ? `\n\n${subtitle}` : '';
        return `### ${title}${sub}\n\n`;
    }
};

/**
 * Object kind/type utilities
 */
export const ObjectUtils = {
    /**
     * Get icon/label for PostgreSQL object kind
     */
    getKindLabel: (kind: string): string => {
        const labels: Record<string, string> = {
            'r': '📊 Table',
            'v': '👁️ View',
            'm': '💾 Materialized View',
            'i': '🔍 Index',
            'S': '🔢 Sequence',
            'f': '🌍 Foreign Table',
            'p': '📂 Partitioned Table',
            's': '⚙️ Special',
            'c': '🔗 Composite Type',
            'e': '🏷️ Enum Type',
            't': '📑 TOAST Table'
        };
        return labels[kind] || kind;
    },

    /**
     * Get icon for constraint type
     */
    getConstraintIcon: (type: string): string => {
        const icons: Record<string, string> = {
            'PRIMARY KEY': '🔑',
            'FOREIGN KEY': '🔗',
            'UNIQUE': '⭐',
            'CHECK': '✓',
            'EXCLUSION': '⊗'
        };
        return icons[type] || '📌';
    },

    /**
     * Get icon for index type
     */
    getIndexIcon: (isPrimary: boolean, isUnique: boolean): string => {
        if (isPrimary) return '🔑';
        if (isUnique) return '⭐';
        return '🔍';
    }
};

/**
 * Helper to create a simple notebook with one SQL cell
 */
export async function createSimpleNotebook(
    item: DatabaseTreeItem,
    title: string,
    sql: string,
    markdownContent?: string
): Promise<void> {
    const connection = await getConnectionWithPassword(item.connectionId!);
    const metadata = createMetadata(connection, item.databaseName);

    const defaultMarkdown = MarkdownUtils.header(title, `\`${item.schema}.${item.label}\``);

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
}

/**
 * Helper to create a notebook with multiple sections
 */
export async function createMultiSectionNotebook(
    item: DatabaseTreeItem,
    sections: Array<{
        title: string;
        markdown?: string;
        sql: string;
    }>
): Promise<void> {
    const connection = await getConnectionWithPassword(item.connectionId!);
    const metadata = createMetadata(connection, item.databaseName);

    const cells: vscode.NotebookCellData[] = [];

    sections.forEach(section => {
        if (section.title) {
            cells.push(
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ${section.title}`,
                    'markdown'
                )
            );
        }

        if (section.markdown) {
            cells.push(
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    section.markdown,
                    'markdown'
                )
            );
        }

        cells.push(
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                section.sql,
                'sql'
            )
        );
    });

    await createAndShowNotebook(cells, metadata);
}

/**
 * Common SQL query builders
 */
export const QueryBuilder = {
    /**
     * Build object information query
     */
    objectInfo: (objectType: 'table' | 'view' | 'function' | 'type', schema: string, name: string): string => {
        const queries = {
            table: `SELECT * FROM information_schema.tables WHERE table_schema = '${schema}' AND table_name = '${name}';`,
            view: `SELECT * FROM information_schema.views WHERE table_schema = '${schema}' AND table_name = '${name}';`,
            function: `SELECT * FROM information_schema.routines WHERE routine_schema = '${schema}' AND routine_name = '${name}';`,
            type: `SELECT * FROM information_schema.user_defined_types WHERE user_defined_type_schema = '${schema}' AND user_defined_type_name = '${name}';`
        };
        return queries[objectType];
    },

    /**
     * Build privileges query
     */
    privileges: (schema: string, objectName: string): string => 
        `SELECT 
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges
WHERE table_schema = '${schema}' 
    AND table_name = '${objectName}'
ORDER BY grantee, privilege_type;`,

    /**
     * Build dependencies query
     */
    dependencies: (schema: string, objectName: string): string => 
        `SELECT DISTINCT
    dependent_ns.nspname as schema,
    dependent_view.relname as name,
    dependent_view.relkind as kind
FROM pg_depend
JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid
JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
WHERE pg_depend.refobjid = '${schema}.${objectName}'::regclass
AND dependent_view.relname != '${objectName}'
ORDER BY schema, name;`
};

/**
 * Format helpers for displaying data
 */
export const FormatHelpers = {
    /**
     * Format bytes to human readable
     */
    formatBytes: (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    },

    /**
     * Format boolean to yes/no with icons
     */
    formatBoolean: (value: boolean, trueText: string = 'Yes', falseText: string = 'No'): string => {
        return value ? `✅ ${trueText}` : `🚫 ${falseText}`;
    },

    /**
     * Escape SQL string literals
     */
    escapeSqlString: (str: string): string => {
        return str.replace(/'/g, "''");
    },

    /**
     * Format array for display
     */
    formatArray: (arr: any[], emptyText: string = '—'): string => {
        return arr && arr.length > 0 ? arr.join(', ') : emptyText;
    }
};

/**
 * Validation helpers
 */
export const ValidationHelpers = {
    /**
     * Validate column name
     */
    validateColumnName: (value: string): string | null => {
        if (!value) return 'Column name cannot be empty';
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
            return 'Invalid column name. Use only letters, numbers, and underscores.';
        }
        return null;
    },

    /**
     * Validate identifier (table, view, function name, etc.)
     */
    validateIdentifier: (value: string, objectType: string = 'object'): string | null => {
        if (!value) return `${objectType} name cannot be empty`;
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
            return `Invalid ${objectType} name. Use only letters, numbers, and underscores.`;
        }
        return null;
    }
};

/**
 * Common maintenance operations
 */
export const MaintenanceTemplates = {
    vacuum: (schema: string, table: string): string => 
        `-- Vacuum table\nVACUUM (VERBOSE, ANALYZE) ${schema}.${table};`,
    
    analyze: (schema: string, table: string): string => 
        `-- Analyze table\nANALYZE VERBOSE ${schema}.${table};`,
    
    reindex: (schema: string, table: string): string => 
        `-- Reindex table\nREINDEX TABLE ${schema}.${table};`,
    
    vacuumFull: (schema: string, table: string): string => 
        `-- Vacuum full (locks table)\nVACUUM FULL ${schema}.${table};`
};

/**
 * Common error handling patterns
 */
export const ErrorHandlers = {
    /**
     * Show error with optional action button
     */
    showError: async (message: string, actionLabel?: string, actionCommand?: string): Promise<void> => {
        if (actionLabel && actionCommand) {
            const selection = await vscode.window.showErrorMessage(message, actionLabel);
            if (selection === actionLabel) {
                await vscode.commands.executeCommand(actionCommand);
            }
        } else {
            vscode.window.showErrorMessage(message);
        }
    },

    /**
     * Standard error handler for command operations
     */
    handleCommandError: async (err: any, operation: string): Promise<void> => {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to ${operation}: ${message}`);
    }
};

/**
 * String cleaning utilities
 */
export const StringUtils = {
    /**
     * Remove markdown code blocks from response
     */
    cleanMarkdownCodeBlocks: (text: string): string => {
        return text
            .replace(/^```sql\n/, '')
            .replace(/^```\n/, '')
            .replace(/\n```$/, '');
    },

    /**
     * Truncate string with ellipsis
     */
    truncate: (text: string, maxLength: number): string => {
        return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    }
};
