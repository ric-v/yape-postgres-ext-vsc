import { Client } from 'pg';
import * as vscode from 'vscode';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem, validateRoleItem } from '../commands/connection';
import { ConnectionManager } from '../services/ConnectionManager';

/**
 * ROLE_DETAILS_QUERY - SQL query to retrieve role details including attributes, memberships, privileges, and accessible databases.
 * fetches - the role details from the database.
 */
const ROLE_DETAILS_QUERY = `
WITH RECURSIVE
role_memberships AS(
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
    WHERE r.rolname = $1
),
role_privileges AS(
            SELECT array_agg(
                privilege_type || ' ON ' ||
                CASE 
            WHEN table_schema = 'public' THEN table_name
            ELSE table_schema || '.' || table_name
        END
            ) as privileges
    FROM information_schema.table_privileges
    WHERE grantee = $1
    GROUP BY grantee
        ),
    database_access AS(
        SELECT array_agg(quote_ident(d.datname)) as databases
    FROM pg_database d
    JOIN pg_roles r ON r.rolname = $1
    WHERE EXISTS(
            SELECT 1 FROM aclexplode(d.datacl) acl
        WHERE acl.grantee = r.oid
        AND acl.privilege_type = 'CONNECT'
        )
    )
SELECT
rm.*,
    COALESCE(rp.privileges, ARRAY[]:: text[]) as privileges,
    COALESCE(da.databases, ARRAY[]:: text[]) as accessible_databases
FROM role_memberships rm
LEFT JOIN role_privileges rp ON true
LEFT JOIN database_access da ON true; `;


