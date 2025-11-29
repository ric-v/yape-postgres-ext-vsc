import { Client } from 'pg';
import * as vscode from 'vscode';

export interface ConnectionInfo {
    id: string;
    name: string;
    host: string;
    port: number;
    username?: string;
    password?: string;
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
                            // First try with specified database
                            const client = new Client({
                                host: message.connection.host,
                                port: message.connection.port,
                                user: message.connection.username || undefined,
                                password: message.connection.password || undefined,
                                database: message.connection.database || 'postgres'
                            });
                            try {
                                await client.connect();
                                const result = await client.query('SELECT version()');
                                await client.end();
                                this._panel.webview.postMessage({
                                    type: 'testSuccess',
                                    version: result.rows[0].version
                                });
                            } catch (err: any) {
                                // If database doesn't exist, try postgres database
                                if (err.code === '3D000' && message.connection.database !== 'postgres') {
                                    const fallbackClient = new Client({
                                        host: message.connection.host,
                                        port: message.connection.port,
                                        user: message.connection.username || undefined,
                                        password: message.connection.password || undefined,
                                        database: 'postgres'
                                    });
                                    await fallbackClient.connect();
                                    const result = await fallbackClient.query('SELECT version()');
                                    await fallbackClient.end();
                                    this._panel.webview.postMessage({
                                        type: 'testSuccess',
                                        version: result.rows[0].version + ' (connected to postgres database)'
                                    });
                                } else {
                                    throw err;
                                }
                            }
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
                                user: message.connection.username || undefined,
                                password: message.connection.password || undefined,
                                database: 'postgres'
                            });

                            await client.connect();

                            // Verify we can query
                            await client.query('SELECT 1');
                            await client.end();

                            const connections = this.getStoredConnections();
                            const newConnection: ConnectionInfo = {
                                id: Date.now().toString(),
                                name: message.connection.name,
                                host: message.connection.host,
                                port: message.connection.port,
                                username: message.connection.username || undefined,
                                password: message.connection.password || undefined,
                                database: message.connection.database // Add database to saved connection
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
                :root {
                    --bg-color: var(--vscode-editor-background);
                    --text-color: var(--vscode-editor-foreground);
                    --card-bg: var(--vscode-editor-background);
                    --border-color: var(--vscode-widget-border);
                    --accent-color: var(--vscode-textLink-foreground);
                    --hover-bg: var(--vscode-list-hoverBackground);
                    --danger-color: var(--vscode-errorForeground);
                    --secondary-text: var(--vscode-descriptionForeground);
                    --font-family: var(--vscode-font-family);
                    --shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
                    --card-radius: 16px;
                    --card-border: 1px solid rgba(128, 128, 128, 0.15);
                    --input-bg: var(--vscode-input-background);
                    --input-fg: var(--vscode-input-foreground);
                    --input-border: var(--vscode-input-border);
                    --button-bg: var(--vscode-button-background);
                    --button-fg: var(--vscode-button-foreground);
                    --button-hover: var(--vscode-button-hoverBackground);
                }

                body {
                    background-color: var(--bg-color);
                    color: var(--text-color);
                    font-family: var(--font-family);
                    padding: 40px;
                    margin: 0;
                    line-height: 1.6;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                }

                .container {
                    width: 100%;
                    max-width: 800px;
                }

                .header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 32px;
                    gap: 20px;
                    justify-content: center;
                }

                .header img {
                    width: 48px;
                    height: 48px;
                }

                .header-text h1 {
                    margin: 0;
                    font-size: 24px;
                    font-weight: 500;
                    letter-spacing: -0.5px;
                }

                .header-text p {
                    margin: 4px 0 0 0;
                    color: var(--secondary-text);
                    font-size: 14px;
                }

                .card {
                    background: var(--card-bg);
                    border: var(--card-border);
                    border-radius: var(--card-radius);
                    box-shadow: var(--shadow);
                    padding: 32px;
                    position: relative;
                    overflow: hidden;
                }
                
                .card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 4px;
                    background: linear-gradient(90deg, var(--accent-color), transparent);
                    opacity: 0.5;
                }

                .form-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 32px;
                }

                .section-title {
                    font-size: 14px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: var(--secondary-text);
                    margin-bottom: 20px;
                    grid-column: span 2;
                    border-bottom: 1px solid var(--border-color);
                    padding-bottom: 8px;
                }

                .form-group {
                    margin-bottom: 20px;
                }

                label {
                    display: block;
                    margin-bottom: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    color: var(--text-color);
                }

                .required::after {
                    content: " *";
                    color: var(--danger-color);
                }

                input {
                    width: 100%;
                    padding: 10px 12px;
                    background: var(--input-bg);
                    color: var(--input-fg);
                    border: 1px solid var(--input-border);
                    border-radius: 6px;
                    font-family: var(--font-family);
                    font-size: 13px;
                    box-sizing: border-box;
                    transition: all 0.2s ease;
                }

                input:focus {
                    outline: none;
                    border-color: var(--accent-color);
                    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
                }

                .actions {
                    margin-top: 32px;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    padding-top: 20px;
                    border-top: 1px solid var(--border-color);
                }

                button {
                    padding: 10px 20px;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: 1px solid transparent;
                }

                .btn-secondary {
                    background: transparent;
                    color: var(--text-color);
                    border: 1px solid var(--border-color);
                }

                .btn-secondary:hover {
                    background: var(--hover-bg);
                    border-color: var(--accent-color);
                }

                .btn-primary {
                    background: var(--button-bg);
                    color: var(--button-fg);
                }

                .btn-primary:hover {
                    background: var(--button-hover);
                }
                
                .btn-primary:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .message {
                    margin-top: 20px;
                    padding: 12px;
                    border-radius: 6px;
                    font-size: 13px;
                    display: none;
                }

                .message.error {
                    background: color-mix(in srgb, var(--danger-color), transparent 85%);
                    color: var(--danger-color);
                    border: 1px solid color-mix(in srgb, var(--danger-color), transparent 70%);
                }

                .message.success {
                    background: color-mix(in srgb, var(--accent-color), transparent 85%);
                    color: var(--accent-color);
                    border: 1px solid color-mix(in srgb, var(--accent-color), transparent 70%);
                }
                
                .hidden {
                    display: none !important;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <img src="${logoPath}" alt="PostgreSQL Explorer">
                    <div class="header-text">
                        <h1>Add Connection</h1>
                        <p>Configure your PostgreSQL database connection</p>
                    </div>
                </div>
                
                <div class="card">
                    <form id="connectionForm">
                        <div class="form-grid">
                            <div class="section-title">Connection Details</div>
                            
                            <div class="form-group" style="grid-column: span 2;">
                                <label for="name" class="required">Connection Name</label>
                                <input type="text" id="name" name="name" required placeholder="e.g. Production DB">
                            </div>

                            <div class="form-group">
                                <label for="host" class="required">Host</label>
                                <input type="text" id="host" name="host" required placeholder="localhost">
                            </div>

                            <div class="form-group">
                                <label for="port" class="required">Port</label>
                                <input type="number" id="port" name="port" value="5432" required>
                            </div>

                            <div class="form-group" style="grid-column: span 2;">
                                <label for="database">Database</label>
                                <input type="text" id="database" name="database" placeholder="postgres">
                            </div>

                            <div class="section-title" style="margin-top: 10px;">Authentication</div>

                            <div class="form-group">
                                <label for="username">Username</label>
                                <input type="text" id="username" name="username" placeholder="postgres">
                            </div>

                            <div class="form-group">
                                <label for="password">Password</label>
                                <input type="password" id="password" name="password" placeholder="••••••••">
                            </div>
                        </div>

                        <div id="message" class="message"></div>

                        <div class="actions">
                            <button type="button" id="testConnection" class="btn-secondary">Test Connection</button>
                            <button type="submit" id="addConnection" class="btn-primary hidden">Add Connection</button>
                        </div>
                    </form>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const messageDiv = document.getElementById('message');
                const testBtn = document.getElementById('testConnection');
                const addBtn = document.getElementById('addConnection');
                const form = document.getElementById('connectionForm');
                const inputs = form.querySelectorAll('input');

                let isTested = false;

                function showMessage(text, isError = false) {
                    messageDiv.textContent = text;
                    messageDiv.className = 'message ' + (isError ? 'error' : 'success');
                    messageDiv.style.display = 'block';
                }

                function hideMessage() {
                    messageDiv.style.display = 'none';
                }

                function getFormData() {
                    const usernameInput = document.getElementById('username').value.trim();
                    const passwordInput = document.getElementById('password').value;
                    
                    return {
                        name: document.getElementById('name').value,
                        host: document.getElementById('host').value,
                        port: parseInt(document.getElementById('port').value),
                        database: document.getElementById('database').value || 'postgres',
                        username: usernameInput || undefined,
                        password: passwordInput || undefined
                    };
                }

                // Reset tested state on any input change
                inputs.forEach(input => {
                    input.addEventListener('input', () => {
                        if (isTested) {
                            isTested = false;
                            addBtn.classList.add('hidden');
                            testBtn.classList.remove('hidden');
                            hideMessage();
                        }
                    });
                });

                testBtn.addEventListener('click', () => {
                    if (!form.checkValidity()) {
                        form.reportValidity();
                        return;
                    }
                    
                    hideMessage();
                    testBtn.disabled = true;
                    testBtn.textContent = 'Testing...';
                    
                    vscode.postMessage({
                        command: 'testConnection',
                        connection: getFormData()
                    });
                });

                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    if (!isTested) return;
                    
                    hideMessage();
                    vscode.postMessage({
                        command: 'saveConnection',
                        connection: getFormData()
                    });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    testBtn.disabled = false;
                    testBtn.textContent = 'Test Connection';

                    switch (message.type) {
                        case 'testSuccess':
                            showMessage('Connection successful! Server version: ' + message.version);
                            isTested = true;
                            testBtn.classList.add('hidden');
                            addBtn.classList.remove('hidden');
                            break;
                        case 'testError':
                            showMessage(message.error, true);
                            isTested = false;
                            addBtn.classList.add('hidden');
                            testBtn.classList.remove('hidden');
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
