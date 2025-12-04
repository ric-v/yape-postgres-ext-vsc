import { Client } from 'pg';
import * as vscode from 'vscode';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword } from '../commands/connection';
import { DashboardPanel } from '../dashboard/DashboardPanel';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { ConnectionManager } from '../services/ConnectionManager';
import { 
    MarkdownUtils, 
    ErrorHandlers
} from './helper';

/**
 * Validates that a database item has the required properties.
 * @throws Error if validation fails
 */
function validateDatabaseItem(item: DatabaseTreeItem): void {
    if (!item) {
        throw new Error('No database selected');
    }
    if (!item.connectionId || !item.databaseName) {
        throw new Error('Invalid database selection - missing connection or database name');
    }
}

/**
 * cmdShowDatabaseDashboard - Creates a notebook with database statistics and performance metrics.
 * Shows:
 * - Database size and general statistics
 * - Table sizes and row counts
 * - Index usage statistics
 * - Cache hit ratios
 * 
 * @param {DatabaseTreeItem} item - The selected database item from the tree view
 * @param {vscode.ExtensionContext} context - The extension context
 * @returns {Promise<void>} - A promise that resolves when the dashboard is displayed
 * 
 * @example
 * await cmdShowDatabaseDashboard(databaseItem, context);
 * // Dashboard notebook is now displayed
 */
export async function cmdDatabaseDashboard(item: DatabaseTreeItem, context: vscode.ExtensionContext): Promise<void> {
    try {
        validateDatabaseItem(item);

        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const connection = await ConnectionManager.getInstance().getConnection({
            id: connectionConfig.id,
            host: connectionConfig.host,
            port: connectionConfig.port,
            username: connectionConfig.username,
            database: item.databaseName,
            name: connectionConfig.name
        });

        if (!connection) {
            throw new Error('Failed to get database connection');
        }

        await DashboardPanel.show(connection, item.databaseName!);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'show dashboard');
    }
}

