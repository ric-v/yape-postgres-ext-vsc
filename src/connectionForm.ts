import * as vscode from 'vscode';
import { Client } from 'pg';

export interface ConnectionInfo {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    password: string;
    database?: string;
}

export class ConnectionFormPanel {
    public static currentPanel: ConnectionFormPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, private readonly _extensionContext: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._initialize();

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'testConnection':
                        try {
                            const client = new Client({
                                host: message.connection.host,
                                port: message.connection.port,
                                user: message.connection.username,
                                password: message.connection.password,
                                database: message.connection.database
                            });
                            await client.connect();
                            const result = await client.query('SELECT version()');
                            await client.end();
                            this._panel.webview.postMessage({ 
                                type: 'testSuccess',
                                version: result.rows[0].version
                            });
                        } catch (err: any) {
                            this._panel.webview.postMessage({ 
                                type: 'testError',
                                error: err.message
                            });
                        }
                        break;

                    case 'saveConnection':
                        try {
                            const client = new Client({
                                host: message.connection.host,
                                port: message.connection.port,
                                user: message.connection.username,
                                password: message.connection.password,
                                database: 'postgres'
                            });

                            await client.connect();
                            
                            const result = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
                            await client.end();

                            const connections = this.getStoredConnections();
                            const newConnection: ConnectionInfo = {
                                id: Date.now().toString(),
                                name: message.connection.name,
                                host: message.connection.host,
                                port: message.connection.port,
                                username: message.connection.username,
                                password: message.connection.password
                            };
                            connections.push(newConnection);
                            await this.storeConnections(connections);

                            vscode.window.showInformationMessage('Connection saved successfully!');
                            vscode.commands.executeCommand('postgres-explorer.refreshConnections');
                            this._panel.dispose();
                        } catch (err: any) {
                            const errorMessage = err?.message || 'Unknown error occurred';
                            vscode.window.showErrorMessage(`Failed to connect: ${errorMessage}`);
                        }
                        break;
                }
            },
            undefined,
            this._disposables
        );
    }

    public static show(extensionUri: vscode.Uri, extensionContext: vscode.ExtensionContext) {
        if (ConnectionFormPanel.currentPanel) {
            ConnectionFormPanel.currentPanel._panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'connectionForm',
            'Add PostgreSQL Connection',
            vscode.ViewColumn.One,
            {
                enableScripts: true
            }
        );

        ConnectionFormPanel.currentPanel = new ConnectionFormPanel(panel, extensionUri, extensionContext);
    }

    private async _initialize() {
        // The message handler is already set up in the constructor
        await this._update();
    }

    private async _update() {
        this._panel.webview.html = await this._getHtmlForWebview(this._panel.webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const logoPath = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'postgres-explorer.png'));
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Add PostgreSQL Connection</title>
            <style>
                body {
                    padding: 20px;
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-font-family);
                }
                .header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 30px;
                    gap: 20px;
                }
                .header img {
                    width: 64px;
                    height: 64px;
                }
                .header-text h1 {
                    margin: 0;
                    font-size: 24px;
                    color: var(--vscode-foreground);
                }
                .header-text p {
                    margin: 5px 0 0 0;
                    opacity: 0.8;
                }
                .form-container {
                    max-width: 50%;
                    margin: 0;
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    color: var(--vscode-foreground);
                }
                input, select {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 2px;
                }
                button {
                    padding: 8px 16px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                    margin-top: 10px;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .required::after {
                    content: " *";
                    color: var(--vscode-errorForeground);
                }
                .button-group {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                }
                .message {
                    margin-top: 15px;
                    padding: 10px;
                    border-radius: 3px;
                }
                .error {
                    background: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    color: var(--vscode-inputValidation-errorForeground);
                }
                .success {
                    background: var(--vscode-inputValidation-infoBackground);
                    border: 1px solid var(--vscode-inputValidation-infoBorder);
                    color: var(--vscode-inputValidation-infoForeground);
                }
            </style>
        </head>
        <body>
            <div class="header">
                <img src="${logoPath}" alt="PostgreSQL Explorer">
                <div class="header-text">
                    <h1>PostgreSQL Explorer</h1>
                    <p>Connect to your PostgreSQL database and explore your data with ease.</p>
                </div>
            </div>
            <div class="form-container">
                <form id="connectionForm">
                    <div class="form-group">
                        <label for="name" class="required">Connection Name</label>
                        <input type="text" id="name" name="name" required placeholder="My Database Connection">
                    </div>
                    <div class="form-group">
                        <label for="host" class="required">Host</label>
                        <input type="text" id="host" name="host" required placeholder="localhost">
                    </div>
                    <div class="form-group">
                        <label for="port" class="required">Port</label>
                        <input type="number" id="port" name="port" value="5432" required>
                    </div>
                    <div class="form-group">
                        <label for="database">Database</label>
                        <input type="text" id="database" name="database" placeholder="postgres">
                    </div>
                    <div class="form-group">
                        <label for="username" class="required">Username</label>
                        <input type="text" id="username" name="username" required placeholder="postgres">
                    </div>
                    <div class="form-group">
                        <label for="password" class="required">Password</label>
                        <input type="password" id="password" name="password" required>
                    </div>
                    <div id="message" style="display: none;" class="message"></div>
                    <div class="button-group">
                        <button type="submit">Add Connection</button>
                        <button type="button" id="testConnection">Test Connection</button>
                    </div>
                </form>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                const messageDiv = document.getElementById('message');

                function showMessage(text, isError = false) {
                    messageDiv.textContent = text;
                    messageDiv.className = 'message ' + (isError ? 'error' : 'success');
                    messageDiv.style.display = 'block';
                }

                function getFormData() {
                    return {
                        name: document.getElementById('name').value,
                        host: document.getElementById('host').value,
                        port: parseInt(document.getElementById('port').value),
                        database: document.getElementById('database').value || 'postgres',
                        username: document.getElementById('username').value,
                        password: document.getElementById('password').value
                    };
                }

                document.getElementById('testConnection').addEventListener('click', () => {
                    messageDiv.style.display = 'none';
                    vscode.postMessage({
                        command: 'testConnection',
                        connection: getFormData()
                    });
                });

                document.getElementById('connectionForm').addEventListener('submit', (e) => {
                    e.preventDefault();
                    messageDiv.style.display = 'none';
                    vscode.postMessage({
                        command: 'saveConnection',
                        connection: getFormData()
                    });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'testSuccess':
                            showMessage('Connection successful! Server version: ' + message.version);
                            break;
                        case 'testError':
                            showMessage(message.error, true);
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private getStoredConnections(): ConnectionInfo[] {
        const connections = vscode.workspace.getConfiguration().get<ConnectionInfo[]>('postgresExplorer.connections') || [];
        return connections;
    }

    private async storeConnections(connections: ConnectionInfo[]): Promise<void> {
        try {
            // First store the connections without passwords in settings
            const connectionsForSettings = connections.map(({ password, ...connWithoutPassword }) => connWithoutPassword);
            await vscode.workspace.getConfiguration().update('postgresExplorer.connections', connectionsForSettings, vscode.ConfigurationTarget.Global);

            // Then store passwords in SecretStorage
            const secretsStorage = this._extensionContext.secrets;
            for (const conn of connections) {
                if (conn.password) {
                    // Removed logging of sensitive connection information for security.
                    await secretsStorage.store(`postgres-password-${conn.id}`, conn.password);
                }
            }
        } catch (error) {
            console.error('Failed to store connections:', error);
            // If anything fails, make sure we don't leave passwords in settings
            const existingConnections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
            const sanitizedConnections = existingConnections.map(({ password, ...connWithoutPassword }) => connWithoutPassword);
            await vscode.workspace.getConfiguration().update('postgresExplorer.connections', sanitizedConnections, vscode.ConfigurationTarget.Global);
            throw error;
        }
    }

    private dispose() {
        ConnectionFormPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