/**
 * cmdAddUser - Creates a notebook for adding a new PostgreSQL user.
 * Generates commands for:
 * - Creating a user with login privileges
 * - Setting password and attributes
 * - Granting default privileges
 * 
 * @param {DatabaseTreeItem} item - The selected database item
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdAddUser(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Create New User\n\nExecute the cell below to create a new user. Modify the user attributes as needed.`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create a new user with login privileges
CREATE USER username WITH
LOGIN
    PASSWORD 'strong_password'
CREATEDB
--Add more attributes as needed:
--SUPERUSER
--CREATEROLE
--REPLICATION
--CONNECTION LIMIT 5
--VALID UNTIL 'timestamp'
    ;

--Optional: Grant default privileges
GRANT CONNECT ON DATABASE database_name TO username;
--GRANT role_name TO username; `,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create user notebook: ${err.message} `);
    }
}

/**
 * cmdAddRole - Creates a notebook for adding a new PostgreSQL role.
 * Generates commands for:
 * - Creating a role with specified attributes
 * - Setting role options
 * - Granting privileges
 * 
 * @param {DatabaseTreeItem} item - The selected database item
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdAddRole(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Create New Role\n\nExecute the cell below to create a new role. Modify the role attributes as needed.`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create a new role
CREATE ROLE role_name WITH
NOLOGIN
--Add more attributes as needed:
--SUPERUSER | NOSUPERUSER
--CREATEDB | NOCREATEDB
--CREATEROLE | NOCREATEROLE
--INHERIT | NOINHERIT
--REPLICATION | NOREPLICATION
    ;

--Optional: Grant privileges to the role
--GRANT privilege ON object TO role_name;
--GRANT other_role TO role_name; `,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create role notebook: ${err.message} `);
    }
}

/**
 * cmdEditRole - Creates a notebook for editing an existing role's attributes.
 * 
 * @param {DatabaseTreeItem} item - The selected role item
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdEditRole(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateRoleItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Edit Role: ${item.label}\n\nModify the role's attributes using the ALTER ROLE command below.`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Modify role attributes
ALTER ROLE ${item.label}
    -- Uncomment and modify the attributes you want to change:
    -- WITH PASSWORD 'new_password'
    -- SUPERUSER | NOSUPERUSER
    -- CREATEDB | NOCREATEDB
    -- CREATEROLE | NOCREATEROLE
    -- LOGIN | NOLOGIN
    -- INHERIT | NOINHERIT
    -- REPLICATION | NOREPLICATION
    -- CONNECTION LIMIT 5
    -- VALID UNTIL 'timestamp'
;`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create role edit notebook: ${err.message}`);
    }
}

/**
 * cmdGrantRevokeRole - Creates a notebook for managing role privileges.
 * Shows commands for:
 * - Granting database privileges
 * - Granting schema privileges
 * - Granting table privileges
 * - Granting function privileges
 * - Revoking privileges
 * 
 * @param {DatabaseTreeItem} item - The selected role item
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdGrantRevokeRole(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateRoleItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Manage Privileges for ${item.label}\n\nGrant or revoke privileges using the commands below. Uncomment the lines you wish to execute.`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Grant database-level privileges
GRANT CONNECT ON DATABASE database_name TO ${item.label};
-- GRANT CREATE ON DATABASE database_name TO ${item.label};

-- Grant schema-level privileges
GRANT USAGE ON SCHEMA schema_name TO ${item.label};
-- GRANT CREATE ON SCHEMA schema_name TO ${item.label};

-- Grant table-level privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA schema_name TO ${item.label};
-- GRANT SELECT ON TABLE schema_name.table_name TO ${item.label};

-- Grant function-level privileges
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA schema_name TO ${item.label};
-- GRANT EXECUTE ON FUNCTION schema_name.function_name TO ${item.label};

-- Grant sequence privileges
GRANT USAGE ON ALL SEQUENCES IN SCHEMA schema_name TO ${item.label};

-- Revoke privileges (examples)
-- REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA schema_name FROM ${item.label};
-- REVOKE ALL PRIVILEGES ON DATABASE database_name FROM ${item.label};`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create privileges notebook: ${err.message}`);
    }
}

/**
 * cmdDropRole - Creates a notebook for dropping a role.
 * Includes options for:
 * - Reassigning owned objects
 * - Dropping the role
 * 
 * @param {DatabaseTreeItem} item - The selected role item
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdDropRole(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateRoleItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Drop Role: ${item.label}\n\n> [!WARNING]\n> **Warning:** This action will permanently delete the role. Make sure to reassign owned objects first if needed.`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Optional: Reassign owned objects to another role first
REASSIGN OWNED BY ${item.label} TO some_other_role;

-- Drop role
DROP ROLE ${item.label};`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create drop role notebook: ${err.message}`);
    }
}

/**
 * cmdAllRoleOperations - Creates a notebook with common role operations.
 * Shows operations for:
 * - Viewing role attributes
 * - Listing role memberships
 * - Listing granted privileges
 * - Managing the role
 * 
 * @param {DatabaseTreeItem} item - The selected role item
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdRoleOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateRoleItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `# Role Operations: ${item.label}\n\nThis notebook contains common operations for managing the role. Run the cells below to execute the operations.\n\n## Available Operations\n- **View Attributes**: Show role settings\n- **List Memberships**: Roles this role belongs to\n- **List Members**: Roles that belong to this role\n- **List Privileges**: Objects this role can access`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- View role attributes
SELECT r.rolname,
       r.rolsuper as "Superuser",
       r.rolinherit as "Inherit",
       r.rolcreaterole as "Create role",
       r.rolcreatedb as "Create DB",
       r.rolcanlogin as "Can login",
       r.rolreplication as "Replication",
       r.rolconnlimit as "Connection limit",
       r.rolvaliduntil as "Valid until"
FROM pg_roles r
WHERE r.rolname = '${item.label}';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- List role memberships (roles this role belongs to)
SELECT r.rolname as "Role",
       m.rolname as "Member of",
       g.rolname as "Granted by",
       am.admin_option as "With admin option"
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.member
JOIN pg_roles m ON m.oid = am.roleid
JOIN pg_roles g ON g.oid = am.grantor
WHERE r.rolname = '${item.label}';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- List members of this role (roles that belong to this role)
SELECT r.rolname as "Role",
       m.rolname as "Has member",
       g.rolname as "Granted by",
       am.admin_option as "With admin option"
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
JOIN pg_roles g ON g.oid = am.grantor
WHERE r.rolname = '${item.label}';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- List granted privileges
SELECT 
    grantor,
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.table_privileges
WHERE grantee = '${item.label}'
ORDER BY table_schema, table_name, privilege_type;`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to create role operations notebook: ${err.message}`);
    }
}

/**
 * cmdShowRoleProperties - Shows properties of a role in a notebook.
 * Displays:
 * - Role attributes
 * - Role memberships
 * - Accessible databases
 * - Granted privileges
 * 
 * @param {DatabaseTreeItem} item - The selected role item
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdShowRoleProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateRoleItem(item);
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const client = await ConnectionManager.getInstance().getConnection({
            id: connectionConfig.id,
            host: connectionConfig.host,
            port: connectionConfig.port,
            username: connectionConfig.username,
            database: item.databaseName,
            name: connectionConfig.name
        });

        try {

            const roleResult = await client.query(ROLE_DETAILS_QUERY, [item.label]);
            if (roleResult.rows.length === 0) {
                throw new Error('Role not found');
            }

            const role = roleResult.rows[0];
            const metadata = createMetadata(connectionConfig, item.databaseName);

            // Format sections
            const sections = formatRoleSections(role);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `# Role Properties: ${item.label}\n\n` +
                    `## Attributes\n\`\`\`\n${sections.attributes}\n\`\`\`\n\n` +
                    sections.membershipSection + '\n' +
                    sections.databasesSection + '\n' +
                    sections.privilegesSection + '\n\n' +
                    `Execute the cell below to query the latest role details from the database.`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    generateRoleDetailsQuery(item.label),
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager, no need to close
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to show role properties: ${err.message}`);
    }
}

/**
 * Helper function to format role information sections
 */
