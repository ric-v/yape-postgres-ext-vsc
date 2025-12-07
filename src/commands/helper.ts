import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem, validateCategoryItem, validateRoleItem } from './connection';
import { ConnectionManager } from '../services/ConnectionManager';

export { validateItem, validateCategoryItem, validateRoleItem };

/**
 * Helper to get database connection and metadata
 */
export async function getDatabaseConnection(item: DatabaseTreeItem, validateFn: (item: DatabaseTreeItem) => void = validateItem) {
    validateFn(item);
    const connection = await getConnectionWithPassword(item.connectionId!);
    const client = await ConnectionManager.getInstance().getConnection({
        id: connection.id,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        database: item.databaseName,
        name: connection.name
    });
    const metadata = createMetadata(connection, item.databaseName);
    return { connection, client, metadata };
}

/**
 * Fluent Builder for Notebooks
 */
export class NotebookBuilder {
    private cells: vscode.NotebookCellData[] = [];

    constructor(private metadata: any) { }

    addMarkdown(content: string): NotebookBuilder {
        this.cells.push(new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, content, 'markdown'));
        return this;
    }

    addSql(content: string): NotebookBuilder {
        this.cells.push(new vscode.NotebookCellData(vscode.NotebookCellKind.Code, content, 'sql'));
        return this;
    }

    async show(): Promise<void> {
        await createAndShowNotebook(this.cells, this.metadata);
    }
}

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
        `<div style="font-size: 12px; background-color: rgba(52, 152, 219, 0.1); border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px; color: var(--vscode-editor-foreground);">
    <strong>ℹ️ ${title}:</strong> ${message}
</div>`,

    /**
     * Create a warning box
     */
    warningBox: (message: string, title: string = 'Warning'): string =>
        `<div style="font-size: 12px; background-color: rgba(231, 76, 60, 0.1); border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px; color: var(--vscode-editor-foreground);">
    <strong>⚠️ ${title}:</strong> ${message}
</div>`,

    /**
     * Create a danger/caution box
     */
    dangerBox: (message: string, title: string = 'DANGER'): string =>
        `<div style="font-size: 12px; background-color: rgba(231, 76, 60, 0.1); border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px; color: var(--vscode-editor-foreground);">
    <strong>🛑 ${title}:</strong> ${message}
</div>`,

    /**
     * Create a success/tip box
     */
    successBox: (message: string, title: string = 'Tip'): string =>
        `<div style="font-size: 12px; background-color: rgba(46, 204, 113, 0.1); border-left: 3px solid #2ecc71; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px; color: var(--vscode-editor-foreground);">
    <strong>💡 ${title}:</strong> ${message}
</div>`,

    /**
     * Create a simple operations table
     */
    operationsTable: (operations: Array<{ operation: string, description: string, riskLevel?: string }>): string => {
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
ORDER BY schema, name;`,

    /**
     * Build columns query
     */
    columns: (schema: string, table: string): string =>
        `SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = '${schema}'
AND table_name = '${table}'
ORDER BY ordinal_position;`,

    /**
     * Build table columns query (detailed)
     */
    tableColumns: (schema: string, table: string): string =>
        `SELECT 
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
WHERE table_schema = '${schema}' AND table_name = '${table}'
ORDER BY ordinal_position`,

    /**
     * Build detailed constraint information query
     */
    constraintDetails: (schema: string, table: string, constraint: string): string => `
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
            WHERE tc.constraint_name = '${constraint}'
                AND tc.table_schema = '${schema}'
                AND tc.table_name = '${table}'
            GROUP BY tc.constraint_name, tc.constraint_type, tc.table_schema, tc.table_name, 
                     tc.is_deferrable, tc.initially_deferred, cc.check_clause, con.oid
    `,

    /**
     * Build foreign key details query
     */
    foreignKeyDetails: (schema: string, constraint: string): string => `
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
            WHERE tc.constraint_name = '${constraint}'
                AND tc.table_schema = '${schema}'
            ORDER BY kcu.ordinal_position
    `,
    columnDetails: (schema: string, table: string, column: string): string => `
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
            WHERE c.table_schema = '${schema}' 
                AND c.table_name = '${table}' 
                AND c.column_name = '${column}'
    `,

    /**
     * Build table indexes query
     */
    tableIndexes: (schema: string, table: string): string =>
        `SELECT 
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
WHERE n.nspname = '${schema}' AND t.relname = '${table}'
GROUP BY i.relname, ix.indisunique, ix.indisprimary, i.oid
ORDER BY ix.indisprimary DESC, ix.indisunique DESC, i.relname`,

    /**
     * Build table constraints query
     */
    tableConstraints: (schema: string, table: string): string =>
        `SELECT 
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
WHERE tc.table_schema = '${schema}' AND tc.table_name = '${table}'
GROUP BY tc.constraint_name, tc.constraint_type, ccu.table_schema, ccu.table_name
ORDER BY tc.constraint_type, tc.constraint_name`,

    /**
     * Build table constraint definitions query
     */
    tableConstraintDefinitions: (schema: string, table: string): string =>
        `SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(c.oid) as definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = '${schema}' AND c.conrelid = '${schema}.${table}'::regclass
ORDER BY contype DESC, conname`,

    /**
     * Build table statistics query
     */
    tableStats: (schema: string, table: string): string =>
        `SELECT 
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
WHERE schemaname = '${schema}' AND relname = '${table}'`,

    /**
     * Build table size query
     */
    tableSize: (schema: string, table: string): string =>
        `SELECT 
    pg_size_pretty(pg_total_relation_size('${schema}.${table}'::regclass)) as total_size,
    pg_size_pretty(pg_relation_size('${schema}.${table}'::regclass)) as table_size,
    pg_size_pretty(pg_indexes_size('${schema}.${table}'::regclass)) as indexes_size,
    pg_size_pretty(pg_total_relation_size('${schema}.${table}'::regclass) - pg_relation_size('${schema}.${table}'::regclass)) as toast_size`,

    /**
     * Build table info query
     */
    tableInfo: (schema: string, table: string): string =>
        `SELECT 
    c.relname as table_name,
    n.nspname as schema_name,
    pg_catalog.pg_get_userbyid(c.relowner) as owner,
    obj_description(c.oid) as comment,
    c.reltuples::bigint as row_estimate,
    c.relpages as page_count,
    c.relhasindex as has_indexes,
    c.relispartition as is_partition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '${schema}' AND c.relname = '${table}'`,

    /**
     * Build view definition query
     */
    viewDefinition: (schema: string, view: string): string =>
        `SELECT pg_get_viewdef('${schema}.${view}'::regclass, true) as definition`,

    /**
     * Build view info query
     */
    viewInfo: (schema: string, view: string): string =>
        `SELECT 
    c.relname as view_name,
    n.nspname as schema_name,
    pg_catalog.pg_get_userbyid(c.relowner) as owner,
    obj_description(c.oid) as comment,
    c.reltuples::bigint as row_estimate
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '${schema}' AND c.relname = '${view}' AND c.relkind = 'v'`,

    /**
     * Build view size query
     */
    viewSize: (schema: string, view: string): string =>
        `SELECT 
    pg_size_pretty(pg_relation_size('${schema}.${view}'::regclass)) as view_size`,



    /**
     * Build type info query
     */
    typeInfo: (schema: string, type: string): string =>
        `SELECT 
    t.typname as type_name,
    n.nspname as schema_name,
    pg_catalog.pg_get_userbyid(t.typowner) as owner,
    obj_description(t.oid, 'pg_type') as description,
    CASE t.typtype
        WHEN 'c' THEN 'composite'
        WHEN 'e' THEN 'enum'
        WHEN 'r' THEN 'range'
        ELSE t.typtype::text
    END as type_type,
    a.attname,
    pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
    a.attnum as ordinal_position
FROM pg_type t
JOIN pg_roles r ON t.typowner = r.oid
JOIN pg_class c ON c.oid = t.typrelid
JOIN pg_attribute a ON a.attrelid = c.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typname = '${type}'
AND n.nspname = '${schema}'
AND a.attnum > 0
ORDER BY a.attnum`,

    /**
     * Build type fields query
     */
    typeFields: (schema: string, type: string): string =>
        `SELECT 
    t.typname,
    a.attname,
    pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type
FROM pg_type t
JOIN pg_class c ON c.oid = t.typrelid
JOIN pg_attribute a ON a.attrelid = c.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typname = '${type}'
AND n.nspname = '${schema}'
AND a.attnum > 0
ORDER BY a.attnum`,



    /**
     * Build role details query
     */
    roleDetails: (roleName: string): string =>
        `WITH RECURSIVE
role_memberships AS (
    SELECT 
        r.rolname,
        r.rolsuper,
        r.rolinherit,
        r.rolcreaterole,
        r.rolcreatedb,
        r.rolcanlogin,
        r.rolreplication,
        r.rolconnlimit,
        r.rolvaliduntil,
        r.rolbypassrls,
        (
            SELECT array_agg(gr.rolname)
            FROM pg_auth_members m
            JOIN pg_roles gr ON gr.oid = m.roleid
            WHERE m.member = r.oid
        ) as member_of,
        (
            SELECT array_agg(gr.rolname)
            FROM pg_auth_members m
            JOIN pg_roles gr ON gr.oid = m.member
            WHERE m.roleid = r.oid
        ) as members
    FROM pg_roles r
    WHERE r.rolname = '${roleName}'
),
role_privileges AS (
    SELECT array_agg(
        privilege_type || ' ON ' ||
        CASE 
            WHEN table_schema = 'public' THEN table_name
            ELSE table_schema || '.' || table_name
        END
    ) as privileges
    FROM information_schema.table_privileges
    WHERE grantee = '${roleName}'
    GROUP BY grantee
),
database_access AS (
    SELECT array_agg(quote_ident(d.datname)) as databases
    FROM pg_database d
    JOIN pg_roles r ON r.rolname = '${roleName}'
    WHERE EXISTS (
        SELECT 1 FROM aclexplode(d.datacl) acl
        WHERE acl.grantee = r.oid
        AND acl.privilege_type = 'CONNECT'
    )
)
SELECT
    rm.*,
    COALESCE(rp.privileges, ARRAY[]::text[]) as privileges,
    COALESCE(da.databases, ARRAY[]::text[]) as accessible_databases
FROM role_memberships rm
LEFT JOIN role_privileges rp ON true
LEFT JOIN database_access da ON true`,

    /**
     * Build role attributes query
     */
    roleAttributes: (roleName: string): string =>
        `SELECT 
    r.rolname,
    r.rolsuper,
    r.rolinherit,
    r.rolcreaterole,
    r.rolcreatedb,
    r.rolcanlogin,
    r.rolreplication,
    r.rolconnlimit,
    r.rolvaliduntil,
    r.rolbypassrls,
    pg_catalog.shobj_description(r.oid, 'pg_authid') as description
FROM pg_roles r
WHERE r.rolname = '${roleName}'`,

    /**
     * Build function info query
     */
    functionInfo: (schema: string, name: string): string =>
        `SELECT p.proname,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result_type,
    pg_get_functiondef(p.oid) as definition,
    d.description
FROM pg_proc p
LEFT JOIN pg_description d ON p.oid = d.objoid
WHERE p.proname = '${name}'
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')`,

    /**
     * Build function definition query
     */
    functionDefinition: (schema: string, name: string): string =>
        `SELECT pg_get_functiondef(p.oid) as definition
FROM pg_proc p
WHERE p.proname = '${name}'
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')`,

    /**
     * Build function signature query
     */
    functionSignature: (schema: string, name: string): string =>
        `SELECT p.proname,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result_type,
    d.description
FROM pg_proc p
LEFT JOIN pg_description d ON p.oid = d.objoid
WHERE p.proname = '${name}'
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')`,

    /**
     * Build function arguments query
     */
    functionArguments: (schema: string, name: string): string =>
        `SELECT pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
WHERE p.proname = '${name}'
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')`,

    /**
     * Build schema info query
     */
    schemaInfo: (schema: string): string =>
        `SELECT
    n.nspname as schema_name,
    pg_catalog.pg_get_userbyid(n.nspowner) as owner,
    pg_size_pretty(sum(pg_total_relation_size(quote_ident(pg_tables.schemaname) || '.' || quote_ident(tablename))):: bigint) as total_size,
    count(distinct tablename) as tables_count,
    count(distinct viewname) as views_count,
    count(distinct routines.routine_name) as functions_count,
    array_agg(distinct format(
        E'%s ON %s TO %s',
        p.privilege_type,
        p.table_schema,
        p.grantee
    )) as privileges
FROM pg_catalog.pg_namespace n
LEFT JOIN pg_tables ON pg_tables.schemaname = n.nspname
LEFT JOIN pg_views ON pg_tables.schemaname = n.nspname
LEFT JOIN information_schema.routines ON routine_schema = n.nspname
LEFT JOIN information_schema.table_privileges p ON p.table_schema = n.nspname
WHERE n.nspname = '${schema}'
GROUP BY n.nspname, n.nspowner`,

    /**
     * Build schema details query
     */
    schemaDetails: (schema: string): string =>
        `SELECT 
    n.nspname as schema_name,
    pg_catalog.pg_get_userbyid(n.nspowner) as owner,
    obj_description(n.oid, 'pg_namespace') as comment,
    n.nspacl as acl
FROM pg_catalog.pg_namespace n
WHERE n.nspname = '${schema}'`,

    /**
     * Build schema object counts query
     */
    schemaObjectCounts: (schema: string): string =>
        `SELECT 
    COUNT(*) FILTER (WHERE c.relkind = 'r') as table_count,
    COUNT(*) FILTER (WHERE c.relkind = 'v') as view_count,
    COUNT(*) FILTER (WHERE c.relkind = 'm') as matview_count,
    COUNT(*) FILTER (WHERE c.relkind = 'S') as sequence_count,
    COUNT(*) FILTER (WHERE c.relkind = 'f') as foreign_table_count,
    COUNT(*) FILTER (WHERE c.relkind = 'p') as partitioned_table_count,
    (SELECT COUNT(*) FROM pg_proc p WHERE p.pronamespace = n.oid) as function_count,
    (SELECT COUNT(*) FROM pg_type t WHERE t.typnamespace = n.oid AND t.typtype = 'c') as type_count,
    (SELECT COUNT(*) FROM pg_trigger t 
     JOIN pg_class tc ON t.tgrelid = tc.oid 
     WHERE tc.relnamespace = n.oid AND NOT t.tgisinternal) as trigger_count
FROM pg_namespace n
LEFT JOIN pg_class c ON c.relnamespace = n.oid
WHERE n.nspname = '${schema}'
GROUP BY n.oid`,

    /**
     * Build schema size query
     */
    schemaSize: (schema: string): string =>
        `SELECT 
    pg_size_pretty(sum(pg_total_relation_size(c.oid))) as total_size,
    pg_size_pretty(sum(pg_relation_size(c.oid))) as table_size,
    pg_size_pretty(sum(pg_indexes_size(c.oid))) as indexes_size,
    count(distinct c.oid) as relation_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '${schema}' AND c.relkind IN ('r', 'i', 'm', 'S', 't')`,

    /**
     * Build schema privileges query
     */
    schemaPrivileges: (schema: string): string =>
        `SELECT 
    grantee,
    string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) as privileges,
    string_agg(DISTINCT 
        CASE WHEN is_grantable = 'YES' THEN privilege_type || ' (grantable)' END, 
        ', ') as grantable_privileges
FROM (
    SELECT DISTINCT grantee, privilege_type, is_grantable
    FROM information_schema.table_privileges
    WHERE table_schema = '${schema}'
    UNION
    SELECT DISTINCT grantee, privilege_type, is_grantable
    FROM information_schema.routine_privileges
    WHERE routine_schema = '${schema}'
    UNION
    SELECT DISTINCT grantee, privilege_type, is_grantable
    FROM information_schema.usage_privileges
    WHERE object_schema = '${schema}'
) p
GROUP BY grantee
ORDER BY grantee`,

    /**
     * Build schema extensions query
     */
    schemaExtensions: (schema: string): string =>
        `SELECT 
    e.extname as extension_name,
    e.extversion as version,
    pg_catalog.pg_get_userbyid(e.extowner) as owner
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE n.nspname = '${schema}'`,

    /**
     * Build schema dependencies query
     */
    schemaDependencies: (schema: string): string =>
        `SELECT 
    c.relname as object_name,
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'S' THEN 'sequence'
        WHEN 'f' THEN 'foreign table'
        WHEN 'p' THEN 'partitioned table'
    END as object_type,
    pg_size_pretty(pg_total_relation_size(c.oid)) as size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '${schema}' 
AND c.relkind IN ('r', 'v', 'm', 'S', 'f', 'p')
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 10`,

    /**
     * Build schema all objects query
     */
    schemaAllObjects: (schema: string): string =>
        `SELECT 
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'i' THEN 'index'
        WHEN 'S' THEN 'sequence'
        WHEN 's' THEN 'special'
        WHEN 'f' THEN 'foreign table'
        WHEN 'p' THEN 'partitioned table'
    END as object_type,
    c.relname as object_name,
    pg_size_pretty(pg_total_relation_size(quote_ident('${schema}') || '.' || quote_ident(c.relname))) as size,
    CASE WHEN c.relkind = 'r' THEN
        (SELECT reltuples::bigint FROM pg_class WHERE oid = c.oid)
    ELSE NULL END as estimated_row_count,
    pg_catalog.pg_get_userbyid(c.relowner) as owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '${schema}'
    AND c.relkind IN ('r', 'v', 'm', 'S', 'f', 'p')
ORDER BY pg_total_relation_size(c.oid) DESC NULLS LAST`,

    /**
     * Build extension objects query
     */
    extensionObjects: (extensionName: string): string =>
        `SELECT * FROM pg_catalog.pg_depend d
    JOIN pg_catalog.pg_extension e ON d.refobjid = e.oid
    JOIN pg_catalog.pg_class c ON d.objid = c.oid
    WHERE e.extname = '${extensionName}'
    AND d.deptype = 'e'`,

    /**
     * Build foreign table info query
     */
    foreignTableInfo: (schema: string, table: string): string =>
        `SELECT 
    c.column_name,
    c.data_type,
    c.is_nullable,
    c.column_default,
    fs.srvname as server_name,
    fto.ftoptions as options
FROM information_schema.columns c
JOIN pg_class pc ON pc.relname = c.table_name
JOIN pg_foreign_table ft ON ft.ftrelid = pc.oid
JOIN pg_foreign_server fs ON fs.oid = ft.ftserver
LEFT JOIN pg_foreign_table_options fto ON fto.ftrelid = ft.ftrelid
WHERE c.table_schema = '${schema}'
AND c.table_name = '${table}'
ORDER BY c.ordinal_position`,

    /**
     * Build foreign table definition query
     */
    foreignTableDefinition: (schema: string, table: string): string =>
        `SELECT 
    c.relname as table_name,
    fs.srvname as server_name,
    array_agg(
        format('%I %s%s', 
            a.attname, 
            format_type(a.atttypid, a.atttypmod),
            CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
        ) ORDER BY a.attnum
    ) as columns,
    ftoptions as options
FROM pg_class c
JOIN pg_foreign_table ft ON c.oid = ft.ftrelid
JOIN pg_foreign_server fs ON fs.oid = ft.ftserver
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
LEFT JOIN pg_foreign_table_options fto ON fto.ftrelid = ft.ftrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = '${table}'
AND n.nspname = '${schema}'
GROUP BY c.relname, fs.srvname, ftoptions`,

    /**
     * Build materialized view info query
     */
    matViewInfo: (schema: string, view: string): string =>
        `SELECT pg_get_viewdef('${schema}.${view}'::regclass, true) as definition,
       schemaname,
       matviewname,
       matviewowner,
       tablespace,
       hasindexes,
       ispopulated,
       pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, matviewname))) as size
FROM pg_matviews
WHERE schemaname = '${schema}' AND matviewname = '${view}'`,

    /**
     * Build materialized view definition query
     */
    matViewDefinition: (schema: string, view: string): string =>
        `SELECT pg_get_viewdef('${schema}.${view}'::regclass, true) as definition
FROM pg_matviews
WHERE schemaname = '${schema}' AND matviewname = '${view}'`,

    /**
     * Build materialized view stats query
     */
    matViewStats: (schema: string, view: string): string =>
        `SELECT 
    n_live_tup as live_tuples,
    n_dead_tup as dead_tuples,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = '${schema}' AND relname = '${view}'`,

    /**
     * Build object dependencies query
     */
    objectDependencies: (schema: string, name: string): string =>
        `SELECT DISTINCT
    dependent_ns.nspname as schema,
    dependent_view.relname as name,
    dependent_view.relkind as kind
FROM pg_depend 
JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid 
JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid 
JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
WHERE pg_depend.refobjid = '${schema}.${name}'::regclass
AND dependent_view.relname != '${name}'
ORDER BY schema, name`,

    /**
     * Build object references query
     */
    objectReferences: (schema: string, name: string): string =>
        `SELECT DISTINCT
    ref_nsp.nspname as schema,
    ref_class.relname as name,
    ref_class.relkind as kind
FROM pg_depend dep
JOIN pg_rewrite rew ON dep.objid = rew.oid
JOIN pg_class ref_class ON dep.refobjid = ref_class.oid
JOIN pg_namespace ref_nsp ON ref_nsp.oid = ref_class.relnamespace
WHERE rew.ev_class = '${schema}.${name}'::regclass
AND ref_class.relname != '${name}'
AND ref_class.relkind IN ('r', 'v', 'm')
ORDER BY schema, name`,

    /**
     * Build database statistics query
     */
    databaseStats: (): string =>
        `SELECT 
    d.datname as "Database",
    pg_size_pretty(pg_database_size(d.datname)) as "Size",
    u.usename as "Owner",
    (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as "Active Connections",
    (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('pg_catalog', 'information_schema')) as "Schemas",
    (SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as "Tables",
    (SELECT count(*) FROM pg_roles) as "Roles"
FROM pg_database d
JOIN pg_user u ON d.datdba = u.usesysid
WHERE d.datname = current_database()`,

    /**
     * Build database schema sizes query
     */
    databaseSchemaSizes: (): string =>
        `SELECT 
    pg_tables.schemaname as schema_name,
    pg_total_relation_size(pg_tables.schemaname || '.' || tablename) as table_size
FROM pg_tables
WHERE pg_tables.schemaname NOT IN ('pg_catalog', 'information_schema')`,

    /**
     * Build database schema size summary query
     */
    databaseSchemaSizeSummary: (): string =>
        `SELECT schema_name,
       pg_size_pretty(sum(table_size)::bigint) as "Size",
       count(table_name) as "Tables"
FROM (
    SELECT pg_tables.schemaname as schema_name,
           tablename as table_name,
           pg_total_relation_size(pg_tables.schemaname || '.' || tablename) as table_size
    FROM pg_tables
) t
GROUP BY schema_name
ORDER BY sum(table_size) DESC`,

    /**
     * Build database maintenance stats query
     */
    databaseMaintenanceStats: (): string =>
        `SELECT 
    schemaname || '.' || relname as "Table",
    n_dead_tup as "Dead Tuples",
    n_live_tup as "Live Tuples",
    last_vacuum as "Last Vacuum",
    last_autovacuum as "Last Auto Vacuum",
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) as "Total Size"
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY n_dead_tup DESC
LIMIT 20`,

    /**
     * Build database configuration query
     */
    databaseConfiguration: (): string =>
        `SELECT 
    name as "Setting",
    setting as "Value",
    unit as "Unit",
    category as "Category",
    short_desc as "Description"
FROM pg_settings 
ORDER BY category, name`,

    /**
     * Build database memory settings query
     */
    databaseMemorySettings: (): string =>
        `SELECT 
    name as "Setting",
    setting as "Value",
    unit as "Unit",
    short_desc as "Description"
FROM pg_settings 
WHERE category LIKE '%Memory%' OR name LIKE '%memory%' OR name LIKE '%buffer%'
ORDER BY name`,

    /**
     * Build database connection settings query
     */
    databaseConnectionSettings: (): string =>
        `SELECT 
    name as "Setting",
    setting as "Value",
    unit as "Unit",
    short_desc as "Description"
FROM pg_settings 
WHERE category LIKE '%Connection%' OR name LIKE '%connection%'
ORDER BY name`,

    /**
     * Build database active connections query
     */
    databaseActiveConnections: (): string =>
        `SELECT pid as "Process ID",
       usename as "User",
       datname as "Database",
       client_addr as "Client Address",
       application_name as "Application",
       state as "State",
       query as "Last Query",
       backend_start as "Connected Since"
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY backend_start`,

    /**
     * Build database extensions query
     */
    databaseExtensions: (): string =>
        `SELECT name as "Extension",
       default_version as "Default Version",
       installed_version as "Installed Version",
       comment as "Description"
FROM pg_available_extensions
WHERE installed_version IS NOT NULL
ORDER BY name`,

    /**
     * Build database roles query
     */
    databaseRoles: (): string =>
        `SELECT 
    r.rolname as "Role",
    r.rolsuper as "Superuser",
    r.rolcreatedb as "Create DB",
    r.rolcreaterole as "Create Role",
    r.rolcanlogin as "Can Login",
    r.rolconnlimit as "Connection Limit",
    r.rolvaliduntil as "Valid Until"
FROM pg_roles r
ORDER BY r.rolname`,

    /**
     * Build terminate connections query
     */
    databaseTerminateConnections: (databaseName?: string): string => {
        const dbFilter = databaseName ? `WHERE datname = '${databaseName}'` : `WHERE datname = current_database()`;
        return `SELECT format(
    'SELECT pg_terminate_backend(%s) /* %s %s %s */;',
    pid,
    usename,
    application_name,
    query
)
FROM pg_stat_activity
${dbFilter}
AND pid <> pg_backend_pid();`;
    },

    /**
     * Build terminate connections by PID query
     */
    terminateConnectionsByPid: (databaseName: string): string =>
        `SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${databaseName}'
  AND pid <> pg_backend_pid();`
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
    },

    /**
     * Format number with commas
     */
    formatNumber: (num: number): string => {
        return num.toLocaleString();
    },

    /**
     * Format percentage
     */
    formatPercentage: (num: number): string => {
        return `${num}%`;
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
        `-- Vacuum full (locks table)\nVACUUM FULL ${schema}.${table};`,

    vacuumAnalyzeDatabase: (): string =>
        `-- Vacuum and update statistics (safe, non-blocking)\nVACUUM (VERBOSE, ANALYZE);`,

    reindexDatabase: (databaseName: string): string =>
        `-- Reindex entire database (locks tables during rebuild)\n-- REINDEX DATABASE "${databaseName}";`
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
