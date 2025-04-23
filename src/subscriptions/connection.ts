import * as vscode from 'vscode';
import { Client } from 'pg';
import { DatabaseTreeItem } from '../databaseTreeProvider';

/**
 * PostgresMetadata - Interface representing metadata for a PostgreSQL connection.
 * @property {string} connectionId - The ID of the connection.
 * @property {string | undefined} databaseName - The name of the database.
 * @property {string} host - The host of the PostgreSQL server.
 * @property {number} port - The port of the PostgreSQL server.
 * @property {string} username - The username for the PostgreSQL connection.
 * @property {string} password - The password for the PostgreSQL connection.
 * @property {object} custom - Custom notebook metadata structure.
 * @property {any[]} custom.cells - Array of cells in the notebook.
 * @property {object} custom.metadata - Metadata for the notebook.
 * @property {string} custom.metadata.connectionId - The ID of the connection.
 * @property {string | undefined} custom.metadata.databaseName - The name of the database.
 * @property {string} custom.metadata.host - The host of the PostgreSQL server.
 * @property {number} custom.metadata.port - The port of the PostgreSQL server.
 * @property {string} custom.metadata.username - The username for the PostgreSQL connection.
 * @property {string} custom.metadata.password - The password for the PostgreSQL connection.
 * @property {boolean} custom.metadata.enableScripts - Flag indicating if scripts are enabled.
 * 
 * @example
 * const metadata: PostgresMetadata = {
 *   connectionId: 'my_connection_id',
 *   databaseName: 'my_database',
 *   host: 'localhost',
 *   port: 5432,
 *   username: 'my_username',
 *   password: 'my_password',
 *   custom: {
 *     cells: [],
 *     metadata: {
 *       connectionId: 'my_connection_id',
 *       databaseName: 'my_database',
 *       host: 'localhost',
 *       port: 5432,
 *       username: 'my_username',
 *       password: 'my_password',
 *       enableScripts: true
 *     }
 *   }
 * };
 * 
 * // This metadata can be used to create a PostgreSQL client or for other purposes.
 */
interface PostgresMetadata {
    connectionId: string;
    databaseName: string | undefined;
    host: string;
    port: number;
    username: string;
    password: string;
    custom?: {
        cells: any[];
        metadata: {
            connectionId: string;
            databaseName: string | undefined;
            host: string;
            port: number;
            username: string;
            password: string;
            enableScripts: boolean;
        };
    };
}

/**
 * createPgClient - Creates a PostgreSQL client and connects to the database.
 * @param {any} connection - The connection object containing connection details.
 * @param {string | undefined} databaseName - The name of the database to connect to.
 * @returns {Promise<Client>} - A promise that resolves to the connected PostgreSQL client.
 * @throws {Error} - Throws an error if the connection fails.
 * 
 * @example 
 * const client = await createPgClient(connection, 'my_database');
 * // Use the client to execute queries
 * await client.query('SELECT * FROM my_table');
 * await client.end(); // Close the connection when done
 */
export async function createPgClient(connection: any, databaseName: string | undefined): Promise<Client> {
    const client = new Client({
        host: connection.host,
        port: connection.port,
        user: connection.username,
        password: String(connection.password),
        database: databaseName || connection.database,
        connectionTimeoutMillis: 5000
    });
    await client.connect();
    return client;
}

/**
 * createMetadata - Creates metadata for the PostgreSQL connection.
 * @param {any} connection - The connection object containing connection details.
 * @param {string | undefined} databaseName - The name of the database.
 * @returns {PostgresMetadata} - An object containing metadata for the PostgreSQL connection.
 *  
 * @example
 * const metadata = createMetadata(connection, 'my_database');
 * console.log(metadata);
 */
export function createMetadata(connection: any, databaseName: string | undefined): PostgresMetadata {
    // Create the base metadata object
    const metadata = {
        connectionId: connection.id,
        databaseName: databaseName,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password
    };

    // Wrap it in the custom object structure expected by the notebook
    return {
        ...metadata,
        custom: {
            cells: [],
            metadata: {
                ...metadata,
                enableScripts: true
            }
        }
    };
}

/**
 * closeClient - Closes the PostgreSQL client connection.
 * @param {Client | undefined} client - The PostgreSQL client to close.
 * @returns {Promise<void>} - A promise that resolves when the client is closed.
 * 
 * @example
 * await closeClient(client);
 * // Client is now closed
 */
export async function closeClient(client: Client | undefined): Promise<void> {
    if (client) {
        try {
            await client.end();
        } catch (err) {
            console.error('Error closing connection:', err);
        }
    }
}

/**
 * createAndShowNotebook - Creates and displays a notebook with the provided cells and metadata.
 * @param {vscode.NotebookCellData[]} cells - The cells to include in the notebook.
 * @param {PostgresMetadata} metadata - The metadata for the notebook.
 * @returns {Promise<void>} - A promise that resolves when the notebook is displayed.
 * 
 * @example
 * const cells = [new vscode.NotebookCellData(vscode.NotebookCellKind.Code, 'SELECT * FROM my_table;', 'postgresql')];
 * const metadata = createMetadata(connection, 'my_database');
 * await createAndShowNotebook(cells, metadata);
 * // Notebook is now displayed
 */
export async function createAndShowNotebook(cells: vscode.NotebookCellData[], metadata: PostgresMetadata): Promise<void> {
    const notebookData = new vscode.NotebookData(cells);
    notebookData.metadata = metadata;
    const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', notebookData);
    await vscode.window.showNotebookDocument(notebook);
}

/**
 * validateItem - Validates the selected item in the database tree.
 * @param {DatabaseTreeItem} item - The selected item in the database tree.
 * @throws {Error} - Throws an error if the item is invalid.
 * 
 * @example
 * const item = getSelectedItem();
 * validateItem(item);
 * // If the item is valid, proceed with further actions
 */
export function validateItem(item: DatabaseTreeItem): asserts item is DatabaseTreeItem & { schema: string; connectionId: string } {
    if (!item?.schema || !item?.connectionId) {
        throw new Error('Invalid function selection');
    }
}

/**
 * getConnectionWithPassword - Retrieves the connection details and password for the specified connection ID.
 * @param {string} connectionId - The ID of the connection.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<any>} - A promise that resolves to the connection details with the password.
 * 
 * @example
 * const connectionId = 'my_connection_id';
 * const context = getExtensionContext();
 * const connection = await getConnectionWithPassword(connectionId, context);
 * console.log(connection);
 * // Connection details with password are now available
 */
export async function getConnectionWithPassword(connectionId: string, context: vscode.ExtensionContext): Promise<any> {
    const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
    const connection = connections.find(c => c.id === connectionId);
    
    if (!connection) {
        throw new Error('Connection not found');
    }

    const password = await context.secrets.get(`postgres-password-${connectionId}`);
    if (!password) {
        throw new Error('Password not found in secure storage');
    }

    return {
        ...connection,
        password
    };
}
