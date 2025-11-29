import { Client } from 'pg';

export interface DashboardStats {
    dbName: string;
    owner: string;
    size: string;
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
    extensionCount: number;
    topTables: { name: string; size: string; rawSize: number }[];
    connectionStates: { state: string; count: number }[];
    objectCounts: {
        schemas: number;
        tables: number;
        views: number;
        functions: number;
        sequences: number;
    };
    activeQueries: {
        pid: number;
        usename: string;
        datname: string;
        state: string;
        duration: string;
        startTime: string;
        query: string;
    }[];
    blockingLocks: {
        blocked_pid: number;
        blocked_user: string;
        blocking_pid: number;
        blocking_user: string;
        blocked_query: string;
        blocking_query: string;
        lock_mode: string;
        locked_object: string;
    }[];
    metrics: {
        xact_commit: number;
        xact_rollback: number;
        blks_read: number;
        blks_hit: number;
    };
}

export async function fetchStats(client: Client, dbName: string): Promise<DashboardStats> {
    const [dbInfoRes, connRes, tableRes, extRes, countsRes, activeQueriesRes, locksRes, metricsRes] = await Promise.all([
        // DB Info
        client.query(`
            SELECT pg_catalog.pg_get_userbyid(d.datdba) as owner,
                   pg_size_pretty(pg_database_size(d.datname)) as size
            FROM pg_database d
            WHERE d.datname = $1
        `, [dbName]),

        // Connection States
        client.query(`
            SELECT state, count(*) as count
            FROM pg_stat_activity
            WHERE datname = $1
            GROUP BY state
        `, [dbName]),

        // Top Tables
        client.query(`
            SELECT schemaname || '.' || tablename as name,
                   pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size,
                   pg_total_relation_size(schemaname || '.' || tablename) as raw_size
            FROM pg_tables
            WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY raw_size DESC
            LIMIT 10
        `),

        // Extension Count
        client.query(`SELECT count(*) as count FROM pg_available_extensions WHERE installed_version IS NOT NULL`),

        // Object Counts
        client.query(`
            SELECT
                (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('pg_catalog', 'information_schema')) as schemas,
                (SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as tables,
                (SELECT count(*) FROM pg_views WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as views,
                (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')) as functions,
                (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE c.relkind = 'S' AND n.nspname NOT IN ('pg_catalog', 'information_schema')) as sequences
        `),

        // Active Queries (including idle)
        client.query(`
            SELECT pid, usename, datname, state, 
                   (now() - query_start)::text as duration,
                   query_start,
                   query
            FROM pg_stat_activity
            WHERE pid != pg_backend_pid()
            AND datname = $1
            ORDER BY state = 'active' DESC, query_start ASC
            LIMIT 100
        `, [dbName]),

        // Blocking Locks
        client.query(`
            SELECT
                blocked_locks.pid     AS blocked_pid,
                blocked_activity.usename  AS blocked_user,
                blocking_locks.pid     AS blocking_pid,
                blocking_activity.usename AS blocking_user,
                blocked_activity.query    AS blocked_query,
                blocking_activity.query   AS blocking_query,
                blocked_locks.mode        AS lock_mode,
                COALESCE(c.relname, 'null') AS locked_object
            FROM  pg_catalog.pg_locks         blocked_locks
            JOIN pg_catalog.pg_stat_activity blocked_activity  ON blocked_activity.pid = blocked_locks.pid
            JOIN pg_catalog.pg_locks         blocking_locks 
                ON blocking_locks.locktype = blocked_locks.locktype
                AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
                AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
                AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
                AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
                AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
                AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
                AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
                AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
                AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
                AND blocking_locks.pid != blocked_locks.pid
            JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
            LEFT JOIN pg_catalog.pg_class c ON c.oid = blocked_locks.relation
            WHERE NOT blocked_locks.granted
            AND blocking_activity.datname = $1
        `, [dbName]),

        // Database Metrics (Throughput & I/O)
        client.query(`
            SELECT xact_commit, xact_rollback, blks_read, blks_hit 
            FROM pg_stat_database 
            WHERE datname = $1
        `, [dbName])
    ]);

    const dbInfo = dbInfoRes.rows[0];
    const connections = connRes.rows;
    const counts = countsRes.rows[0];

    let active = 0;
    let idle = 0;
    let total = 0;
    const connectionStates: { state: string; count: number }[] = [];

    connections.forEach((row: any) => {
        const count = parseInt(row.count);
        total += count;
        if (row.state === 'active') active += count;
        if (row.state === 'idle') idle += count;
        connectionStates.push({ state: row.state || 'unknown', count });
    });

    return {
        dbName: dbName,
        owner: dbInfo?.owner || 'Unknown',
        size: dbInfo?.size || 'Unknown',
        activeConnections: active,
        idleConnections: idle,
        totalConnections: total,
        extensionCount: parseInt(extRes.rows[0].count),
        topTables: tableRes.rows.map((r: any) => ({
            name: r.name,
            size: r.size,
            rawSize: parseInt(r.raw_size)
        })),
        connectionStates,
        objectCounts: {
            schemas: parseInt(counts.schemas),
            tables: parseInt(counts.tables),
            views: parseInt(counts.views),
            functions: parseInt(counts.functions),
            sequences: parseInt(counts.sequences)
        },
        activeQueries: activeQueriesRes.rows.map((r: any) => {
            // Format duration to be more readable (e.g., remove milliseconds if too long, or keep as is from PG)
            // PG 'interval' cast to text usually looks like "00:00:05.123456" or "1 day 00:00:05"
            let duration = r.duration || '';
            // Optional: Truncate milliseconds for cleaner look if it's just a time string
            if (duration.includes('.')) {
                duration = duration.split('.')[0];
            }

            return {
                pid: r.pid,
                usename: r.usename,
                datname: r.datname,
                state: r.state,
                duration: duration,
                startTime: r.query_start ? new Date(r.query_start).toLocaleString() : '-',
                query: r.query
            };
        }),
        blockingLocks: locksRes.rows,
        metrics: {
            xact_commit: parseInt(metricsRes.rows[0]?.xact_commit || '0'),
            xact_rollback: parseInt(metricsRes.rows[0]?.xact_rollback || '0'),
            blks_read: parseInt(metricsRes.rows[0]?.blks_read || '0'),
            blks_hit: parseInt(metricsRes.rows[0]?.blks_hit || '0')
        }
    };
}

