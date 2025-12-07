/**
 * SQL Templates for View Operations
 */

export const ViewSQL = {
    /**
     * SELECT from view
     */
    select: (schema: string, view: string, limit: number = 100) =>
        `SELECT * FROM ${schema}.${view} LIMIT ${limit};`,

    /**
     * View columns information
     */
    columns: (schema: string, view: string) =>
        `-- View columns
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = '${schema}'
  AND table_name = '${view}'
ORDER BY ordinal_position;`,

    /**
     * View data with limit
     */
    viewData: (schema: string, view: string) =>
        `-- View data
SELECT *
    FROM ${schema}.${view}
LIMIT 100;`,

    /**
     * Query with filters template
     */
    queryWithFilters: (schema: string, view: string) =>
        `-- Query with filters
SELECT *
FROM ${schema}.${view}
WHERE condition = value
ORDER BY column_name
LIMIT 100;`,

    /**
     * Query with aggregation template
     */
    queryWithAggregation: (schema: string, view: string) =>
        `-- Query with aggregation
SELECT 
    column_name,
    COUNT(*) as count,
    AVG(numeric_column) as average
FROM ${schema}.${view}
GROUP BY column_name
ORDER BY count DESC;`,

    /**
     * Modify view definition template
     */
    modifyDefinition: (schema: string, view: string) =>
        `-- Modify view definition
CREATE OR REPLACE VIEW ${schema}.${view} AS
SELECT * FROM source_table
WHERE condition;`,

    /**
     * View definition details
     */
    definitionDetails: (schema: string, view: string) =>
        `-- Get detailed view information
SELECT 
    schemaname,
    viewname,
    viewowner,
    definition
FROM pg_views
WHERE schemaname = '${schema}' AND viewname = '${view}';

-- Check view dependencies
SELECT DISTINCT
    v.table_schema,
    v.table_name,
    v.column_name
FROM information_schema.view_column_usage v
WHERE v.view_schema = '${schema}' 
AND v.view_name = '${view}'
ORDER BY v.table_schema, v.table_name, v.column_name;`,

    /**
     * DROP VIEW with options
     */
    dropWithOptions: (schema: string, view: string) =>
        `-- Drop view (with dependencies)
-- DROP VIEW IF EXISTS ${schema}.${view} CASCADE;

-- Drop view (without dependencies - will fail if referenced)
-- DROP VIEW IF EXISTS ${schema}.${view} RESTRICT;`,

    /**
     * CREATE VIEW templates
     */
    create: {
        basic: (schema: string) =>
            `-- Create basic view
CREATE OR REPLACE VIEW ${schema}.view_name AS
SELECT 
    column1, 
    column2,
    column3
FROM 
    ${schema}.table_name
WHERE 
    condition;

-- Add comment
COMMENT ON VIEW ${schema}.view_name IS 'Description of what this view provides';`,

        joined: (schema: string) =>
            `-- View with JOINs
CREATE OR REPLACE VIEW ${schema}.user_orders_summary AS
SELECT 
    u.id as user_id,
    u.name as user_name,
    o.id as order_id,
    o.total_amount,
    o.created_at
FROM 
    ${schema}.users u
    INNER JOIN ${schema}.orders o ON u.id = o.user_id
WHERE 
    o.status = 'completed';`,

        aggregated: (schema: string) =>
            `-- View with aggregations
CREATE OR REPLACE VIEW ${schema}.sales_summary AS
SELECT 
    product_id,
    COUNT(*) as total_orders,
    SUM(quantity) as total_quantity,
    SUM(amount) as total_revenue,
    AVG(amount) as avg_order_value
FROM 
    ${schema}.order_items
GROUP BY 
    product_id;`,

        security: (schema: string) =>
            `-- View that restricts data access
CREATE OR REPLACE VIEW ${schema}.my_documents AS
SELECT 
    id,
    title,
    content,
    created_at
FROM 
    ${schema}.documents
WHERE 
    created_by = current_user_id()
    AND deleted_at IS NULL;`,

        computed: (schema: string) =>
            `-- View with calculated columns
CREATE OR REPLACE VIEW ${schema}.product_pricing AS
SELECT 
    id,
    name,
    base_price,
    discount_percent,
    base_price * (1 - discount_percent / 100.0) as final_price,
    CASE 
        WHEN discount_percent > 20 THEN 'High Discount'
        WHEN discount_percent > 10 THEN 'Medium Discount'
        ELSE 'Low Discount'
    END as discount_category
FROM 
    ${schema}.products
WHERE 
    is_active = true;`,

        recursive: (schema: string) =>
            `-- View using Common Table Expression (CTE)
CREATE OR REPLACE VIEW ${schema}.category_hierarchy AS
WITH RECURSIVE category_tree AS (
    -- Base case: root categories
    SELECT 
        id,
        name,
        parent_id,
        0 as level,
        name as path
    FROM 
        ${schema}.categories
    WHERE 
        parent_id IS NULL
    
    UNION ALL
    
    -- Recursive case: child categories
    SELECT 
        c.id,
        c.name,
        c.parent_id,
        ct.level + 1,
        ct.path || ' > ' || c.name
    FROM 
        ${schema}.categories c
    INNER JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT * FROM category_tree;`
    }
};
