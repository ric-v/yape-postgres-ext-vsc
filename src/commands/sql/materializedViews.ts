/**
 * SQL Templates for Materialized View Operations
 */

export const MaterializedViewSQL = {
    /**
     * Refresh materialized view
     */
    refresh: (schema: string, matviewName: string) =>
        `REFRESH MATERIALIZED VIEW ${schema}.${matviewName};`,

    /**
     * Refresh options
     */
    refreshWithOptions: (schema: string, matviewName: string) =>
        `-- Refresh materialized view (blocking operation)
REFRESH MATERIALIZED VIEW ${schema}.${matviewName};

-- Alternative: Truncate and rebuild
REFRESH MATERIALIZED VIEW ${schema}.${matviewName} WITH DATA;

-- Clear data without dropping structure
REFRESH MATERIALIZED VIEW ${schema}.${matviewName} WITH NO DATA;`,

    /**
     * Concurrent refresh
     */
    refreshConcurrently: (schema: string, matviewName: string) =>
        `-- Concurrent refresh (non-blocking, requires unique index)
REFRESH MATERIALIZED VIEW CONCURRENTLY ${schema}.${matviewName};

-- First, ensure you have a unique index
-- Example:
-- CREATE UNIQUE INDEX ${matviewName}_unique_idx ON ${schema}.${matviewName} (id);`,

    /**
     * Query data
     */
    queryData: (schema: string, matviewName: string) =>
        `SELECT *
FROM ${schema}.${matviewName}
LIMIT 100;`,

    /**
     * Create indexes
     */
    createIndexes: (schema: string, matviewName: string) =>
        `-- Create a unique index (enables concurrent refresh)
CREATE UNIQUE INDEX ${matviewName}_unique_idx 
    ON ${schema}.${matviewName} (id);

-- Create a regular B-tree index
CREATE INDEX ${matviewName}_column_idx 
    ON ${schema}.${matviewName} (column_name);

-- Create a multi-column index
CREATE INDEX ${matviewName}_multi_idx 
    ON ${schema}.${matviewName} (col1, col2);

-- Create a partial index (with WHERE clause)
CREATE INDEX ${matviewName}_partial_idx 
    ON ${schema}.${matviewName} (status)
    WHERE status = 'active';

-- Create a GiST index (for spatial/full-text data)
CREATE INDEX ${matviewName}_gist_idx 
    ON ${schema}.${matviewName} USING GIST (column_name);`,

    /**
     * Update statistics
     */
    analyze: (schema: string, matviewName: string) =>
        `-- Update query planner statistics
ANALYZE ${schema}.${matviewName};

-- Analyze specific columns
ANALYZE ${schema}.${matviewName} (column1, column2);

-- Verbose analyze (shows detailed output)
ANALYZE VERBOSE ${schema}.${matviewName};`,

    /**
     * Monitor freshness
     */
    monitorFreshness: (schema: string, matviewName: string) =>
        `-- Check when materialized view was last refreshed
SELECT 
    schemaname,
    matviewname,
    matviewowner,
    tablespace,
    hasindexes,
    ispopulated,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as total_size
FROM pg_matviews
WHERE schemaname = '${schema}' AND matviewname = '${matviewName}';

-- Check statistics and last maintenance
SELECT 
    schemaname,
    tablename,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows
FROM pg_stat_user_tables
WHERE schemaname = '${schema}' AND tablename = '${matviewName}';

-- View all indexes on the materialized view
SELECT 
    indexname,
    indexdef,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
FROM pg_indexes
WHERE schemaname = '${schema}' AND tablename = '${matviewName}'
ORDER BY indexname;`,

    /**
     * Advanced operations
     */
    advancedOperations: (schema: string, matviewName: string) =>
        `-- Change materialized view owner
ALTER MATERIALIZED VIEW ${schema}.${matviewName} OWNER TO new_owner;

-- Rename materialized view
ALTER MATERIALIZED VIEW ${schema}.${matviewName} RENAME TO new_name;

-- Move to different schema
ALTER MATERIALIZED VIEW ${schema}.${matviewName} SET SCHEMA new_schema;

-- Change tablespace
ALTER MATERIALIZED VIEW ${schema}.${matviewName} SET TABLESPACE new_tablespace;

-- Add comment
COMMENT ON MATERIALIZED VIEW ${schema}.${matviewName} IS 'Description of the materialized view';`,

    /**
     * CREATE MATERIALIZED VIEW templates
     */
    create: {
        basic: (schema: string) =>
            `-- Create basic materialized view
CREATE MATERIALIZED VIEW ${schema}.matview_name AS
SELECT 
    column1, 
    column2,
    COUNT(*) as count
FROM ${schema}.source_table
WHERE condition = true
WITH DATA;

-- Add unique index (enables concurrent refresh)
CREATE UNIQUE INDEX idx_matview_name_id ON ${schema}.matview_name (column1);

-- Add comment
COMMENT ON MATERIALIZED VIEW ${schema}.matview_name IS 'Materialized view description';`,

        aggregated: (schema: string) =>
            `-- Materialized view with aggregations
CREATE MATERIALIZED VIEW ${schema}.sales_summary AS
SELECT 
    product_id,
    DATE_TRUNC('month', order_date) as month,
    COUNT(*) as order_count,
    SUM(quantity) as total_quantity,
    SUM(amount) as total_revenue,
    AVG(amount) as avg_order_value
FROM ${schema}.orders o
JOIN ${schema}.order_items oi ON o.id = oi.order_id
GROUP BY product_id, DATE_TRUNC('month', order_date)
WITH DATA;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_sales_summary_unique 
    ON ${schema}.sales_summary (product_id, month);

-- Create additional indexes for common queries
CREATE INDEX idx_sales_summary_month ON ${schema}.sales_summary (month);
CREATE INDEX idx_sales_summary_product ON ${schema}.sales_summary (product_id);`,

        timeSeries: (schema: string) =>
            `-- Materialized view for time-series data
CREATE MATERIALIZED VIEW ${schema}.hourly_metrics AS
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    metric_type,
    SUM(value) as total_value,
    AVG(value) as avg_value,
    MIN(value) as min_value,
    MAX(value) as max_value
FROM ${schema}.metrics
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at), metric_type
WITH DATA;

-- Create unique index
CREATE UNIQUE INDEX idx_hourly_metrics_unique 
    ON ${schema}.hourly_metrics (hour, metric_type);

-- Create index for time-based queries
CREATE INDEX idx_hourly_metrics_hour ON ${schema}.hourly_metrics (hour DESC);`,

        joined: (schema: string) =>
            `-- Materialized view joining multiple tables
CREATE MATERIALIZED VIEW ${schema}.user_order_summary AS
SELECT 
    u.id as user_id,
    u.name as user_name,
    u.email,
    COUNT(o.id) as total_orders,
    SUM(o.total_amount) as lifetime_value,
    MAX(o.created_at) as last_order_date
FROM ${schema}.users u
LEFT JOIN ${schema}.orders o ON u.id = o.user_id
GROUP BY u.id, u.name, u.email
WITH DATA;

-- Create unique index
CREATE UNIQUE INDEX idx_user_order_summary_user_id 
    ON ${schema}.user_order_summary (user_id);

-- Create index for common queries
CREATE INDEX idx_user_order_summary_lifetime_value 
    ON ${schema}.user_order_summary (lifetime_value DESC);`
    }
};
