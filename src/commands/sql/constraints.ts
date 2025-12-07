/**
 * SQL Templates for Constraint Operations
 */

export const ConstraintSQL = {
    /**
     * View constraint definition
     */
    definition: (schema: string, tableName: string, constraintName: string) =>
        `-- View constraint definition
SELECT pg_get_constraintdef(oid) as constraint_def
FROM pg_constraint
WHERE conname = '${constraintName}'
AND conrelid = '${schema}.${tableName}'::regclass;`,

    /**
     * View constraint details
     */
    details: (schema: string, constraintName: string) =>
        `-- View constraint details
SELECT * FROM information_schema.table_constraints 
WHERE constraint_name = '${constraintName}' 
    AND table_schema = '${schema}';`,

    /**
     * Validate constraint
     */
    validate: (schema: string, tableName: string, constraintName: string) =>
        `-- Validate constraint ${constraintName}
ALTER TABLE "${schema}"."${tableName}"
VALIDATE CONSTRAINT "${constraintName}";`,

    /**
     * Rename constraint
     */
    rename: (schema: string, tableName: string, constraintName: string) =>
        `-- Rename constraint
ALTER TABLE "${schema}"."${tableName}"
RENAME CONSTRAINT "${constraintName}" TO "${constraintName}_new";

-- Validate a NOT VALID constraint
ALTER TABLE "${schema}"."${tableName}"
VALIDATE CONSTRAINT "${constraintName}";`,

    /**
     * DROP CONSTRAINT
     */
    drop: (schema: string, tableName: string, constraintName: string) =>
        `-- Drop constraint
ALTER TABLE "${schema}"."${tableName}"
DROP CONSTRAINT "${constraintName}";`,

    /**
     * ADD CONSTRAINT templates
     */
    add: {
        primaryKey: (schema: string, tableName: string) =>
            `-- Add primary key constraint
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT ${tableName}_pkey PRIMARY KEY (id);

-- Composite primary key (multiple columns)
-- ALTER TABLE "${schema}"."${tableName}"
-- ADD CONSTRAINT ${tableName}_pkey PRIMARY KEY (column1, column2);`,

        foreignKey: (schema: string, tableName: string) =>
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

        unique: (schema: string, tableName: string) =>
            `-- Add unique constraint on single column
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT ${tableName}_email_unique UNIQUE (email);

-- Unique constraint on multiple columns (composite)
-- ALTER TABLE "${schema}"."${tableName}"
-- ADD CONSTRAINT ${tableName}_multi_unique UNIQUE (column1, column2);`,

        check: (schema: string, tableName: string) =>
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

        exclusion: (schema: string, tableName: string) =>
            `-- Prevent overlapping time ranges (requires btree_gist extension)
-- CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT ${tableName}_no_overlap 
    EXCLUDE USING gist (
        resource_id WITH =,
        tsrange(start_time, end_time) WITH &&
    );`,

        notNull: (schema: string, tableName: string) =>
            `-- Add NOT NULL constraint
ALTER TABLE "${schema}"."${tableName}"
ALTER COLUMN column_name SET NOT NULL;

-- Remove NOT NULL constraint
-- ALTER TABLE "${schema}"."${tableName}"
-- ALTER COLUMN column_name DROP NOT NULL;`,

        notValid: (schema: string, tableName: string) =>
            `-- Add constraint without validating existing data (faster, no lock)
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT ${tableName}_check_new
    CHECK (column_name IS NOT NULL) NOT VALID;

-- Later, validate existing data in background
ALTER TABLE "${schema}"."${tableName}"
VALIDATE CONSTRAINT ${tableName}_check_new;`
    },

    /**
     * Find constraint dependencies
     */
    dependencies: (schema: string, constraintName: string) =>
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
ORDER BY dependent_schema, dependent_object;`
};