/**
 * cmdAddInDatabase - Command to create a new object in the database.
 * Prompts the user to select the type of object to create (schema, user, role, or extension).
 * Creates a notebook with a template for the selected object type.
 * 
 * @param {DatabaseTreeItem} item - The selected database item from the tree view
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdAddObjectInDatabase(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateDatabaseItem(item);

        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connectionConfig, item.databaseName);

        const schemaTemplate = {
            label: 'Schema',
            detail: 'Create a new schema in this database',
            cells: [
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: MarkdownUtils.header('📂 Create New Schema') +
                        MarkdownUtils.infoBox('This notebook guides you through creating a new PostgreSQL schema and configuring permissions. Schemas help organize database objects and control access.') +
                        `\n\n#### 🎯 What is a Schema?\n\n` +
                        `A schema is a named collection of database objects (tables, views, functions) that:\n` +
                        `- 📦 Organizes objects logically\n` +
                        `- 🔐 Controls access at the schema level\n` +
                        `- 🏗️ Prevents naming conflicts\n` +
                        `- 👥 Supports multi-tenant applications\n\n` +
                        MarkdownUtils.successBox('Execute cells in order. Skip optional sections if not needed for your use case.')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: `#### 1. Create Schema\nCreate a new schema with optional ownership settings.`
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 📝 Schema Definition"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Basic schema creation",
                        "CREATE SCHEMA schema_name;",
                        "",
                        "-- OR create with specific owner",
                        "-- CREATE SCHEMA schema_name AUTHORIZATION role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 2. Basic Permissions",
                        "Grant basic usage permissions to roles that need to access the schema."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 🛡️ Grant Usage"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant basic schema usage",
                        "GRANT USAGE ON SCHEMA schema_name TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 3. Object Permissions",
                        "Grant permissions for existing tables and sequences in the schema."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 🔐 Object Privileges"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant permissions on all tables",
                        "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA schema_name TO role_name;",
                        "",
                        "-- Grant permissions on all sequences",
                        "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA schema_name TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 4. Default Privileges",
                        "Set up default privileges for objects that will be created in the future."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 🔮 Future Objects"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Set default privileges for future tables",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name",
                        "    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_name;",
                        "",
                        "-- Set default privileges for future sequences",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name",
                        "    GRANT USAGE, SELECT ON SEQUENCES TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### Example: Complete Schema Setup",
                        "Here's a practical example of creating an application schema with specific privileges."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 🚀 Full Example"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Example: Create application schema with specific privileges",
                        "CREATE SCHEMA app_schema;",
                        "",
                        "-- Grant read-only access to app_readonly role",
                        "GRANT USAGE ON SCHEMA app_schema TO app_readonly;",
                        "GRANT SELECT ON ALL TABLES IN SCHEMA app_schema TO app_readonly;",
                        "",
                        "-- Grant full access to app_admin role",
                        "GRANT ALL PRIVILEGES ON SCHEMA app_schema TO app_admin;",
                        "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app_schema TO app_admin;"
                    ].join('\n')
                }
            ]
        };

        const userTemplate = {
            label: 'User',
            detail: 'Create a new user with login privileges',
            cells: [
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "### 👤 Create New Database User",
                        "",
                        "<div style=\"font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;\">",
                        "    <strong>ℹ️ Note:</strong> Create a new PostgreSQL user with login capabilities and configure appropriate privileges.",
                        "</div>",
                        "",
                        "#### 🔑 User vs Role",
                        "",
                        "<table style=\"font-size: 11px; width: 100%; border-collapse: collapse;\">",
                        "    <tr><th style=\"text-align: left;\">Aspect</th><th style=\"text-align: left;\">User</th><th style=\"text-align: left;\">Role</th></tr>",
                        "    <tr><td><strong>Login</strong></td><td>✅ Can login</td><td>❌ Cannot login (by default)</td></tr>",
                        "    <tr><td><strong>Purpose</strong></td><td>Individual database access</td><td>Group permissions</td></tr>",
                        "    <tr><td><strong>Password</strong></td><td>Required</td><td>Not required</td></tr>",
                        "    <tr><td><strong>Inheritance</strong></td><td>Inherits from roles</td><td>Can be granted to users</td></tr>",
                        "</table>",
                        "",
                        "<div style=\"font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-top: 15px; border-radius: 3px;\">",
                        "    <strong>⚠️ Important:</strong> Always use strong passwords and follow the principle of least privilege—grant only necessary permissions.",
                        "</div>"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 1. Create User",
                        "Create a new user with basic attributes. Uncomment and modify additional attributes as needed."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 👤 User Definition"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Create new user with basic attributes",
                        "CREATE USER username WITH",
                        "    LOGIN",
                        "    PASSWORD 'strong_password'",
                        "    -- Additional optional attributes:",
                        "    -- CREATEDB                    -- Can create new databases",
                        "    -- SUPERUSER                   -- Has all database privileges",
                        "    -- CREATEROLE                  -- Can create new roles",
                        "    -- REPLICATION                 -- Can initiate streaming replication",
                        "    -- CONNECTION LIMIT 5          -- Maximum concurrent connections",
                        "    -- VALID UNTIL '2025-12-31'   -- Password expiration date",
                        ";"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 2. Database Privileges",
                        "Grant database-level privileges to the new user."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 🗄️ Database Access"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant database connection privileges",
                        "GRANT CONNECT ON DATABASE database_name TO username;",
                        "",
                        "-- Allow creating temporary tables",
                        "GRANT TEMP ON DATABASE database_name TO username;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 3. Schema Privileges",
                        "Grant schema-level privileges. Repeat for each schema as needed."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 📂 Schema Access"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant schema privileges",
                        "GRANT USAGE ON SCHEMA schema_name TO username;",
                        "",
                        "-- Optional: allow creating new objects in schema",
                        "-- GRANT CREATE ON SCHEMA schema_name TO username;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 4. Table Privileges",
                        "Grant table-level privileges within schemas."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 📊 Table Access"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant table privileges",
                        "GRANT SELECT, INSERT, UPDATE, DELETE ",
                        "ON ALL TABLES IN SCHEMA schema_name ",
                        "TO username;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 5. Default Privileges",
                        "Set up default privileges for future objects."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 🔮 Future Objects"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Set default privileges for future tables",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name",
                        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES",
                        "TO username;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### Example: Read-only User",
                        "Here's a practical example of creating a read-only user."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 👓 Read-Only Example"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Create read-only user",
                        "CREATE USER readonly_user WITH",
                        "    LOGIN",
                        "    PASSWORD 'strong_password'",
                        "    CONNECTION LIMIT 10;",
                        "",
                        "-- Grant minimal privileges",
                        "GRANT CONNECT ON DATABASE database_name TO readonly_user;",
                        "GRANT USAGE ON SCHEMA public TO readonly_user;",
                        "GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;",
                        "",
                        "-- Set up default privileges for future tables",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA public",
                        "    GRANT SELECT ON TABLES TO readonly_user;"
                    ].join('\n')
                }
            ]
        };

        const roleTemplate = {
            label: 'Role',
            detail: 'Create a new role',
            cells: [
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "### 👥 Create New Role",
                        "",
                        "<div style=\"font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;\">",
                        "    <strong>ℹ️ Note:</strong> Roles are used to group permissions. Users can be added to roles to inherit their privileges.",
                        "</div>",
                        "",
                        "#### 🎯 Common Role Patterns",
                        "",
                        "<table style=\"font-size: 11px; width: 100%; border-collapse: collapse;\">",
                        "    <tr><th style=\"text-align: left;\">Role Type</th><th style=\"text-align: left;\">Use Case</th><th style=\"text-align: left;\">Permissions</th></tr>",
                        "    <tr><td><strong>Readonly</strong></td><td>Reporting, analytics</td><td>SELECT only</td></tr>",
                        "    <tr><td><strong>Read-Write</strong></td><td>Application access</td><td>SELECT, INSERT, UPDATE, DELETE</td></tr>",
                        "    <tr><td><strong>Admin</strong></td><td>Database administration</td><td>ALL PRIVILEGES</td></tr>",
                        "    <tr><td><strong>App Role</strong></td><td>Service accounts</td><td>Custom based on needs</td></tr>",
                        "</table>",
                        "",
                        "<div style=\"font-size: 12px; background-color: #2d3e30; border-left: 3px solid #2ecc71; padding: 6px 10px; margin-top: 15px; border-radius: 3px;\">",
                        "    <strong>💡 Tip:</strong> Create roles for job functions, not individuals. Grant roles to users for easier permission management.",
                        "</div>"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 1. Create Role",
                        "Create a new role with basic attributes. Uncomment and modify additional attributes as needed."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 🎭 Role Definition"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Create new role with basic attributes",
                        "CREATE ROLE role_name WITH",
                        "    NOLOGIN                     -- Cannot login (use LOGIN for login capability)",
                        "    INHERIT                     -- Inherit privileges from parent roles",
                        "    -- Additional optional attributes:",
                        "    -- SUPERUSER               -- Has all database privileges",
                        "    -- CREATEDB               -- Can create new databases",
                        "    -- CREATEROLE            -- Can create new roles",
                        "    -- REPLICATION           -- Can initiate streaming replication",
                        "    -- CONNECTION LIMIT 5    -- Maximum concurrent connections",
                        "    -- IN GROUP role1, role2 -- Add role to existing groups",
                        ";"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 2. Database Privileges",
                        "Grant database-level privileges to the role."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 🗄️ Database Access"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant database privileges",
                        "GRANT CONNECT ON DATABASE database_name TO role_name;",
                        "GRANT CREATE ON DATABASE database_name TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 3. Schema Privileges",
                        "Grant schema-level privileges to the role."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 📂 Schema Access"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant schema privileges",
                        "GRANT USAGE ON SCHEMA schema_name TO role_name;",
                        "GRANT CREATE ON SCHEMA schema_name TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 4. Object Privileges",
                        "Grant privileges on tables, functions, and sequences."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 🔐 Object Access"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Grant table privileges",
                        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA schema_name TO role_name;",
                        "",
                        "-- Grant function privileges",
                        "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA schema_name TO role_name;",
                        "",
                        "-- Grant sequence privileges",
                        "GRANT USAGE ON ALL SEQUENCES IN SCHEMA schema_name TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 5. Default Privileges",
                        "Set up default privileges for future objects."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 🔮 Future Objects"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Set default privileges for future objects",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name",
                        "    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_name;",
                        "",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name",
                        "    GRANT EXECUTE ON FUNCTIONS TO role_name;",
                        "",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name",
                        "    GRANT USAGE ON SEQUENCES TO role_name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### Example: Application Role",
                        "Here's a practical example of creating an application role with read-only access."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 🚀 App Role Example"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Create application role",
                        "CREATE ROLE app_readonly WITH",
                        "    NOLOGIN",
                        "    INHERIT",
                        "    CONNECTION LIMIT 100;",
                        "",
                        "-- Grant minimal privileges",
                        "GRANT CONNECT ON DATABASE app_db TO app_readonly;",
                        "GRANT USAGE ON SCHEMA public TO app_readonly;",
                        "GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;",
                        "",
                        "-- Set up default privileges",
                        "ALTER DEFAULT PRIVILEGES IN SCHEMA public",
                        "    GRANT SELECT ON TABLES TO app_readonly;"
                    ].join('\n')
                }
            ]
        };

        const extensionTemplate = {
            label: 'Extension',
            detail: 'Enable a PostgreSQL extension',
            cells: [
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "### 🧩 Enable PostgreSQL Extension",
                        "",
                        "<div style=\"font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;\">",
                        "    <strong>ℹ️ Note:</strong> PostgreSQL extensions add functionality to your database. Enable only the extensions you need.",
                        "</div>",
                        "",
                        "#### 📦 Popular Extensions",
                        "",
                        "<table style=\"font-size: 11px; width: 100%; border-collapse: collapse;\">",
                        "    <tr><th style=\"text-align: left;\">Extension</th><th style=\"text-align: left;\">Purpose</th><th style=\"text-align: left;\">Use Case</th></tr>",
                        "    <tr><td><strong>uuid-ossp</strong></td><td>UUID generation</td><td>Unique identifiers</td></tr>",
                        "    <tr><td><strong>pgcrypto</strong></td><td>Cryptographic functions</td><td>Encryption, hashing</td></tr>",
                        "    <tr><td><strong>hstore</strong></td><td>Key-value storage</td><td>Semi-structured data</td></tr>",
                        "    <tr><td><strong>postgis</strong></td><td>Geospatial data</td><td>Maps, location data</td></tr>",
                        "    <tr><td><strong>pg_stat_statements</strong></td><td>Query statistics</td><td>Performance monitoring</td></tr>",
                        "    <tr><td><strong>pg_trgm</strong></td><td>Fuzzy text search</td><td>Similarity matching</td></tr>",
                        "</table>",
                        "",
                        "<div style=\"font-size: 12px; background-color: #2d3e30; border-left: 3px solid #2ecc71; padding: 6px 10px; margin-top: 15px; border-radius: 3px;\">",
                        "    <strong>💡 Tip:</strong> Check if the extension is already installed before enabling it to avoid errors.",
                        "</div>"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 1. View Available Extensions",
                        "List extensions that can be installed but aren't yet enabled."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 🔍 Available Extensions"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- List available extensions",
                        "SELECT name as \"Name\",",
                        "       default_version as \"Version\",",
                        "       installed_version as \"Installed\",",
                        "       comment as \"Description\"",
                        "FROM pg_available_extensions ",
                        "WHERE installed_version IS NULL ",
                        "ORDER BY name;"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 2. Enable Extension",
                        "Enable a specific extension. Uncomment the extension you want to enable."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 🔌 Enable Command"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Enable your chosen extension",
                        "CREATE EXTENSION IF NOT EXISTS extension_name;",
                        "",
                        "-- Common extensions (uncomment to use):",
                        "-- CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";     -- UUID generation",
                        "-- CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";      -- Cryptographic functions",
                        "-- CREATE EXTENSION IF NOT EXISTS \"hstore\";        -- Key-value store",
                        "-- CREATE EXTENSION IF NOT EXISTS \"postgis\";       -- Spatial database",
                        "-- CREATE EXTENSION IF NOT EXISTS \"pg_stat_statements\"; -- Query statistics",
                        "-- CREATE EXTENSION IF NOT EXISTS \"pg_trgm\";       -- Trigram text search",
                        "-- CREATE EXTENSION IF NOT EXISTS \"tablefunc\";     -- Table functions",
                        "-- CREATE EXTENSION IF NOT EXISTS \"ltree\";         -- Hierarchical tree structures",
                        "-- CREATE EXTENSION IF NOT EXISTS \"isn\";           -- Product number standards",
                        "-- CREATE EXTENSION IF NOT EXISTS \"citext\";        -- Case-insensitive text"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 3. Verify Installation",
                        "Check if the extension was successfully installed."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### ✅ Verification"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- Verify extension installation",
                        "SELECT * FROM pg_extension WHERE extname = 'extension_name';"
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "#### 4. List Installed Extensions",
                        "View all currently installed extensions in the database."
                    ].join('\n')
                },
                {
                    cell_type: "markdown",
                    metadata: { language: "markdown" },
                    value: [
                        "##### 📋 Installed Extensions"
                    ].join('\n')
                },
                {
                    cell_type: "code",
                    metadata: { language: "sql" },
                    value: [
                        "-- List all installed extensions",
                        "SELECT extname as \"Name\",",
                        "       extversion as \"Version\",",
                        "       obj_description(oid, 'pg_extension') as \"Description\"",
                        "FROM pg_extension",
                        "ORDER BY extname;"
                    ].join('\n')
                }
            ]
        };

        const items = [
            schemaTemplate,
            userTemplate,
            roleTemplate,
            extensionTemplate
        ];

        const selection = await vscode.window.showQuickPick(items, {
            title: 'Create in Database',
            placeHolder: 'Select what to create'
        });

        if (selection) {
            // Create notebook cells with correct language identifiers for both SQL and markdown
            const notebookCells = selection.cells.map(cell =>
                new vscode.NotebookCellData(
                    cell.cell_type === "code" ? vscode.NotebookCellKind.Code : vscode.NotebookCellKind.Markup,
                    cell.value,
                    cell.cell_type === "code" ? 'sql' : 'markdown'  // Use appropriate language for each cell type
                )
            );

            // Create notebook with only the essential metadata
            const notebookData = new vscode.NotebookData(notebookCells);
            notebookData.metadata = {
                connectionId: metadata.connectionId,
                databaseName: metadata.databaseName,
                host: metadata.host,
                port: metadata.port,
                username: metadata.username
            };

            const document = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
            await vscode.window.showNotebookDocument(document);
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create notebook');
    }
}

/**
 * cmdAllDatabaseOperations - Command to create a notebook with various database operations.
 * 
 * @param {DatabaseTreeItem} item - The selected database item from the tree view
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdDatabaseOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateDatabaseItem(item);

        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const connection = await ConnectionManager.getInstance().getConnection({
            id: connectionConfig.id,
            host: connectionConfig.host,
            port: connectionConfig.port,
            username: connectionConfig.username,
            database: item.databaseName,
            name: connectionConfig.name
        });
        let client: Client | undefined;

        try {
            client = connection;
            const metadata = createMetadata(connectionConfig, item.databaseName);

            // Get database info
            const dbInfoQuery = `
                SELECT 
                    d.datname as "Database",
                    pg_size_pretty(pg_database_size(d.datname)) as "Size",
                    u.usename as "Owner",
                    (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as "Active Connections",
                    (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('pg_catalog', 'information_schema')) as "Schemas",
                    (SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as "Tables",
                    (SELECT count(*) FROM pg_roles) as "Roles"
                FROM pg_database d
                JOIN pg_user u ON d.datdba = u.usesysid
                WHERE d.datname = current_database();`;

            const dbInfo = await client.query(dbInfoQuery);
            const info = dbInfo.rows[0];

            // Get schema sizes for visualization
            const schemaSizeQuery = `
                SELECT 
                    pg_tables.schemaname as schema_name,
                    pg_total_relation_size(pg_tables.schemaname || '.' || tablename) as table_size
                FROM pg_tables
                WHERE pg_tables.schemaname NOT IN ('pg_catalog', 'information_schema')
            `;
            const schemaSizes = await client.query(schemaSizeQuery);

            // Process schema sizes for visualization
            const schemaMap = new Map<string, number>();
            let totalSize = 0;
            schemaSizes.rows.forEach(row => {
                const size = Number(row.table_size);
                const current = schemaMap.get(row.schema_name) || 0;
                schemaMap.set(row.schema_name, current + size);
                totalSize += size;
            });

            // Generate ASCII Bar Chart in HTML Table
            let schemaDistribution = '<table style="font-size: 11px; width: 100%; border-collapse: collapse;"><tr><th style="text-align: left;">Schema</th><th style="text-align: left;">Size</th><th style="text-align: left;">Distribution</th></tr>';
            schemaMap.forEach((size, schema) => {
                if (size > 0) {
                    const percentage = (size / totalSize) * 100;
                    const barLength = Math.floor(percentage / 5); // 20 chars max
                    const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
                    schemaDistribution += `<tr><td><strong>${schema}</strong></td><td>${(size / 1024 / 1024).toFixed(2)} MB</td><td><code>${bar}</code> ${percentage.toFixed(1)}%</td></tr>`;
                }
            });
            schemaDistribution += '</table>';

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    MarkdownUtils.header(`📊 Database Operations: \`${item.label}\``) +
                        MarkdownUtils.infoBox('Comprehensive database management notebook with statistics, monitoring queries, and administrative operations.') +
                        `\n\n#### 📈 Database Overview\n\n` +
                        `##### 📊 Schema Size Distribution\n${schemaDistribution}\n\n` +
                        `##### 🏥 Health Metrics\n` +
                        MarkdownUtils.propertiesTable({
                            '🗄️ Database Size': `<code>${info.Size}</code>`,
                            '👤 Owner': `<code>${info.Owner}</code>`,
                            '🔗 Active Connections': `<code>${info["Active Connections"]}</code>`,
                            '📂 Schemas': `<code>${info.Schemas}</code>`,
                            '📊 Tables': `<code>${info.Tables}</code>`,
                            '👥 Roles': `<code>${info.Roles}</code>`
                        }) +
                        `\n\n#### 🎯 Available Operations\n\n` +
                        `Execute the cells below to:\n` +
                        `- 📦 **View schema sizes** - Analyze storage by schema\n` +
                        `- 👥 **List users/roles** - Review permissions and access\n` +
                        `- 🔍 **Monitor connections** - Track active sessions\n` +
                        `- 🧩 **Check extensions** - See installed features\n\n` +
                        MarkdownUtils.successBox('Use these queries for monitoring, reporting, and database administration. Modify as needed for your specific use case.') +
                        `\n\n---`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📦 Schema Sizes`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- List schemas and sizes
SELECT schema_name,
       pg_size_pretty(sum(table_size)::bigint) as "Size",
       count(table_name) as "Tables"
FROM (
    SELECT pg_tables.schemaname as schema_name,
           tablename as table_name,
           pg_total_relation_size(pg_tables.schemaname || '.' || tablename) as table_size
    FROM pg_tables
) t
GROUP BY schema_name
ORDER BY sum(table_size) DESC;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 👥 User Roles & Privileges`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- List users and roles
SELECT r.rolname as "Role",
       r.rolsuper as "Superuser",
       r.rolcreatedb as "Create DB",
       r.rolcreaterole as "Create Role",
       r.rolcanlogin as "Can Login",
       r.rolconnlimit as "Connection Limit",
       r.rolvaliduntil as "Valid Until"
FROM pg_roles r
ORDER BY r.rolname;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔗 Active Connections`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Show active connections
SELECT pid as "Process ID",
       usename as "User",
       datname as "Database",
       client_addr as "Client Address",
       application_name as "Application",
       state as "State",
       query as "Last Query",
       backend_start as "Connected Since"
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY backend_start;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🧩 Installed Extensions`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- List installed extensions
SELECT name as "Extension",
       default_version as "Default Version",
       installed_version as "Installed Version",
       comment as "Description"
FROM pg_available_extensions
WHERE installed_version IS NOT NULL
ORDER BY name;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Database maintenance
-- Note: These operations require appropriate privileges

-- Analyze all tables (updates statistics)
ANALYZE VERBOSE;

-- List tables that might need vacuuming
SELECT schemaname, relname, n_dead_tup, last_vacuum, last_autovacuum,
       pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) as total_size
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY n_dead_tup DESC;

-- To vacuum a specific table (uncomment and modify):
-- VACUUM ANALYZE schema_name.table_name;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Terminate connections (BE CAREFUL!)
-- List commands to terminate other connections to this database
SELECT format(
    'SELECT pg_terminate_backend(%s) /* %s %s %s */;',
    pid,
    usename,
    application_name,
    query
)
FROM pg_stat_activity
WHERE datname = current_database()
AND pid <> pg_backend_pid();`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager, no need to close
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create database operations notebook');
    }
}

/**
 * cmdRefreshDatabase - Refreshes the database item in the tree view.
 */
export async function cmdRefreshDatabase(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    databaseTreeProvider?.refresh(item);
}

/**
 * cmdCreateDatabase - Command to create a new database.
 */
export async function cmdCreateDatabase(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        // For creating a database, we connect to postgres database
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const connection = await ConnectionManager.getInstance().getConnection({
            id: connectionConfig.id,
            host: connectionConfig.host,
            port: connectionConfig.port,
            username: connectionConfig.username,
            database: 'postgres',
            name: connectionConfig.name
        });
        const metadata = createMetadata(connectionConfig, 'postgres');

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.header('🆕 Create New Database') +
                    MarkdownUtils.infoBox('Execute the cell below to create a new database. Modify the database name and options as needed.') +
                    `\n\n#### 🎯 Database Options\n\n` +
                    MarkdownUtils.operationsTable([
                        { operation: 'OWNER', description: 'Specify the database owner' },
                        { operation: 'ENCODING', description: 'Character encoding (e.g., UTF8)' },
                        { operation: 'TEMPLATE', description: 'Template database to copy from' },
                        { operation: 'TABLESPACE', description: 'Default tablespace for the database' },
                        { operation: 'CONNECTION LIMIT', description: 'Maximum concurrent connections' }
                    ]),
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 Create Command`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create database with basic settings
CREATE DATABASE new_database;

-- Create database with full options
-- CREATE DATABASE new_database
--     WITH OWNER = postgres
--     ENCODING = 'UTF8'
--     LC_COLLATE = 'en_US.UTF-8'
--     LC_CTYPE = 'en_US.UTF-8'
--     TEMPLATE = template0
--     CONNECTION LIMIT = -1;`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create database notebook');
    }
}

