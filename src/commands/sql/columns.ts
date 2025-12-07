/**
 * SQL Templates for Column Operations
 */

export const ColumnSQL = {
    /**
     * SELECT statement for a specific column
     */
    select: (schema: string, table: string, column: string, limit: number = 100) =>
        `-- Select column
SELECT ${column}
FROM ${schema}.${table}
LIMIT ${limit};`,

    /**
     * Column statistics query
     */
    statistics: (schema: string, table: string, column: string) =>
        `-- Column statistics (run ANALYZE first if no data)
SELECT 
    n_distinct,
    null_frac,
    avg_width,
    correlation
FROM pg_stats
WHERE schemaname = '${schema}' 
    AND tablename = '${table}' 
    AND attname = '${column}';`,

    /**
     * Detailed column statistics with percentages
     */
    detailedStatistics: (schema: string, table: string, column: string) =>
        `-- View column statistics
SELECT 
    schemaname,
    tablename,
    attname as column_name,
    n_distinct,
    ROUND((null_frac * 100)::numeric, 2) as null_percentage,
    avg_width as avg_bytes,
    ROUND(correlation::numeric, 4) as correlation
FROM pg_stats
WHERE schemaname = '${schema}' 
    AND tablename = '${table}' 
    AND attname = '${column}';

-- Get most common values and their frequencies
SELECT 
    attname as column_name,
    most_common_vals as common_values,
    most_common_freqs as frequencies
FROM pg_stats
WHERE schemaname = '${schema}' 
    AND tablename = '${table}' 
    AND attname = '${column}';

-- Refresh statistics
-- ANALYZE ${schema}.${table};`,

    /**
     * WHERE clause templates for filtering
     */
    whereTemplates: (schema: string, table: string, column: string) =>
        `-- Exact match
SELECT * FROM ${schema}.${table}
WHERE ${column} = 'value';

-- Multiple values
SELECT * FROM ${schema}.${table}
WHERE ${column} IN ('value1', 'value2', 'value3');

-- Range query
SELECT * FROM ${schema}.${table}
WHERE ${column} BETWEEN 'start' AND 'end';

-- Pattern matching (for text columns)
SELECT * FROM ${schema}.${table}
WHERE ${column} LIKE '%pattern%';

-- NULL check
SELECT * FROM ${schema}.${table}
WHERE ${column} IS NULL;

-- NOT NULL check
SELECT * FROM ${schema}.${table}
WHERE ${column} IS NOT NULL;`,

    /**
     * ALTER COLUMN templates
     */
    alter: (schema: string, table: string, column: string) =>
        `-- Change data type
ALTER TABLE ${schema}.${table}
    ALTER COLUMN ${column} TYPE varchar(255);

-- Set NOT NULL constraint
ALTER TABLE ${schema}.${table}
    ALTER COLUMN ${column} SET NOT NULL;

-- Drop NOT NULL constraint
ALTER TABLE ${schema}.${table}
    ALTER COLUMN ${column} DROP NOT NULL;

-- Set default value
ALTER TABLE ${schema}.${table}
    ALTER COLUMN ${column} SET DEFAULT 'default_value';

-- Drop default value
ALTER TABLE ${schema}.${table}
    ALTER COLUMN ${column} DROP DEFAULT;

-- Multiple changes in one statement
ALTER TABLE ${schema}.${table}
    ALTER COLUMN ${column} TYPE integer USING ${column}::integer,
    ALTER COLUMN ${column} SET NOT NULL,
    ALTER COLUMN ${column} SET DEFAULT 0;`,

    /**
     * DROP COLUMN template
     */
    drop: (schema: string, table: string, column: string) =>
        `-- Drop column (safe - fails if dependencies exist)
ALTER TABLE ${schema}.${table}
    DROP COLUMN ${column};

-- Drop column with CASCADE (removes all dependent objects)
-- ALTER TABLE ${schema}.${table}
    -- DROP COLUMN ${column} CASCADE;

-- Drop only if exists
-- ALTER TABLE ${schema}.${table}
    -- DROP COLUMN IF EXISTS ${column};`,

    /**
     * RENAME COLUMN template
     */
    rename: (schema: string, table: string, oldName: string, newName: string) =>
        `-- Rename column from '${oldName}' to '${newName}'
ALTER TABLE ${schema}.${table}
    RENAME COLUMN ${oldName} TO ${newName};`,

    /**
     * CREATE INDEX on column templates
     */
    createIndex: (schema: string, table: string, column: string, indexName: string) =>
        `-- Basic index (B-tree)
CREATE INDEX ${indexName} 
ON ${schema}.${table} (${column});

-- Unique index (prevents duplicate values)
-- CREATE UNIQUE INDEX ${indexName} 
-- ON ${schema}.${table} (${column});

-- Concurrent index (doesn't lock table, slower creation)
-- CREATE INDEX CONCURRENTLY ${indexName} 
-- ON ${schema}.${table} (${column});

-- Index with specific method
-- CREATE INDEX ${indexName} 
-- ON ${schema}.${table} USING btree (${column});

-- Partial index (index only matching rows)
-- CREATE INDEX ${indexName} 
-- ON ${schema}.${table} (${column}) 
-- WHERE ${column} IS NOT NULL;

-- Index with sorting and null handling
-- CREATE INDEX ${indexName} 
-- ON ${schema}.${table} (${column} DESC NULLS LAST);

-- Functional/expression index
-- CREATE INDEX ${indexName} 
-- ON ${schema}.${table} (LOWER(${column}));`,

    /**
     * ADD COLUMN templates
     */
    add: {
        basic: (schema: string, table: string) =>
            `-- Add a basic column
ALTER TABLE "${schema}"."${table}"
ADD COLUMN new_column_name VARCHAR(255);`,

        withDefault: (schema: string, table: string) =>
            `-- Add column with NOT NULL constraint and default value
ALTER TABLE "${schema}"."${table}"
ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'active';`,

        timestamps: (schema: string, table: string) =>
            `-- Add created_at and updated_at timestamps
ALTER TABLE "${schema}"."${table}"
ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN updated_at TIMESTAMPTZ;`,

        withCheck: (schema: string, table: string) =>
            `-- Add column with inline CHECK constraint
ALTER TABLE "${schema}"."${table}"
ADD COLUMN priority INTEGER CHECK (priority >= 1 AND priority <= 10);`,

        foreignKey: (schema: string, table: string) =>
            `-- Add column with foreign key reference
ALTER TABLE "${schema}"."${table}"
ADD COLUMN category_id INTEGER REFERENCES ${schema}.categories(id) ON DELETE SET NULL;`,

        jsonb: (schema: string, table: string) =>
            `-- Add JSONB column (preferred over JSON for performance)
ALTER TABLE "${schema}"."${table}"
ADD COLUMN metadata JSONB DEFAULT '{}';`,

        uuid: (schema: string, table: string) =>
            `-- Add UUID column with auto-generation
-- Note: Requires uuid-ossp or pgcrypto extension
ALTER TABLE "${schema}"."${table}"
ADD COLUMN external_id UUID DEFAULT gen_random_uuid();`
    }
};
