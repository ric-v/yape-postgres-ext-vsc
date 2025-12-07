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
        const logoPath = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'postgres-vsc-icon.png'));

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
                    --success-color: var(--vscode-testing-iconPassed);
                    --warning-color: var(--vscode-editorWarning-foreground);
                    --secondary-text: var(--vscode-descriptionForeground);
                    --font-family: var(--vscode-font-family);
                    --shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
                    --shadow-hover: 0 8px 24px rgba(0, 0, 0, 0.08);
                    --card-radius: 12px;
                    --card-border: 1px solid var(--border-color);
                    --input-bg: var(--vscode-input-background);
                    --input-fg: var(--vscode-input-foreground);
                    --input-border: var(--vscode-input-border);
                    --button-bg: var(--vscode-button-background);
                    --button-fg: var(--vscode-button-foreground);
                    --button-hover: var(--vscode-button-hoverBackground);
                    --button-secondary-bg: var(--vscode-button-secondaryBackground);
                    --button-secondary-fg: var(--vscode-button-secondaryForeground);
                    --button-secondary-hover: var(--vscode-button-secondaryHoverBackground);
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
                    padding: 32px 24px;
                    line-height: 1.6;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .container {
                    width: 100%;
                    max-width: 720px;
                    animation: fadeIn 0.3s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .header {
                    text-align: center;
                    margin-bottom: 32px;
                }

                .header-icon {
                    width: 56px;
                    height: 56px;
                    margin: 0 auto 16px;
                    background: linear-gradient(135deg, #336791 0%, #4a7ba7 100%);
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 12px rgba(51, 103, 145, 0.2);
                }

                .header-icon img {
                    width: 32px;
                    height: 32px;
                    filter: brightness(0) invert(1);
                }

                .header h1 {
                    font-size: 28px;
                    font-weight: 600;
                    letter-spacing: -0.5px;
                    margin-bottom: 8px;
                }

                .header p {
                    color: var(--secondary-text);
                    font-size: 14px;
                }

                .card {
                    background: var(--card-bg);
                    border: var(--card-border);
                    border-radius: var(--card-radius);
                    box-shadow: var(--shadow);
                    padding: 32px;
                    transition: box-shadow 0.3s ease;
                }

                .section-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 24px;
                    padding-bottom: 12px;
                    border-bottom: 2px solid var(--border-color);
                }

                .section-icon {
                    width: 28px;
                    height: 28px;
                    background: linear-gradient(135deg, var(--accent-color), var(--hover-bg));
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                }

                .section-title {
                    font-size: 15px;
                    font-weight: 600;
                    letter-spacing: -0.2px;
                    color: var(--text-color);
                }

                .form-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 24px;
                    margin-bottom: 32px;
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                }

                .form-group.full-width {
                    grid-column: span 2;
                }

                label {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    color: var(--text-color);
                }

                .required-indicator {
                    color: var(--danger-color);
                    font-size: 16px;
                    line-height: 1;
                }

                .label-hint {
                    display: block;
                    font-size: 12px;
                    color: var(--secondary-text);
                    font-weight: 400;
                    margin-top: 2px;
                }

                input {
                    width: 100%;
                    padding: 10px 14px;
                    background: var(--input-bg);
                    color: var(--input-fg);
                    border: 1.5px solid var(--input-border);
                    border-radius: 6px;
                    font-family: var(--font-family);
                    font-size: 13px;
                    transition: all 0.2s ease;
                }

                input:hover {
                    border-color: var(--accent-color);
                }

                input:focus {
                    outline: none;
                    border-color: var(--accent-color);
                    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15);
                }

                input::placeholder {
                    color: var(--secondary-text);
                    opacity: 0.6;
                }

                .message {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    margin-bottom: 24px;
                    display: none;
                    animation: slideDown 0.3s ease;
                }

                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .message-icon {
                    font-size: 18px;
                    line-height: 1;
                }

                .message.success {
                    background: rgba(34, 197, 94, 0.1);
                    border: 1.5px solid var(--success-color);
                    color: var(--success-color);
                }

                .message.error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1.5px solid var(--danger-color);
                    color: var(--danger-color);
                }

                .message.info {
                    background: rgba(96, 165, 250, 0.1);
                    border: 1.5px solid var(--accent-color);
                    color: var(--accent-color);
                }

                .actions {
                    display: flex;
                    gap: 12px;
                    padding-top: 24px;
                    border-top: 1px solid var(--border-color);
                }

                button {
                    flex: 1;
                    padding: 11px 20px;
                    border: none;
                    border-radius: 7px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: var(--font-family);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }

                button:active {
                    transform: scale(0.98);
                }

                .btn-secondary {
                    background: var(--button-secondary-bg);
                    color: var(--button-secondary-fg);
                }

                .btn-secondary:hover:not(:disabled) {
                    background: var(--button-secondary-hover);
                    transform: translateY(-1px);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }

                .btn-primary {
                    background: var(--button-bg);
                    color: var(--button-fg);
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
                }

                .btn-primary:hover:not(:disabled) {
                    background: var(--button-hover);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                }
                
                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none !important;
                }

                .btn-icon {
                    font-size: 16px;
                    line-height: 1;
                }
                
                .hidden {
                    display: none !important;
                }

                .info-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: rgba(96, 165, 250, 0.1);
                    border: 1px solid rgba(96, 165, 250, 0.3);
                    border-radius: 6px;
                    font-size: 12px;
                    color: var(--accent-color);
                    margin-bottom: 24px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-icon">
                        <img src="${logoPath}" alt="PostgreSQL">
                    </div>
                    <h1>New Connection</h1>
                    <p>Configure your PostgreSQL database connection</p>
                </div>
                
                <div class="card">
                    <form id="connectionForm">
                        <div class="info-badge">
                            <span>💡</span>
                            <span>All fields marked with <span class="required-indicator">*</span> are required</span>
                        </div>

                        <div id="message" class="message"></div>

                        <div class="section-header">
                            <div class="section-icon">🔌</div>
                            <div class="section-title">Connection Details</div>
                        </div>
                        
                        <div class="form-grid">
                            <div class="form-group full-width">
                                <label for="name">
                                    Connection Name
                                    <span class="required-indicator">*</span>
                                </label>
                                <input type="text" id="name" name="name" required placeholder="e.g., Production Database">
                            </div>

                            <div class="form-group">
                                <label for="host">
                                    Host
                                    <span class="required-indicator">*</span>
                                    <span class="label-hint">Server address or IP</span>
                                </label>
                                <input type="text" id="host" name="host" required placeholder="localhost">
                            </div>

                            <div class="form-group">
                                <label for="port">
                                    Port
                                    <span class="required-indicator">*</span>
                                    <span class="label-hint">Default: 5432</span>
                                </label>
                                <input type="number" id="port" name="port" value="5432" required>
                            </div>

                            <div class="form-group full-width">
                                <label for="database">
                                    Database
                                    <span class="label-hint">Leave empty to connect to default database (postgres)</span>
                                </label>
                                <input type="text" id="database" name="database" placeholder="postgres">
                            </div>
                        </div>

                        <div class="section-header">
                            <div class="section-icon">🔐</div>
                            <div class="section-title">Authentication</div>
                        </div>

                        <div class="form-grid">
                            <div class="form-group">
                                <label for="username">
                                    Username
                                    <span class="label-hint">Database user</span>
                                </label>
                                <input type="text" id="username" name="username" placeholder="postgres">
                            </div>

                            <div class="form-group">
                                <label for="password">
                                    Password
                                    <span class="label-hint">Stored securely</span>
                                </label>
                                <input type="password" id="password" name="password" placeholder="••••••••">
                            </div>
                        </div>

                        <div class="actions">
                            <button type="button" id="testConnection" class="btn-secondary">
                                <span class="btn-icon">⚡</span>
                                <span>Test Connection</span>
                            </button>
                            <button type="submit" id="addConnection" class="btn-primary hidden">
                                <span class="btn-icon">✓</span>
                                <span>Add Connection</span>
                            </button>
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

                function showMessage(text, type = 'info') {
                    const icons = {
                        success: '✓',
                        error: '✗',
                        info: 'ℹ'
                    };
                    messageDiv.innerHTML = \`<span class="message-icon">\${icons[type]}</span><span>\${text}</span>\`;
                    messageDiv.className = 'message ' + type;
                    messageDiv.style.display = 'flex';
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
                    testBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Testing...</span>';
                    
                    vscode.postMessage({
                        command: 'testConnection',
                        connection: getFormData()
                    });
                });

                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    if (!isTested) return;
                    
                    hideMessage();
                    addBtn.disabled = true;
                    addBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Saving...</span>';
                    
                    vscode.postMessage({
                        command: 'saveConnection',
                        connection: getFormData()
                    });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    testBtn.disabled = false;
                    testBtn.innerHTML = '<span class="btn-icon">⚡</span><span>Test Connection</span>';
                    addBtn.disabled = false;
                    addBtn.innerHTML = '<span class="btn-icon">✓</span><span>Add Connection</span>';

                    switch (message.type) {
                        case 'testSuccess':
                            showMessage('Connection successful! ' + message.version, 'success');
                            isTested = true;
                            testBtn.classList.add('hidden');
                            addBtn.classList.remove('hidden');
                            break;
                        case 'testError':
                            showMessage('Connection failed: ' + message.error, 'error');
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
