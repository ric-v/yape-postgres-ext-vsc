import * as vscode from 'vscode';
import { ConnectionInfo } from './connectionForm';
import { SecretStorageService } from './services/SecretStorageService';

export class ConnectionManagementPanel {
    public static currentPanel: ConnectionManagementPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _extensionContext: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, extensionContext: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._extensionContext = extensionContext;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._initialize();

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'addConnection':
                        // Open the connection form panel
                        vscode.commands.executeCommand('postgres-explorer.addConnection');
                        break;

                    case 'refresh':
                        await this._update();
                        break;

                    case 'delete':
                        try {
                            const config = vscode.workspace.getConfiguration();
                            const connections = config.get<ConnectionInfo[]>('postgresExplorer.connections') || [];

                            const updatedConnections = connections.filter(c => c.id !== message.id);
                            await config.update('postgresExplorer.connections', updatedConnections, vscode.ConfigurationTarget.Global);

                            // Delete password from secret storage
                            try {
                                await SecretStorageService.getInstance().deletePassword(message.id);
                            } catch (err) {
                                console.log(`No password to delete for connection ${message.id}`);
                            }

                            vscode.window.showInformationMessage(`Connection deleted successfully`);
                            vscode.commands.executeCommand('postgres-explorer.refreshConnections');
                            await this._update();
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Failed to delete connection: ${err.message}`);
                        }
                        break;

                    case 'edit':
                        // Open the connection form with pre-filled data
                        vscode.window.showInformationMessage('Edit functionality will open the connection form');
                        // TODO: Implement edit by opening ConnectionFormPanel with existing data
                        break;

                    case 'test':
                        try {
                            const { Client } = require('pg');
                            const config = vscode.workspace.getConfiguration();
                            const connections = config.get<ConnectionInfo[]>('postgresExplorer.connections') || [];
                            const connection = connections.find(c => c.id === message.id);

                            if (!connection) {
                                throw new Error('Connection not found');
                            }

                            const password = await SecretStorageService.getInstance().getPassword(connection.id);

                            const client = new Client({
                                host: connection.host,
                                port: connection.port,
                                user: connection.username || undefined,
                                password: password || undefined,
                                database: connection.database || 'postgres',
                                connectionTimeoutMillis: 5000
                            });

                            await client.connect();
                            const result = await client.query('SELECT version()');
                            await client.end();

                            this._panel.webview.postMessage({
                                type: 'testSuccess',
                                id: message.id,
                                version: result.rows[0].version
                            });
                        } catch (err: any) {
                            this._panel.webview.postMessage({
                                type: 'testError',
                                id: message.id,
                                error: err.message
                            });
                        }
                        break;
                }
            },
            undefined,
            this._disposables
        );
    }

    public static show(extensionUri: vscode.Uri, extensionContext: vscode.ExtensionContext) {
        if (ConnectionManagementPanel.currentPanel) {
            ConnectionManagementPanel.currentPanel._panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'connectionManagement',
            'Manage Connections',
            vscode.ViewColumn.One,
            {
                enableScripts: true
            }
        );

        ConnectionManagementPanel.currentPanel = new ConnectionManagementPanel(panel, extensionUri, extensionContext);
    }

    private async _initialize() {
        await this._update();
    }

    private async _update() {
        this._panel.webview.html = await this._getHtmlForWebview(this._panel.webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        const config = vscode.workspace.getConfiguration();
        const connections = config.get<ConnectionInfo[]>('postgresExplorer.connections') || [];
        const logoPath = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'postgres-explorer.png'));

        // Get passwords for connections (to show if they exist)
        const connectionsWithStatus = await Promise.all(connections.map(async (conn) => {
            const password = await SecretStorageService.getInstance().getPassword(conn.id);
            return {
                ...conn,
                hasPassword: !!password
            };
        }));

        const connectionsHtml = connectionsWithStatus.length > 0
            ? connectionsWithStatus.map(conn => this._getConnectionCardHtml(conn)).join('')
            : `<div class="empty-state">
                    <div class="empty-icon">🔌</div>
                    <h2>No Connections</h2>
                    <p>You haven't added any database connections yet.</p>
                    <button class="btn-primary" onclick="addConnection()">Add Your First Connection</button>
                </div>`;

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Manage Connections</title>
            <style>
                :root {
                    --bg-color: var(--vscode-editor-background);
                    --text-color: var(--vscode-editor-foreground);
                    --card-bg: var(--vscode-editor-background);
                    --border-color: var(--vscode-widget-border);
                    --accent-color: var(--vscode-textLink-foreground);
                    --hover-bg: var(--vscode-list-hoverBackground);
                    --danger-color: var(--vscode-errorForeground);
                    --success-color: var(--vscode-testing-iconPassed);
                    --secondary-text: var(--vscode-descriptionForeground);
                    --font-family: var(--vscode-font-family);
                    --shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
                    --card-radius: 16px;
                    --card-border: 1px solid rgba(128, 128, 128, 0.15);
                }

                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    background-color: var(--bg-color);
                    color: var(--text-color);
                    font-family: var(--font-family);
                    padding: 40px;
                    line-height: 1.6;
                }

                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 48px;
                }

                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                }

                .header img {
                    width: 48px;
                    height: 48px;
                }

                .header-text h1 {
                    font-size: 28px;
                    font-weight: 500;
                    letter-spacing: -0.5px;
                    margin-bottom: 4px;
                }

                .header-text p {
                    color: var(--secondary-text);
                    font-size: 14px;
                }

                .btn-primary {
                    background: var(--accent-color);
                    color: var(--bg-color);
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .btn-primary:hover {
                    opacity: 0.9;
                    transform: translateY(-2px);
                }

                .connections-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
                    gap: 24px;
                }

                .connection-card {
                    background: var(--card-bg);
                    border: var(--card-border);
                    border-radius: var(--card-radius);
                    padding: 24px;
                    box-shadow: var(--shadow);
                    position: relative;
                    overflow: hidden;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .connection-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 4px;
                    background: linear-gradient(90deg, var(--accent-color), transparent);
                    opacity: 0.5;
                }

                .connection-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1);
                    border-color: var(--accent-color);
                }

                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 20px;
                }

                .card-title {
                    font-size: 18px;
                    font-weight: 600;
                    margin-bottom: 4px;
                }

                .card-status {
                    display: flex;
                    gap: 6px;
                    align-items: center;
                }

                .status-badge {
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .status-badge.has-auth {
                    background: color-mix(in srgb, var(--success-color), transparent 85%);
                    color: var(--success-color);
                }

                .status-badge.no-auth {
                    background: color-mix(in srgb, var(--secondary-text), transparent 85%);
                    color: var(--secondary-text);
                }

                .card-details {
                    margin-bottom: 20px;
                }

                .detail-row {
                    display: flex;
                    margin-bottom: 12px;
                    font-size: 13px;
                }

                .detail-label {
                    color: var(--secondary-text);
                    min-width: 80px;
                    font-weight: 500;
                }

                .detail-value {
                    color: var(--text-color);
                    font-family: 'Courier New', monospace;
                    word-break: break-all;
                }

                .connection-string {
                    background: color-mix(in srgb, var(--accent-color), transparent 95%);
                    border: 1px solid color-mix(in srgb, var(--accent-color), transparent 85%);
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 20px;
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    word-break: break-all;
                    color: var(--text-color);
                }

                .card-actions {
                    display: flex;
                    gap: 8px;
                    padding-top: 16px;
                    border-top: 1px solid var(--border-color);
                }

                .btn {
                    flex: 1;
                    padding: 8px 14px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    border: 2px solid transparent;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                }

                .btn-test {
                    background: #4875b3ff;
                    color: #ffffff;
                    border: 2px solid #4c6892ff;
                    box-shadow: 0 2px 8px rgba(123, 163, 220, 0.25);
                }

                .btn-test:hover {
                    background: #5678a8ff;
                    border-color: #294e85ff;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(123, 163, 220, 0.35);
                }

                .btn-delete {
                    background: #d16969ff;
                    color: #ffffff;
                    border: 2px solid #af4242ff;
                    box-shadow: 0 2px 8px rgba(232, 139, 139, 0.25);
                }

                .btn-delete:hover {
                    background: #c04242ff;
                    border-color: #914343ff;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(232, 139, 139, 0.35);
                }

                .empty-state {
                    text-align: center;
                    padding: 80px 20px;
                }

                .empty-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                    opacity: 0.5;
                }

                .empty-state h2 {
                    font-size: 24px;
                    font-weight: 500;
                    margin-bottom: 8px;
                }

                .empty-state p {
                    color: var(--secondary-text);
                    margin-bottom: 24px;
                }

                .test-result {
                    margin-top: 12px;
                    padding: 10px;
                    border-radius: 6px;
                    font-size: 12px;
                    display: none;
                }

                .test-result.success {
                    background: color-mix(in srgb, var(--success-color), transparent 90%);
                    color: var(--success-color);
                    border: 1px solid var(--success-color);
                }

                .test-result.error {
                    background: color-mix(in srgb, var(--danger-color), transparent 90%);
                    color: var(--danger-color);
                    border: 1px solid var(--danger-color);
                }

                .loading {
                    opacity: 0.6;
                    pointer-events: none;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="header-left">
                    <img src="${logoPath}" alt="PostgreSQL Explorer">
                    <div class="header-text">
                        <h1>Connection Management</h1>
                        <p>Manage your PostgreSQL database connections</p>
                    </div>
                </div>
                <button class="btn-primary" onclick="addConnection()">
                    <span>➕</span> Add Connection
                </button>
            </div>

            <div class="connections-grid">
                ${connectionsHtml}
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function addConnection() {
                    vscode.postMessage({ command: 'addConnection' });
                }

                function refreshConnections() {
                    vscode.postMessage({ command: 'refresh' });
                }

                function testConnection(id) {
                    const btn = document.querySelector(\`[data-test-id="\${id}"]\`);
                    const result = document.getElementById(\`test-result-\${id}\`);
                    
                    btn.classList.add('loading');
                    btn.textContent = 'Testing...';
                    result.style.display = 'none';
                    
                    vscode.postMessage({ 
                        command: 'test',
                        id: id 
                    });
                }

                // Add event delegation for delete buttons
                document.addEventListener('click', function(event) {
                    const deleteBtn = event.target.closest('.btn-delete');
                    if (deleteBtn) {
                        const id = deleteBtn.getAttribute('data-connection-id');
                        const name = deleteBtn.getAttribute('data-connection-name');
                        
                        if (id && confirm(\`Are you sure you want to delete connection "\${name}"?\`)) {
                            vscode.postMessage({ 
                                command: 'delete',
                                id: id 
                            });
                        }
                    }
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    if (message.type === 'testSuccess') {
                        const btn = document.querySelector(\`[data-test-id="\${message.id}"]\`);
                        const result = document.getElementById(\`test-result-\${message.id}\`);
                        
                        btn.classList.remove('loading');
                        btn.textContent = '✓ Test';
                        
                        result.className = 'test-result success';
                        result.textContent = '✓ Connection successful!';
                        result.style.display = 'block';
                        
                        setTimeout(() => {
                            result.style.display = 'none';
                        }, 5000);
                    } else if (message.type === 'testError') {
                        const btn = document.querySelector(\`[data-test-id="\${message.id}"]\`);
                        const result = document.getElementById(\`test-result-\${message.id}\`);
                        
                        btn.classList.remove('loading');
                        btn.textContent = '✗ Test';
                        
                        result.className = 'test-result error';
                        result.textContent = \`✗ \${message.error}\`;
                        result.style.display = 'block';
                    }
                });
            </script>
        </body>
        </html>`;
    }

