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

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._initialize();
        // Make sure configuration is registered
        vscode.workspace.getConfiguration().update('postgresExplorer.connections', [], true);



        // Handle messages from the webview
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
                                database: 'postgres'
                            });
                            await client.connect();
                            await client.end();
                            vscode.window.showInformationMessage('Connection test successful!');
                        } catch (err: any) {
                            const errorMessage = err?.message || 'Unknown error occurred';
                            vscode.window.showErrorMessage(`Connection test failed: ${errorMessage}`);
                        }
                        break;

                    case 'saveConnection':
                        try {
                            const client = new Client({
                                host: message.connection.host,
                                port: message.connection.port,
                                user: message.connection.username,
                                password: message.connection.password,
                                database: 'postgres' // Connect to default db first
                            });

                            await client.connect();
                            
                            // Get list of databases
                            const result = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
                            await client.end();

                            // Save connection info
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

    public static show(extensionUri: vscode.Uri) {
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

        ConnectionFormPanel.currentPanel = new ConnectionFormPanel(panel, extensionUri);
    }

    private async _initialize() {
        // Make sure configuration is registered
        await vscode.workspace.getConfiguration().update('postgresExplorer.connections', [], true);

        // Handle messages from the webview
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
                                database: 'postgres'
                            });
                            await client.connect();
                            await client.end();
                            vscode.window.showInformationMessage('Connection test successful!');
                        } catch (err: any) {
                            const errorMessage = err?.message || 'Unknown error occurred';
                            vscode.window.showErrorMessage(`Connection test failed: ${errorMessage}`);
                        }
                        break;

                    case 'saveConnection':
                        try {
                            const client = new Client({
                                host: message.connection.host,
                                port: message.connection.port,
                                user: message.connection.username,
                                password: message.connection.password,
                                database: 'postgres' // Connect to default db first
                            });

                            await client.connect();
                            
                            // Get list of databases
                            const result = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
                            await client.end();

                            // Save connection info
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

        await this._update();
    }

    private async _update() {
        this._panel.webview.html = await this._getHtml();
    }

    private async _getHtml(): Promise<string> {
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <style>
                .button-group { 
                    display: flex; 
                    gap: 10px;
                    margin-top: 20px;
                }
                .button-group button {
                    flex: 1;
                }

                body { padding: 20px; }
                .form-group { margin-bottom: 15px; }
                label { display: block; margin-bottom: 5px; }
                input {
                    width: 100%;
                    padding: 5px;
                    border: 1px solid var(--vscode-input-border);
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                }
                button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    cursor: pointer;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <form id="connectionForm">
                <div class="form-group">
                    <label for="name">Connection Name</label>
                    <input type="text" id="name" required>
                </div>
                <div class="form-group">
                    <label for="host">Host</label>
                    <input type="text" id="host" required>
                </div>
                <div class="form-group">
                    <label for="port">Port</label>
                    <input type="number" id="port" value="5432" required>
                </div>
                <div class="form-group">
                    <label for="username">Username</label>
                    <input type="text" id="username" required>
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" required>
                </div>
                <div class="button-group">
                <button type="button" id="testConnection">Test Connection</button>
                <button type="submit">Save Connection</button>
            </div>
            </form>
            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                document.getElementById('testConnection').addEventListener('click', () => {
                    const connection = {
                        name: document.getElementById('name').value,
                        host: document.getElementById('host').value,
                        port: parseInt(document.getElementById('port').value),
                        username: document.getElementById('username').value,
                        password: document.getElementById('password').value
                    };
                    vscode.postMessage({
                        command: 'testConnection',
                        connection
                    });
                });

                document.getElementById('connectionForm').addEventListener('submit', (e) => {
                    e.preventDefault();
                    const connection = {
                        name: document.getElementById('name').value,
                        host: document.getElementById('host').value,
                        port: parseInt(document.getElementById('port').value),
                        username: document.getElementById('username').value,
                        password: document.getElementById('password').value
                    };
                    vscode.postMessage({
                        command: 'saveConnection',
                        connection
                    });
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
        await vscode.workspace.getConfiguration().update('postgresExplorer.connections', connections, true);
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
