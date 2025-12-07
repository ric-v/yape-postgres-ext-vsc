/**
 * SQL Templates for Type Operations
 */

export const TypeSQL = {
    /**
     * View type information
     */
    info: (schema: string, typeName: string) =>
        `-- View type information
SELECT 
    t.typname as type_name,
    n.nspname as schema_name,
    pg_get_userbyid(t.typowner) as owner,
    CASE t.typtype
        WHEN 'c' THEN 'composite'
        WHEN 'e' THEN 'enum'
        WHEN 'r' THEN 'range'
        ELSE t.typtype::text
    END as type_category,
    obj_description(t.oid) as comment
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typname = '${typeName}' AND n.nspname = '${schema}';`,

    /**
     * Add value to enum
     */
    addEnumValue: (schema: string, typeName: string) =>
        `-- Add value to enum type
ALTER TYPE "${schema}"."${typeName}" ADD VALUE 'new_value';`,

    /**
     * Add attribute to composite
     */
    addAttribute: (schema: string, typeName: string) =>
        `-- Add attribute to composite type
ALTER TYPE "${schema}"."${typeName}" ADD ATTRIBUTE new_attribute_name data_type;`,

    /**
     * Rename type
     */
    rename: (schema: string, typeName: string) =>
        `-- Rename type
ALTER TYPE "${schema}"."${typeName}" RENAME TO new_type_name;`,

    /**
     * Find type usage
     */
    findUsage: (schema: string, typeName: string) =>
        `-- Find columns using this type
SELECT 
    n.nspname as schema_name,
    c.relname as table_name,
    a.attname as column_name
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_type t ON t.oid = a.atttypid
WHERE t.typname = '${typeName}' AND n.nspname = '${schema}';`,

    /**
     * Drop type
     */
    drop: (schema: string, typeName: string) =>
        `-- Drop type
DROP TYPE "${schema}"."${typeName}";

-- Drop type and dependent objects
-- DROP TYPE "${schema}"."${typeName}" CASCADE;`,

    /**
     * CREATE TYPE templates
     */
    create: {
        composite: (schema: string) =>
            `-- Create new composite type
CREATE TYPE ${schema}.type_name AS (
    field1 text,
    field2 integer
);

-- Add comment
COMMENT ON TYPE ${schema}.type_name IS 'Type description';`,

        enum: (schema: string) =>
            `-- Create an enum type
CREATE TYPE ${schema}.status_enum AS ENUM (
    'active',
    'inactive',
    'pending'
);

-- Add comment
COMMENT ON TYPE ${schema}.status_enum IS 'Enum for status values';`
    },

    /**
     * Edit type (drop and recreate)
     */
    edit: (schema: string, typeName: string, fields: string) =>
        `-- Drop existing type
DROP TYPE IF EXISTS ${schema}.${typeName} CASCADE;

-- Create type with new definition
CREATE TYPE ${schema}.${typeName} AS (
${fields}
);`
};