    private _getConnectionCardHtml(conn: ConnectionInfo & { hasPassword: boolean }): string {
        const connectionString = this._buildConnectionString(conn);
        const authBadge = conn.hasPassword || conn.username
            ? '<span class="status-badge has-auth">Authenticated</span>'
            : '<span class="status-badge no-auth">No Auth</span>';

        return `
            <div class="connection-card">
                <div class="card-header">
                    <div>
                        <div class="card-title">${conn.name}</div>
                    </div>
                    <div class="card-status">
                        ${authBadge}
                    </div>
                </div>

                <div class="card-details">
                    <div class="detail-row">
                        <span class="detail-label">Host:</span>
                        <span class="detail-value">${conn.host}:${conn.port}</span>
                    </div>
                    ${conn.database ? `
                    <div class="detail-row">
                        <span class="detail-label">Database:</span>
                        <span class="detail-value">${conn.database}</span>
                    </div>
                    ` : ''}
                    ${conn.username ? `
                    <div class="detail-row">
                        <span class="detail-label">Username:</span>
                        <span class="detail-value">${conn.username}</span>
                    </div>
                    ` : ''}
                </div>

                <div class="connection-string">
                    ${connectionString}
                </div>

                <div id="test-result-${conn.id}" class="test-result"></div>

                <div class="card-actions">
                    <button class="btn btn-test" data-test-id="${conn.id}" onclick="testConnection('${conn.id}')">
                        ⚡ Test
                    </button>
                    <button class="btn btn-delete" data-connection-id="${conn.id}" data-connection-name="${this._escapeHtml(conn.name)}">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;
    }

    private _buildConnectionString(conn: ConnectionInfo): string {
        const auth = conn.username
            ? `${conn.username}${conn.password ? ':****' : ''}@`
            : '';
        const database = conn.database || 'postgres';
        return `postgresql://${auth}${conn.host}:${conn.port}/${database}`;
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private dispose() {
        ConnectionManagementPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
