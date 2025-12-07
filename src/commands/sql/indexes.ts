/**
 * SQL Templates for Index Operations
 */

export const IndexSQL = {
    /**
     * Get index definition
     */
    definition: (schema: string, indexName: string) =>
        `-- View index definition
SELECT pg_get_indexdef(indexrelid) as index_def
FROM pg_stat_user_indexes
WHERE indexrelname = '${indexName}'
AND schemaname = '${schema}';`,

    /**
     * Index usage statistics
     */
    statistics: (schema: string, indexName: string) =>
        `-- Check index usage
SELECT 
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE indexrelname = '${indexName}'
AND schemaname = '${schema}';`,

    /**
     * Detailed index statistics
     */
    detailedStatistics: (schema: string, indexName: string) =>
        `-- Get detailed statistics for this index
SELECT 
    schemaname,
    relname as table_name,
    indexrelname as index_name,
    idx_scan as number_of_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = '${schema}' 
  AND indexrelname = '${indexName}';

-- Check index size
SELECT pg_size_pretty(pg_relation_size('${schema}.${indexName}')) as index_size;`,

    /**
     * Index usage analysis
     */
    usageAnalysis: (schema: string, table: string, indexName: string) =>
        `-- Index Usage Statistics
SELECT 
    schemaname,
    relname,
    indexrelid,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) as size,
    CASE 
        WHEN idx_scan = 0 THEN 'UNUSED'
        WHEN idx_scan < 50 THEN 'LOW USAGE'
        ELSE 'ACTIVE'
    END as usage_status
FROM pg_stat_user_indexes
WHERE schemaname = '${schema}' 
  AND indexrelname = '${indexName}';

-- Cache Hit Ratio
SELECT 
    relname, 
    indexrelname,
    idx_blks_read as disk_reads,
    idx_blks_hit as cache_hits,
    ROUND(100.0 * idx_blks_hit / GREATEST(idx_blks_hit + idx_blks_read, 1), 2) as cache_hit_ratio
FROM pg_statio_user_indexes
WHERE schemaname = '${schema}' 
  AND indexrelname = '${indexName}';`,

    /**
     * Compare index vs sequential scans
     */
    scanComparison: (schema: string, table: string, indexName: string) =>
        `-- Compare with table scans
SELECT 
    'Index Scans' as scan_type,  
    idx_scan as count
FROM pg_stat_user_indexes
WHERE indexrelname = '${indexName}'
    AND schemaname = '${schema}'
UNION ALL
SELECT 
    'Sequential Scans' as scan_type,
    seq_scan as count
FROM pg_stat_user_tables
WHERE schemaname = '${schema}'
    AND relname = '${table}';`,

    /**
     * DROP INDEX statement
     */
    drop: (schema: string, indexName: string) =>
        `-- Drop index
DROP INDEX "${schema}"."${indexName}";

-- Drop concurrently
-- DROP INDEX CONCURRENTLY "${schema}"."${indexName}";`,

    /**
     * REINDEX statement
     */
    reindex: (schema: string, indexName: string) =>
        `-- Reindex (locks table)
REINDEX INDEX "${schema}"."${indexName}";

-- Reindex concurrently (PostgreSQL 12+)
-- REINDEX INDEX CONCURRENTLY "${schema}"."${indexName}";`,

    /**
     * ALTER INDEX templates
     */
    alter: {
        rename: (schema: string, indexName: string) =>
            `-- Rename index
ALTER INDEX "${schema}"."${indexName}" RENAME TO new_index_name;`,

        setTablespace: (schema: string, indexName: string) =>
            `-- Move index to different tablespace
ALTER INDEX "${schema}"."${indexName}" SET TABLESPACE new_tablespace;`,

        setStatistics: (schema: string, indexName: string) =>
            `-- Adjust index statistics
ALTER INDEX "${schema}"."${indexName}" ALTER COLUMN column_name SET STATISTICS 1000;`
    },

    /**
     * CREATE INDEX templates
     */
    create: {
        btree: (schema: string, table: string, indexName: string) =>
            `-- Create Basic B-tree Index
CREATE INDEX ${indexName} 
ON "${schema}"."${table}" (column_name);`,

        unique: (schema: string, table: string, indexName: string) =>
            `-- Create Unique Index
CREATE UNIQUE INDEX ${indexName} 
ON "${schema}"."${table}" (column_name);`,

        partial: (schema: string, table: string, indexName: string) =>
            `-- Create Partial Index (with WHERE clause)
CREATE INDEX ${indexName} 
ON "${schema}"."${table}" (column_name)
WHERE column_name IS NOT NULL;`,

        composite: (schema: string, table: string, indexName: string) =>
            `-- Create Composite Index (multiple columns)
CREATE INDEX ${indexName} 
ON "${schema}"."${table}" (column1, column2, column3);`,

        concurrent: (schema: string, table: string, indexName: string) =>
            `-- Create Index Concurrently (doesn't block writes)
CREATE INDEX CONCURRENTLY ${indexName} 
ON "${schema}"."${table}" (column_name);`,

        gin: (schema: string, table: string, indexName: string) =>
            `-- Create GIN Index (for arrays, JSONB, full-text search)
CREATE INDEX ${indexName} 
ON "${schema}"."${table}" USING GIN (jsonb_column);`,

        expression: (schema: string, table: string, indexName: string) =>
            `-- Index on expression (for case-insensitive search)
CREATE INDEX ${indexName} 
ON "${schema}"."${table}" (LOWER(email));

-- Date extraction
-- CREATE INDEX ${indexName} 
-- ON "${schema}"."${table}" (EXTRACT(YEAR FROM created_at));`,

        ginJsonb: (schema: string, table: string, indexName: string) =>
            `-- GIN index for JSONB column
CREATE INDEX ${indexName} 
ON "${schema}"."${table}" USING GIN (data);

-- GIN index for JSONB with specific operators
-- CREATE INDEX ${indexName} 
-- ON "${schema}"."${table}" USING GIN (data jsonb_path_ops);

-- For array columns
-- CREATE INDEX ${indexName} 
-- ON "${schema}"."${table}" USING GIN (tags);`,

        fullText: (schema: string, table: string, indexName: string) =>
            `-- Full-text search index
CREATE INDEX ${indexName} 
ON "${schema}"."${table}" 
USING GIN (to_tsvector('english', title || ' ' || description));

-- Usage: 
-- SELECT * FROM ${table} 
-- WHERE to_tsvector('english', title || ' ' || description) @@ to_tsquery('search_term');`,

        brin: (schema: string, table: string, indexName: string) =>
            `-- BRIN index - very compact, good for time-series data
-- Works best when data is naturally ordered by the indexed column
CREATE INDEX ${indexName} 
ON "${schema}"."${table}" USING BRIN (created_at);`,

        covering: (schema: string, table: string, indexName: string) =>
            `-- Covering index with INCLUDE (PostgreSQL 11+)
-- Includes additional columns in the index for index-only scans
CREATE INDEX ${indexName} 
ON "${schema}"."${table}" (user_id)
INCLUDE (username, email);

-- Useful for: SELECT username, email FROM ${table} WHERE user_id = 123;`
    }
};
