import * as vscode from 'vscode';
import { Client } from 'pg';

const constraintTypeMap: { [key: string]: string } = {
    'p': 'Primary Key',
    'f': 'Foreign Key',
    'u': 'Unique',
    'c': 'Check',
    't': 'Trigger'
};

interface TableInfo {
    schema: string;
    name: string;
    columns: ColumnInfo[];
    constraints: ConstraintInfo[];
    indexes: IndexInfo[];
    size: string;
    rowEstimate: number;
    comment?: string;
}

type QueryResult = {
    rows: any[];
};

interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    default?: string;
    comment?: string;
}

interface ConstraintInfo {
    name: string;
    type: string;
    definition: string;
}

interface IndexInfo {
    name: string;
    definition: string;
    unique: boolean;
}

export class TablePropertiesPanel extends vscode.Disposable {
    public static currentPanel: TablePropertiesPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly client: Client,
        private _schema: string,
        private _tableName: string
    ) {
        super(() => this.dispose());
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'refresh':
                        await this._update();
                        break;
                    case 'executeQuery':
                        const result = await this._executeQuery(message.query);
                        this._panel.webview.postMessage({ command: 'queryResult', ...result });
                        break;
                }
            },
            undefined,
            this._disposables
        );

        this._update();
    }

    public get schema(): string {
        return this._schema;
    }

    public set schema(value: string) {
        this._schema = value;
        this._update();
    }

    public get tableName(): string {
        return this._tableName;
    }

    public set tableName(value: string) {
        this._tableName = value;
        this._update();
    }

    public static async show(client: Client, schema: string, tableName: string) {
        if (TablePropertiesPanel.currentPanel) {
            TablePropertiesPanel.currentPanel._panel.reveal();
            TablePropertiesPanel.currentPanel.schema = schema;
            TablePropertiesPanel.currentPanel.tableName = tableName;
            await TablePropertiesPanel.currentPanel._update();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'tableProperties',
            `${schema}.${tableName} Properties`,
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        TablePropertiesPanel.currentPanel = new TablePropertiesPanel(panel, client, schema, tableName);
    }

    private async _update() {
        try {
            const tableInfo = await this._getTableInfo();
            this._panel.webview.html = this.getHtmlContent(tableInfo);
        } catch (err) {
            vscode.window.showErrorMessage(`Error loading table properties: ${err}`);
        }
    }

    private async _executeQuery(query: string) {
        try {
            const result = await this.client.query(query);
            return {
                success: true,
                data: result.rows,
                fields: result.fields.map(f => f.name)
            };
        } catch (err: any) {
            return {
                success: false,
                error: err.message
            };
        }
    }

    private async _getTableInfo(): Promise<TableInfo> {
        const schema = this._schema;
        const tableName = this._tableName;
        let tableInfo: TableInfo = {
            schema,
            name: tableName,
            columns: [],
            constraints: [],
            indexes: [],
            size: '',
            rowEstimate: 0
        };

        // Get columns
        const columnsResult = await this.client.query(
            `SELECT 
                column_name, 
                data_type, 
                is_nullable = 'YES' as is_nullable,
                column_default,
                col_description((table_schema || '.' || table_name)::regclass::oid, ordinal_position) as comment
            FROM information_schema.columns 
            WHERE table_schema = $1 AND table_name = $2
            ORDER BY ordinal_position`,
            [schema, tableName]
        );

        // Get constraints
        const constraintsResult = await this.client.query(
            `SELECT 
                conname as name,
                contype as type,
                pg_get_constraintdef(oid) as definition
            FROM pg_constraint
            WHERE conrelid = ($1 || '.' || $2)::regclass::oid`,
            [schema, tableName]
        );

        // Get indexes
        const indexesResult = await this.client.query(
            `SELECT 
                indexname as name,
                indexdef as definition,
                indisunique as is_unique
            FROM pg_indexes
            WHERE schemaname = $1 AND tablename = $2`,
            [schema, tableName]
        );

        // Get table size and row estimate
        const sizeResult = await this.client.query(
            `SELECT 
                pg_size_pretty(pg_total_relation_size(c.oid)) as size,
                c.reltuples::bigint as n_live_tup
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relname = $2`,
            [schema, tableName]
        );

        tableInfo.columns = columnsResult.rows.map(row => ({
            name: row.column_name,
            type: row.data_type,
            nullable: row.is_nullable,
            default: row.column_default,
            comment: row.comment
        }));

        tableInfo.constraints = constraintsResult.rows.map(row => ({
            name: row.name,
            type: row.type,
            definition: row.definition
        }));

        tableInfo.indexes = indexesResult.rows.map(row => ({
            name: row.name,
            definition: row.definition,
            unique: row.is_unique
        }));

        if (sizeResult.rows.length > 0) {
            tableInfo.size = sizeResult.rows[0].size;
            tableInfo.rowEstimate = sizeResult.rows[0].n_live_tup;
        }

        return tableInfo;
    }

    private getHtmlContent(info: TableInfo): string {
        // Enable JavaScript in the webview
        const nonce = this.getNonce();

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();

                    function refreshData() {
                        vscode.postMessage({ command: 'refresh' });
                    }

                    function executeQuery() {
                        const querySection = document.getElementById('querySection');
                        querySection.style.display = querySection.style.display === 'none' ? 'block' : 'none';
                    }

                    function runQuery() {
                        const query = document.getElementById('queryInput').value;
                        vscode.postMessage({ command: 'executeQuery', query });
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'queryResult') {
                            const resultsDiv = document.getElementById('queryResults');
                            if (message.success) {
                                let html = '<table><tr>';
                                message.fields.forEach(field => {
                                    html += '<th>' + field + '</th>';
                                });
                                html += '</tr>';
                                
                                message.data.forEach(row => {
                                    html += '<tr>';
                                    message.fields.forEach(field => {
                                        html += '<td>' + (row[field] ?? '') + '</td>';
                                    });
                                    html += '</tr>';
                                });
                                html += '</table>';
                                resultsDiv.innerHTML = html;
                            } else {
                                resultsDiv.innerHTML = '<div class="error">' + message.error + '</div>';
                            }
                        }
                    });
                </script>
                <style>
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                    }
                    .header-buttons {
                        display: flex;
                        gap: 8px;
                    }
                    .refresh-button, .query-button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 4px 12px;
                        cursor: pointer;
                        border-radius: 2px;
                    }
                    .refresh-button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    body { font-family: var(--vscode-font-family); padding: 10px; }
                    .section { margin-bottom: 20px; }
                    h2 { color: var(--vscode-editor-foreground); border-bottom: 1px solid var(--vscode-panel-border); }
                    table { border-collapse: collapse; width: 100%; }
                    th, td { 
                        text-align: left; 
                        padding: 8px; 
                        border: 1px solid var(--vscode-panel-border);
                    }
                    th { background: var(--vscode-editor-background); }
                    .info-grid {
                        display: grid;
                        grid-template-columns: auto 1fr;
                        gap: 8px;
                        margin-bottom: 20px;
                    }
                    .info-label { font-weight: bold; }
                    .error { color: var(--vscode-errorForeground); }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${info.schema}.${info.name}</h1>
                    <div class="header-buttons">
                        <button class="query-button" onclick="executeQuery()">Query Data</button>
                        <button class="refresh-button" onclick="refreshData()">Refresh</button>
                    </div>
                </div>

                <div id="querySection" class="section" style="display: none;">
                    <textarea id="queryInput" style="width: 100%; height: 100px; margin-bottom: 10px;" 
                        placeholder="SELECT * FROM ${info.schema}.${info.name} LIMIT 100;"></textarea>
                    <button onclick="runQuery()">Run Query</button>
                    <div id="queryResults" style="margin-top: 20px;"></div>
                </div>
                
                <div class="section">
                    <div class="info-grid">
                        <span class="info-label">Size:</span>
                        <span>${info.size}</span>
                        <span class="info-label">Estimated Rows:</span>
                        <span>${info.rowEstimate.toLocaleString()}</span>
                        ${info.comment ? `
                            <span class="info-label">Comment:</span>
                            <span>${info.comment}</span>
                        ` : ''}
                    </div>
                </div>

                <div class="section">
                    <h2>Columns</h2>
                    <table>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Nullable</th>
                            <th>Default</th>
                            <th>Comment</th>
                        </tr>
                        ${info.columns.map(col => 
                            '<tr>' +
                                '<td>' + col.name + '</td>' +
                                '<td>' + col.type + '</td>' +
                                '<td>' + (col.nullable ? 'Yes' : 'No') + '</td>' +
                                '<td>' + (col.default || '') + '</td>' +
                                '<td>' + (col.comment || '') + '</td>' +
                            '</tr>'
                        ).join('')}
                    </table>
                </div>

                <div class="section">
                    <h2>Constraints</h2>
                    <table>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Definition</th>
                        </tr>
                        ${info.constraints.map(con => 
                            '<tr>' +
                                '<td>' + con.name + '</td>' +
                                '<td>' + (constraintTypeMap[con.type] || con.type) + '</td>' +
                                '<td>' + con.definition + '</td>' +
                            '</tr>'
                        ).join('')}
                    </table>
                </div>

                <div class="section">
                    <h2>Indexes</h2>
                    <table>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Definition</th>
                        </tr>
                        ${info.indexes.map(idx => 
                            '<tr>' +
                                '<td>' + idx.name + '</td>' +
                                '<td>' + (idx.unique ? 'Unique' : 'Non-unique') + '</td>' +
                                '<td>' + idx.definition + '</td>' +
                            '</tr>'
                        ).join('')}
                    </table>
                </div>
            </body>
            </html>
        `;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public dispose(): void {
        TablePropertiesPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