function formatRoleSections(role: any) {
    const attributes = [
        role.rolsuper ? '✓ Superuser' : '✗ Superuser',
        role.rolinherit ? '✓ Inherit' : '✗ Inherit',
        role.rolcreaterole ? '✓ Create role' : '✗ Create role',
        role.rolcreatedb ? '✓ Create DB' : '✗ Create DB',
        role.rolcanlogin ? '✓ Can login' : '✗ Can login',
        role.rolreplication ? '✓ Replication' : '✗ Replication',
        role.rolbypassrls ? '✓ Bypass RLS' : '✗ Bypass RLS',
        `Connection limit: ${role.rolconnlimit === -1 ? 'no limit' : role.rolconnlimit}`,
        role.rolvaliduntil ? `Valid until: ${role.rolvaliduntil}` : 'No expiration'
    ].join('\n');

    const membershipSection = [
        '## Role Memberships',
        role.member_of && role.member_of.length > 0
            ? `\n### Member of:\n- ${role.member_of.join('\n- ')}`
            : '\n### Member of: None',
        role.members && role.members.length > 0
            ? `\n### Has members:\n- ${role.members.join('\n- ')}`
            : '\n### Has members: None'
    ].join('\n');

    const databasesSection = role.accessible_databases && role.accessible_databases.length > 0
        ? `\n## Accessible Databases\n- ${role.accessible_databases.join('\n- ')}`
        : '\n## Accessible Databases\nNo database access';

    const privilegesSection = role.privileges && role.privileges.length > 0
        ? `\n## Granted Privileges\n- ${role.privileges.join('\n- ')}`
        : '\n## Granted Privileges\nNo specific privileges granted';

    return {
        attributes,
        membershipSection,
        databasesSection,
        privilegesSection
    };
}

/**
 * Helper function to generate role details query
 */
function generateRoleDetailsQuery(roleName: string): string {
    return `-- View role details
SELECT r.rolname as "Name",
       r.rolsuper as "Superuser",
       r.rolinherit as "Inherit",
       r.rolcreaterole as "Create role",
       r.rolcreatedb as "Create DB",
       r.rolcanlogin as "Can login",
       r.rolreplication as "Replication",
       r.rolconnlimit as "Connection limit",
       r.rolvaliduntil as "Valid until",
       r.rolbypassrls as "Bypass RLS"
FROM pg_roles r
WHERE r.rolname = '${roleName}';

-- View role memberships
SELECT 
    r.rolname as role,
    m.rolname as member_of,
    g.rolname as granted_by,
    am.admin_option
FROM pg_roles r
JOIN pg_auth_members am ON r.oid = am.member
JOIN pg_roles m ON m.oid = am.roleid
JOIN pg_roles g ON g.oid = am.grantor
WHERE r.rolname = '${roleName}';

-- View role members
SELECT 
    r.rolname as role,
    m.rolname as has_member,
    g.rolname as granted_by,
    am.admin_option
FROM pg_roles r
JOIN pg_auth_members am ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
JOIN pg_roles g ON g.oid = am.grantor
WHERE r.rolname = '${roleName}';

-- View granted privileges
SELECT 
    grantor,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.table_privileges
WHERE grantee = '${roleName}'
ORDER BY table_schema, table_name, privilege_type;`;
}

/**
 * cmdRefreshRole - Refreshes the role item in the tree view.
 */
export async function cmdRefreshRole(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    databaseTreeProvider?.refresh(item);
}