/**
 * cmdDeleteDatabase - Command to delete a database.
 */
export async function cmdDeleteDatabase(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        // For deleting a database, we connect to postgres database
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const connection = await ConnectionManager.getInstance().getConnection({
            id: connectionConfig.id,
            host: connectionConfig.host,
            port: connectionConfig.port,
            username: connectionConfig.username,
            database: 'postgres',
            name: connectionConfig.name
        });
        const metadata = createMetadata(connectionConfig, 'postgres');

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.header(`❌ Delete Database: \`${item.label}\``) +
                    MarkdownUtils.dangerBox('This action will <strong>PERMANENTLY DELETE</strong> the database and <strong>ALL DATA</strong>. This cannot be undone!', 'DANGER') +
                    `\n\n#### ⚠️ Before You Drop\n\n` +
                    `1. **Backup your data** - Create a full backup using pg_dump\n` +
                    `2. **Verify connections** - Ensure no active connections to the database\n` +
                    `3. **Test on non-production** - Verify the operation is intended\n\n` +
                    MarkdownUtils.warningBox('You cannot drop a database while connected to it. This notebook connects to the postgres database to execute the DROP command.'),
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🚨 Terminate Active Connections (if needed)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Terminate all connections to the database (run this first if needed)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${item.label}'
  AND pid <> pg_backend_pid();`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ❌ Drop Command`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Drop database (use with extreme caution!)
DROP DATABASE IF EXISTS "${item.label}";`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create delete database notebook');
    }
}

export async function cmdBackupDatabase(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);

        // 1. Prompt for save location
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`${item.label}_backup.dump`),
            filters: { 'PostgreSQL Dump': ['dump', 'sql', 'tar'] },
            title: 'Select Backup Location'
        });

        if (!uri) {
            return; // User cancelled
        }

        const filePath = uri.fsPath;

        // 2. Construct pg_dump command
        // Use quotes for paths to handle spaces
        const command = `pg_dump -h ${connectionConfig.host} -p ${connectionConfig.port} -U ${connectionConfig.username} -F c -b -v -f "${filePath}" "${item.label}"`;

        // 3. Create Help HTML
        const htmlContent = `
            <h1>📦 Database Backup Guide</h1>
            <p>You are about to backup database: <strong>${item.label}</strong></p>

            <h2>Command Details</h2>
            <p>The following command has been prepared in your terminal:</p>
            <pre>${command}</pre>

            <h3>🚩 Flags Explanation:</h3>
            <ul>
                <li><code>-h, -p, -U</code>: Connection details (Host, Port, User)</li>
                <li><code>-F c</code>: Custom format (compressed, allows reordering)</li>
                <li><code>-b</code>: Include large objects (blobs)</li>
                <li><code>-v</code>: Verbose mode (show progress)</li>
                <li><code>-f</code>: Output file path</li>
            </ul>

            <h2>🚀 Next Steps</h2>
            <ol>
                <li>Go to the <strong>Terminal</strong> panel below.</li>
                <li>Review the command.</li>
                <li>Press <strong>Enter</strong> to execute.</li>
                <li>Enter your password if prompted.</li>
            </ol>

            <div class="alert info">
                <strong>ℹ️ Note:</strong> Ensure <code>pg_dump</code> is installed and in your system PATH.
            </div>
        `;

        // 4. Show Help Webview
        createHelpPanel(context, 'Backup Guide', htmlContent);

        // 5. Open Terminal and Send Command
        const terminal = vscode.window.createTerminal(`PG Backup: ${item.label}`);
        terminal.show(true); // Preserve focus on editor if possible, but usually terminal takes focus
        terminal.sendText(command, false); // false = do not execute immediately

    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'initiate backup');
    }
}

export async function cmdRestoreDatabase(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);

        // 1. Prompt for source file
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'PostgreSQL Dump': ['dump', 'sql', 'tar', 'backup'] },
            title: 'Select Backup File to Restore'
        });

        if (!uris || uris.length === 0) {
            return; // User cancelled
        }

        const filePath = uris[0].fsPath;

        // 2. Construct pg_restore command
        // Note: -d is target database
        const command = `pg_restore -h ${connectionConfig.host} -p ${connectionConfig.port} -U ${connectionConfig.username} -d "${item.label}" -v "${filePath}"`;

        // 3. Create Help HTML
        const htmlContent = `
            <h1>♻️ Database Restore Guide</h1>
            <p>You are about to restore database: <strong>${item.label}</strong></p>

            <h2>Command Details</h2>
            <p>The following command has been prepared in your terminal:</p>
            <pre>${command}</pre>

            <h3>🚩 Flags Explanation:</h3>
            <ul>
                <li><code>-h, -p, -U</code>: Connection details</li>
                <li><code>-d</code>: Target database name</li>
                <li><code>-v</code>: Verbose mode</li>
                <li><code>"${filePath}"</code>: Source backup file</li>
            </ul>

            <div class="alert warning">
                <strong>⚠️ Warning:</strong> Restoring will modify the existing database. Ensure you are restoring to the correct target!
            </div>

            <h2>🚀 Next Steps</h2>
            <ol>
                <li>Go to the <strong>Terminal</strong> panel below.</li>
                <li>Review the command.</li>
                <li>Press <strong>Enter</strong> to execute.</li>
                <li>Enter your password if prompted.</li>
            </ol>

            <div class="alert info">
                <strong>ℹ️ Note:</strong> Ensure <code>pg_restore</code> is installed and in your system PATH.
            </div>
        `;

        // 4. Show Help Webview
        createHelpPanel(context, 'Restore Guide', htmlContent);

        // 5. Open Terminal and Send Command
        const terminal = vscode.window.createTerminal(`PG Restore: ${item.label}`);
        terminal.show(true);
        terminal.sendText(command, false); // false = do not execute immediately

    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'initiate restore');
    }
}

export async function cmdGenerateCreateScript(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const connection = await ConnectionManager.getInstance().getConnection({
            id: connectionConfig.id,
            host: connectionConfig.host,
            port: connectionConfig.port,
            username: connectionConfig.username,
            database: 'postgres', // Connect to postgres to get DB definition
            name: connectionConfig.name
        });
        const metadata = createMetadata(connectionConfig, 'postgres');

        const res = await connection.query(`
            SELECT 'CREATE DATABASE "' || datname || '" WITH OWNER = "' || pg_get_userbyid(datdba) || '"' ||
            ' ENCODING = ''' || pg_encoding_to_char(encoding) || '''' ||
            ' LC_COLLATE = ''' || datcollate || '''' ||
            ' LC_CTYPE = ''' || datctype || ''';' as create_sql
            FROM pg_database WHERE datname = $1
        `, [item.databaseName]);

        const createSql = res.rows[0]?.create_sql || `-- Failed to generate CREATE script for ${item.databaseName}`;

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.header(`📝 CREATE Script: \`${item.label}\``) +
                    MarkdownUtils.infoBox('This is the SQL script to recreate the database definition. Copy and modify as needed.') +
                    `\n\n#### 📚 Database Properties\n\n` +
                    `The script includes:\n` +
                    `- 👤 Owner specification\n` +
                    `- 📝 Character encoding\n` +
                    `- 🌐 Locale settings (collation and ctype)\n`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📄 Database Definition`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                createSql,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate create script');
    }
}

export async function cmdDisconnectDatabase(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        vscode.window.showInformationMessage(`Disconnected from ${item.label} (Session cleared)`);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'disconnect');
    }
}

export async function cmdMaintenanceDatabase(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connectionConfig, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.header(`🛠️ Database Maintenance: \`${item.label}\``) +
                    MarkdownUtils.infoBox('Perform standard maintenance operations to optimize database performance.') +
                    `\n\n#### 🎯 Maintenance Operations\n\n` +
                    MarkdownUtils.operationsTable([
                        { operation: 'VACUUM', description: 'Reclaims storage occupied by dead tuples' },
                        { operation: 'ANALYZE', description: 'Updates optimizer statistics for better query plans' },
                        { operation: 'REINDEX', description: 'Rebuilds indexes (use during maintenance windows)' },
                        { operation: 'VACUUM FULL', description: 'Compacts tables (requires exclusive lock)' }
                    ]) +
                    `\n\n#### ⏱️ When to Run\n\n` +
                    `- ✅ After large batch DELETE or UPDATE operations\n` +
                    `- ✅ When query performance degrades\n` +
                    `- ✅ Before major reporting operations\n` +
                    `- ✅ During scheduled maintenance windows\n\n` +
                    MarkdownUtils.successBox('PostgreSQL has autovacuum running automatically, but manual maintenance can be useful after bulk operations.'),
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🧹 VACUUM & ANALYZE`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Vacuum and update statistics (safe, non-blocking)
VACUUM (VERBOSE, ANALYZE);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📊 Tables Needing Maintenance`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Check tables with dead tuples
SELECT 
    schemaname || '.' || relname as "Table",
    n_dead_tup as "Dead Tuples",
    n_live_tup as "Live Tuples",
    last_vacuum as "Last Vacuum",
    last_autovacuum as "Last Auto Vacuum",
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) as "Total Size"
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY n_dead_tup DESC
LIMIT 20;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔄 REINDEX (Use with Caution)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Reindex entire database (locks tables during rebuild)
-- REINDEX DATABASE "${item.label}";

-- Reindex specific table (safer approach)
-- REINDEX TABLE schema_name.table_name;`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create maintenance notebook');
    }
}

export async function cmdQueryTool(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connectionConfig, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.header(`📝 Query Tool: \`${item.label}\``) +
                    MarkdownUtils.infoBox('Write and execute SQL queries against this database.'),
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Write your SQL query here
SELECT 1;`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'open query tool');
    }
}

export async function cmdPsqlTool(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);

        const terminal = vscode.window.createTerminal(`PSQL: ${item.label}`);
        terminal.show();
        terminal.sendText(`psql -h ${connectionConfig.host} -p ${connectionConfig.port} -U ${connectionConfig.username} -d "${item.label}"`);

    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'open PSQL tool');
    }
}

export async function cmdShowConfiguration(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connectionConfig, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.header(`⚙️ Database Configuration: \`${item.label}\``) +
                    MarkdownUtils.infoBox('View and analyze current configuration settings for this PostgreSQL database.') +
                    `\n\n#### 📚 Configuration Categories\n\n` +
                    MarkdownUtils.operationsTable([
                        { operation: 'Connections', description: 'Connection limits, timeouts, and authentication' },
                        { operation: 'Memory', description: 'Shared buffers, work memory, maintenance memory' },
                        { operation: 'WAL', description: 'Write-ahead logging and checkpoint settings' },
                        { operation: 'Query Tuning', description: 'Planner costs, parallelism, and optimization' },
                        { operation: 'Logging', description: 'Log destinations, levels, and rotation' }
                    ]) +
                    `\n\n` +
                    MarkdownUtils.successBox('Filter by category to find specific settings. Most settings require a server restart to change.'),
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📋 All Configuration Settings`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- View all configuration settings
SELECT 
    name as "Setting",
    setting as "Value",
    unit as "Unit",
    category as "Category",
    short_desc as "Description"
FROM pg_settings 
ORDER BY category, name;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 💻 Memory Settings`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Memory-related settings
SELECT 
    name as "Setting",
    setting as "Value",
    unit as "Unit",
    short_desc as "Description"
FROM pg_settings 
WHERE category LIKE '%Memory%' OR name LIKE '%memory%' OR name LIKE '%buffer%'
ORDER BY name;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔗 Connection Settings`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Connection-related settings
SELECT 
    name as "Setting",
    setting as "Value",
    unit as "Unit",
    short_desc as "Description"
FROM pg_settings 
WHERE category LIKE '%Connection%' OR name LIKE '%connection%'
ORDER BY name;`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'show configuration');
    }
}

/**
 * Helper function to create a styled Webview panel for help guides.
 */
function createHelpPanel(context: vscode.ExtensionContext, title: string, content: string) {
    const panel = vscode.window.createWebviewPanel(
        'pgHelp',
        title,
        vscode.ViewColumn.One,
        {
            enableScripts: false,
            localResourceRoots: []
        }
    );

    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { 
            font-family: var(--vscode-font-family); 
            color: var(--vscode-editor-foreground); 
            background-color: var(--vscode-editor-background); 
            padding: 20px; 
            line-height: 1.6;
        }
        h1, h2, h3 { color: var(--vscode-textLink-foreground); }
        h1 { border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 10px; }
        code { 
            background-color: var(--vscode-textBlockQuote-background); 
            padding: 2px 4px; 
            border-radius: 3px; 
            font-family: var(--vscode-editor-font-family);
        }
        pre { 
            background-color: var(--vscode-textBlockQuote-background); 
            padding: 15px; 
            border-radius: 5px; 
            overflow-x: auto; 
            border: 1px solid var(--vscode-widget-border);
        }
        .alert { 
            padding: 15px; 
            border-left: 5px solid; 
            margin: 20px 0; 
            border-radius: 3px; 
        }
        .info { 
            background-color: rgba(52, 152, 219, 0.1); 
            border-color: #3498db; 
        }
        .warning { 
            background-color: rgba(231, 76, 60, 0.1); 
            border-color: #e74c3c; 
        }
        ul, ol { padding-left: 25px; }
        li { margin-bottom: 5px; }
    </style>
</head>
<body>
    ${content}
</body>
</html>`;
}

/**
 * cmdScriptAlterDatabase - Command to generate ALTER DATABASE script.
 */
export async function cmdScriptAlterDatabase(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connectionConfig, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.header(`📝 ALTER Database: \`${item.label}\``) +
                    MarkdownUtils.infoBox('Use these commands to modify database attributes. Uncomment and modify the operations you want to perform.') +
                    `\n\n#### 🎯 Available Modifications\n\n` +
                    MarkdownUtils.operationsTable([
                        { operation: 'RENAME', description: 'Change the database name' },
                        { operation: 'OWNER', description: 'Transfer ownership to another role' },
                        { operation: 'SET', description: 'Set runtime configuration parameters' },
                        { operation: 'CONNECTION LIMIT', description: 'Set maximum concurrent connections' },
                        { operation: 'TABLESPACE', description: 'Change default tablespace' }
                    ]) +
                    `\n\n` +
                    MarkdownUtils.warningBox('Some operations require exclusive access to the database. Rename operations require no active connections.'),
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔄 Rename Database`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Rename database (requires no active connections)
-- ALTER DATABASE "${item.label}" RENAME TO new_name;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 👤 Change Owner`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Change database owner
-- ALTER DATABASE "${item.label}" OWNER TO new_owner;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ⚙️ Set Configuration Parameters`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Set configuration parameter for this database
-- ALTER DATABASE "${item.label}" SET configuration_parameter TO value;

-- Example: Set search path
-- ALTER DATABASE "${item.label}" SET search_path TO schema_name, public;

-- Example: Set timezone
-- ALTER DATABASE "${item.label}" SET timezone TO 'UTC';

-- Reset to default
-- ALTER DATABASE "${item.label}" RESET configuration_parameter;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔌 Connection Limit`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Set connection limit (-1 for unlimited)
-- ALTER DATABASE "${item.label}" WITH CONNECTION LIMIT 50;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📁 Change Tablespace`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Move database to different tablespace
-- ALTER DATABASE "${item.label}" SET TABLESPACE new_tablespace;`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'generate alter script');
    }
}