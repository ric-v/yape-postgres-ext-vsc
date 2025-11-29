import { Client } from 'pg';
import * as vscode from 'vscode';
import { PostgresMetadata } from '../common/types';
import { ConnectionManager } from '../services/ConnectionManager';

export class PostgresKernel {
    private readonly id = 'postgres-kernel';
    private readonly label = 'PostgreSQL Kernel';
    private readonly controller: vscode.NotebookController;
    private messageHandler?: (message: any) => void;

    constructor(private readonly context: vscode.ExtensionContext, viewType: string = 'postgres-notebook', messageHandler?: (message: any) => void) {
        console.log('PostgresKernel: Initializing');
        this.controller = vscode.notebooks.createNotebookController(
            this.id + '-' + viewType,
            viewType,
            this.label
        );

        this.messageHandler = messageHandler;
        console.log('PostgresKernel: Message handler registered:', !!messageHandler);

        // Disable automatic timestamp parsing
        const types = require('pg').types;
        const TIMESTAMPTZ_OID = 1184;
        const TIMESTAMP_OID = 1114;
        types.setTypeParser(TIMESTAMPTZ_OID, (val: string) => val);
        types.setTypeParser(TIMESTAMP_OID, (val: string) => val);

        this.controller.supportedLanguages = ['sql'];
        this.controller.supportsExecutionOrder = true;
        this.controller.description = 'PostgreSQL Query Executor';
        this.controller.executeHandler = this._executeAll.bind(this);

        const getClientFromNotebook = async (document: vscode.TextDocument): Promise<Client | undefined> => {
            const cell = vscode.workspace.notebookDocuments
                .find(notebook => notebook.getCells().some(c => c.document === document))
                ?.getCells()
                .find(c => c.document === document);

            if (!cell) return undefined;

            const metadata = cell.notebook.metadata as PostgresMetadata;
            if (!metadata?.connectionId) return undefined;

            const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
            const connection = connections.find(c => c.id === metadata.connectionId);
            if (!connection) return undefined;

            try {
                return await ConnectionManager.getInstance().getConnection({
                    id: connection.id,
                    host: connection.host,
                    port: connection.port,
                    username: connection.username,
                    database: metadata.databaseName || connection.database,
                    name: connection.name
                });
            } catch (err) {
                console.error('Error connecting to database:', err);
                return undefined;
            }
        };

        // Create SQL command completions
        const sqlCommands = [
            { label: 'SELECT', description: 'Retrieve data from tables', documentation: 'SELECT [columns] FROM [table] WHERE [condition];' },
            { label: 'INSERT', description: 'Add new records', documentation: 'INSERT INTO [table] (columns) VALUES (values);' },
            { label: 'UPDATE', description: 'Modify existing records', documentation: 'UPDATE [table] SET [column = value] WHERE [condition];' },
            { label: 'DELETE', description: 'Remove records', documentation: 'DELETE FROM [table] WHERE [condition];' },
            { label: 'CREATE TABLE', description: 'Create a new table', documentation: 'CREATE TABLE [name] (column_definitions);' },
            { label: 'ALTER TABLE', description: 'Modify table structure', documentation: 'ALTER TABLE [table] [action];' },
            { label: 'DROP TABLE', description: 'Delete a table', documentation: 'DROP TABLE [table];' },
            { label: 'CREATE INDEX', description: 'Create a new index', documentation: 'CREATE INDEX [name] ON [table] (columns);' },
            { label: 'CREATE VIEW', description: 'Create a view', documentation: 'CREATE VIEW [name] AS SELECT ...;' },
            { label: 'GRANT', description: 'Grant permissions', documentation: 'GRANT [privileges] ON [object] TO [role];' },
            { label: 'REVOKE', description: 'Revoke permissions', documentation: 'REVOKE [privileges] ON [object] FROM [role];' },
            { label: 'BEGIN', description: 'Start a transaction', documentation: 'BEGIN; -- transaction statements -- COMMIT;' },
            { label: 'COMMIT', description: 'Commit a transaction', documentation: 'COMMIT;' },
            { label: 'ROLLBACK', description: 'Rollback a transaction', documentation: 'ROLLBACK;' }
        ];

        // Create SQL keyword completions
        const sqlKeywords = [
            // DML Keywords
            { label: 'SELECT', detail: 'Query data', documentation: 'SELECT [columns] FROM [table] [WHERE condition]' },
            { label: 'FROM', detail: 'Specify source table', documentation: 'FROM table_name [alias]' },
            { label: 'WHERE', detail: 'Filter conditions', documentation: 'WHERE condition' },
            { label: 'GROUP BY', detail: 'Group results', documentation: 'GROUP BY column1, column2' },
            { label: 'HAVING', detail: 'Filter groups', documentation: 'HAVING aggregate_condition' },
            { label: 'ORDER BY', detail: 'Sort results', documentation: 'ORDER BY column1 [ASC|DESC]' },
            { label: 'LIMIT', detail: 'Limit results', documentation: 'LIMIT number' },
            { label: 'OFFSET', detail: 'Skip results', documentation: 'OFFSET number' },
            { label: 'INSERT INTO', detail: 'Add new records', documentation: 'INSERT INTO table (columns) VALUES (values)' },
            { label: 'UPDATE', detail: 'Modify records', documentation: 'UPDATE table SET column = value [WHERE condition]' },
            { label: 'DELETE FROM', detail: 'Remove records', documentation: 'DELETE FROM table [WHERE condition]' },

            // Joins
            { label: 'INNER JOIN', detail: 'Inner join tables', documentation: 'INNER JOIN table ON condition' },
            { label: 'LEFT JOIN', detail: 'Left outer join', documentation: 'LEFT [OUTER] JOIN table ON condition' },
            { label: 'RIGHT JOIN', detail: 'Right outer join', documentation: 'RIGHT [OUTER] JOIN table ON condition' },
            { label: 'FULL JOIN', detail: 'Full outer join', documentation: 'FULL [OUTER] JOIN table ON condition' },
            { label: 'CROSS JOIN', detail: 'Cross join tables', documentation: 'CROSS JOIN table' },

            // DDL Keywords
            { label: 'CREATE TABLE', detail: 'Create new table', documentation: 'CREATE TABLE name (column_definitions)' },
            { label: 'ALTER TABLE', detail: 'Modify table', documentation: 'ALTER TABLE name [action]' },
            { label: 'DROP TABLE', detail: 'Delete table', documentation: 'DROP TABLE [IF EXISTS] name' },
            { label: 'CREATE INDEX', detail: 'Create index', documentation: 'CREATE INDEX name ON table (columns)' },
            { label: 'CREATE VIEW', detail: 'Create view', documentation: 'CREATE VIEW name AS SELECT ...' },

            // Functions
            { label: 'COUNT', detail: 'Count rows', documentation: 'COUNT(*) or COUNT(column)' },
            { label: 'SUM', detail: 'Sum values', documentation: 'SUM(column)' },
            { label: 'AVG', detail: 'Average value', documentation: 'AVG(column)' },
            { label: 'MAX', detail: 'Maximum value', documentation: 'MAX(column)' },
            { label: 'MIN', detail: 'Minimum value', documentation: 'MIN(column)' },

            // Clauses
            { label: 'AS', detail: 'Alias', documentation: 'column AS alias, table AS alias' },
            { label: 'ON', detail: 'Join condition', documentation: 'ON table1.column = table2.column' },
            { label: 'AND', detail: 'Logical AND', documentation: 'condition1 AND condition2' },
            { label: 'OR', detail: 'Logical OR', documentation: 'condition1 OR condition2' },
            { label: 'IN', detail: 'Value in set', documentation: 'column IN (value1, value2, ...)' },
            { label: 'BETWEEN', detail: 'Value in range', documentation: 'column BETWEEN value1 AND value2' },
            { label: 'LIKE', detail: 'Pattern matching', documentation: 'column LIKE pattern' },
            { label: 'IS NULL', detail: 'Null check', documentation: 'column IS NULL' },
            { label: 'IS NOT NULL', detail: 'Not null check', documentation: 'column IS NOT NULL' },

            // Transaction Control
            { label: 'BEGIN', detail: 'Start transaction', documentation: 'BEGIN [TRANSACTION]' },
            { label: 'COMMIT', detail: 'Commit transaction', documentation: 'COMMIT' },
            { label: 'ROLLBACK', detail: 'Rollback transaction', documentation: 'ROLLBACK' }
        ];

        // Register completion provider for SQL
        context.subscriptions.push(
            vscode.languages.registerCompletionItemProvider(
                { scheme: 'vscode-notebook-cell', language: 'sql' },
                {
                    async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                        const linePrefix = document.lineAt(position).text.substr(0, position.character).toLowerCase();
                        const wordRange = document.getWordRangeAtPosition(position);
                        const word = wordRange ? document.getText(wordRange).toLowerCase() : '';

                        // Always provide SQL keyword suggestions
                        const keywordItems = sqlKeywords.filter(kw =>
                            !word || kw.label.toLowerCase().includes(word)
                        ).map(kw => {
                            const item = new vscode.CompletionItem(kw.label, vscode.CompletionItemKind.Keyword);
                            item.detail = kw.detail;
                            item.documentation = new vscode.MarkdownString(kw.documentation);
                            return item;
                        });

                        // Check for column suggestions after table alias (e.g. "t.")
                        const aliasMatch = linePrefix.match(/(\w+)\.\s*$/);
                        if (aliasMatch) {
                            // Look for table alias in previous part of the query
                            const fullQuery = document.getText();
                            const aliasPattern = new RegExp(`(?:FROM|JOIN)\\s+([\\w\\.]+)\\s+(?:AS\\s+)?${aliasMatch[1]}\\b`, 'i');
                            const tableMatch = aliasPattern.exec(fullQuery);

                            if (tableMatch) {
                                const [, tablePath] = tableMatch;
                                const [schema = 'public', table] = tablePath.split('.');
                                const client = await getClientFromNotebook(document);
                                if (!client) return [];

                                try {
                                    const result = await client.query(
                                        `SELECT column_name, data_type, is_nullable 
                                         FROM information_schema.columns 
                                         WHERE table_schema = $1 
                                         AND table_name = $2 
                                         ORDER BY ordinal_position`,
                                        [schema, table]
                                    );

                                    return result.rows.map((row: { column_name: string; data_type: string; is_nullable: string }) => {
                                        const completion = new vscode.CompletionItem(row.column_name);
                                        completion.kind = vscode.CompletionItemKind.Field;
                                        completion.detail = row.data_type;
                                        completion.documentation = `Type: ${row.data_type}\nNullable: ${row.is_nullable === 'YES' ? 'Yes' : 'No'}`;
                                        return completion;
                                    });
                                } catch (err) {
                                    console.error('Error getting column completions:', err);
                                    return [];
                                }
                                // Do not close client here, it's managed by ConnectionManager
                            }
                        }

                        // Check if we're after a schema reference (schema.)
                        const schemaMatch = linePrefix.match(/(\w+)\.\s*$/);
                        if (schemaMatch) {
                            const client = await getClientFromNotebook(document);
                            if (!client) return [];

                            try {
                                const result = await client.query(
                                    `SELECT table_name 
                                     FROM information_schema.tables 
                                     WHERE table_schema = $1 
                                     ORDER BY table_name`,
                                    [schemaMatch[1]]
                                );
                                return result.rows.map((row: { table_name: string }) => {
                                    const completion = new vscode.CompletionItem(row.table_name);
                                    completion.kind = vscode.CompletionItemKind.Value;
                                    return completion;
                                });
                            } catch (err) {
                                console.error('Error getting table completions:', err);
                                return [];
                            }
                        }

                        // Provide schema suggestions after 'FROM' or 'JOIN'
                        const keywords = /(?:from|join)\s+(\w*)$/i;
                        const match = linePrefix.match(keywords);
                        if (match) {
                            const client = await getClientFromNotebook(document);
                            if (!client) return [];

                            try {
                                const result = await client.query(
                                    `SELECT schema_name 
                                     FROM information_schema.schemata 
                                     WHERE schema_name NOT IN ('information_schema', 'pg_catalog')
                                     ORDER BY schema_name`
                                );
                                return result.rows.map((row: { schema_name: string }) => {
                                    const completion = new vscode.CompletionItem(row.schema_name);
                                    completion.kind = vscode.CompletionItemKind.Module;
                                    completion.insertText = row.schema_name + '.';
                                    return completion;
                                });
                            } catch (err) {
                                console.error('Error getting schema completions:', err);
                                return [];
                            }
                        }

                        return keywordItems;
                    }
                }
            )
        );

        // Register completion provider for SQL
        context.subscriptions.push(
            vscode.languages.registerCompletionItemProvider(
                { scheme: 'vscode-notebook-cell', language: 'sql' },
                {
                    async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                        const linePrefix = document.lineAt(position).text.substr(0, position.character);

                        // Return SQL command suggestions at start of line or after semicolon
                        if (linePrefix.trim() === '' || linePrefix.trim().endsWith(';')) {
                            return sqlCommands.map(cmd => {
                                const item = new vscode.CompletionItem(cmd.label, vscode.CompletionItemKind.Keyword);
                                item.detail = cmd.description;
                                item.documentation = new vscode.MarkdownString(cmd.documentation);
                                return item;
                            });
                        }

                        return [];
                    }
                },
                ' ', ';' // Trigger on space and semicolon
            )
        );
    }

    private async _executeAll(cells: vscode.NotebookCell[], _notebook: vscode.NotebookDocument, _controller: vscode.NotebookController): Promise<void> {
        for (const cell of cells) {
            await this._doExecution(cell);
        }
    }

    private async _doExecution(cell: vscode.NotebookCell): Promise<void> {
        console.log('PostgresKernel: Starting cell execution');
        const execution = this.controller.createNotebookCellExecution(cell);
        const startTime = Date.now();
        execution.start(startTime);

        try {
            const metadata = cell.notebook.metadata as PostgresMetadata;
            if (!metadata || !metadata.connectionId) {
                throw new Error('No connection metadata found');
            }

            // Get connection info and password from SecretStorage
            const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
            const connection = connections.find(c => c.id === metadata.connectionId);
            if (!connection) {
                throw new Error('Connection not found');
            }

            const client = await ConnectionManager.getInstance().getConnection({
                id: connection.id,
                host: connection.host,
                port: connection.port,
                username: connection.username,
                database: metadata.databaseName || connection.database,
                name: connection.name
            });

            console.log('PostgresKernel: Connected to database');

            const query = cell.document.getText();
            const result = await client.query(query);
            // Do NOT close client here

            const endTime = Date.now();
            const executionTime = (endTime - startTime) / 1000;

            // Check if this is a DDL command by checking the command property or analyzing the query
            const isDDLCommand = result.command &&
                result.command.toString().toUpperCase().match(/^(CREATE|ALTER|DROP|TRUNCATE)/) ||
                query.trim().toUpperCase().match(/^(CREATE|ALTER|DROP|TRUNCATE)/);

            if (isDDLCommand) {
                // Rest of the DDL handling code...
                const html = `
                    <div style="
                        padding: 10px;
                        margin: 5px 0;
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                    ">
                        <div style="color: var(--vscode-gitDecoration-addedResourceForeground);">
                            ✓ Query executed successfully
                        </div>
                        <div style="
                            color: var(--vscode-foreground);
                            opacity: 0.7;
                            font-size: 0.9em;
                            margin-top: 5px;
                        ">
                            Execution time: ${executionTime.toFixed(3)} seconds
                        </div>
                    </div>
                `;

                const output = new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.text(html, 'text/html')
                ]);
                execution.replaceOutput([output]);
                execution.end(true);
            } else if (result.fields && result.fields.length > 0) {
                // Rest of the existing code for handling SELECT queries...
                console.log('PostgresKernel: Query returned', result.rows.length, 'rows');

                const headers = result.fields.map(f => f.name);
                const rows = result.rows;

                const formatCellValue = (val: any): { minimized: string, full: string } => {
                    if (val === null) return { minimized: '', full: '' };
                    if (typeof val === 'object') {
                        try {
                            const minimized = JSON.stringify(val);
                            const full = JSON.stringify(val, null, 2);
                            return { minimized, full };
                        } catch (e) {
                            const str = String(val);
                            return { minimized: str, full: str };
                        }
                    }
                    const str = String(val);
                    return { minimized: str, full: str };
                };

                const html = `
                    <style>
                        .output-controls {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-bottom: 16px;
                            gap: 8px;
                        }
                        .export-container {
                            position: relative;
                            display: inline-block;
                        }
                        .export-button {
                            background: transparent;
                            color: var(--vscode-foreground);
                            border: 1px solid var(--vscode-button-border);
                            padding: 4px 8px;
                            cursor: pointer;
                            border-radius: 2px;
                            display: flex;
                            align-items: center;
                            gap: 4px;
                            min-width: 32px;
                            justify-content: center;
                            opacity: 0.8;
                        }
                        .export-button:hover {
                            opacity: 1;
                            background: var(--vscode-button-secondaryHoverBackground);
                        }
                        .export-menu {
                            display: none;
                            position: absolute;
                            top: 100%;
                            left: 0;
                            background: var(--vscode-menu-background);
                            border: 1px solid var(--vscode-menu-border);
                            border-radius: 2px;
                            box-shadow: 0 2px 8px var(--vscode-widget-shadow);
                            z-index: 1000;
                            min-width: 160px;
                        }
                        .export-menu.show {
                            display: block;
                        }
                        .export-option {
                            padding: 8px 16px;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            color: var(--vscode-menu-foreground);
                            text-decoration: none;
                            white-space: nowrap;
                            opacity: 0.8;
                        }
                        .export-option:hover {
                            background: var(--vscode-list-hoverBackground);
                            opacity: 1;
                            background: var(--vscode-list-hoverBackground);
                        }
                        .clear-button {
                            opacity: 0.6;
                        }
                        .clear-button:hover {
                            opacity: 0.8;
                        }
                        .icon {
                            width: 16px;
                            height: 16px;
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .table-container {
                            max-height: 400px;
                            overflow: auto;
                            border: 1px solid var(--vscode-panel-border);
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                        }
                        th, td {
                            padding: 8px;
                            text-align: left;
                            border: 1px solid var(--vscode-panel-border);
                            white-space: pre;
                            font-family: var(--vscode-editor-font-family);
                        }
                        th {
                            background: var(--vscode-editor-background);
                            position: sticky;
                            top: 0;
                        }
                        tr:nth-child(even) {
                            background: var(--vscode-list-hoverBackground);
                        }
                        .execution-time {
                            margin-top: 8px;
                            color: var(--vscode-foreground);
                            opacity: 0.7;
                            font-size: 0.9em;
                        }
                        .hidden {
                            display: none !important;
                        }
                        td pre {
                            margin: 0;
                            cursor: pointer;
                            transition: all 0.2s;
                            max-height: 1.2em;
                            overflow: hidden;
                        }
                        
                        td pre:hover, td pre.expanded {
                            max-height: none;
                            background: var(--vscode-editor-background);
                            box-shadow: 0 2px 8px var(--vscode-widget-shadow);
                            position: relative;
                            z-index: 1;
                        }
                        
                        td pre[data-full]:not(:hover):not(.expanded)::after {
                            content: "...";
                            color: var(--vscode-descriptionForeground);
                        }
                    </style>
                    <div class="output-wrapper">
                        <div class="output-controls">
                            <div class="export-container">
                                <button class="export-button" onclick="toggleExportMenu()" title="Export options">
                                    <span class="icon">🗃️</span>
                                </button>
                                <div class="export-menu" id="exportMenu">
                                    <a href="#" class="export-option" onclick="downloadCSV(); return false;">
                                        <span class="icon">📄</span> CSV
                                    </a>
                                    <a href="#" class="export-option" onclick="downloadExcel(); return false;">
                                        <span class="icon">📊</span> Excel
                                    </a>
                                    <a href="#" class="export-option" onclick="downloadJSON(); return false;">
                                        <span class="icon">{ }</span> JSON
                                    </a>
                                </div>
                            </div>
                            <button class="export-button clear-button" onclick="clearOutput()" title="Clear output">
                                <span class="icon">❌</span>
                            </button>
                        </div>
                        <div class="output-content">
                            <div class="table-container">
                                <table id="resultTable">
                                    <thead>
                                        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                                    </thead>
                                    <tbody>
                                        ${rows.map(row =>
                    `<tr>${headers.map(h => {
                        const { minimized, full } = formatCellValue(row[h]);
                        const hasFullVersion = minimized !== full;
                        return `<td><pre ${hasFullVersion ? `data-full="${encodeURIComponent(full)}"` : ''}>${minimized}</pre></td>`;
                    }).join('')}</tr>`
                ).join('')}
                                    </tbody>
                                </table>
                            </div>
                            <div>${rows.length} rows</div>
                            <div class="execution-time">Execution time: ${executionTime.toFixed(3)} seconds</div>
                        </div>
                    </div>
                    <script>
                        // Close export menu when clicking outside
                        document.addEventListener('click', function(event) {
                            const menu = document.getElementById('exportMenu');
                            const button = event.target.closest('.export-button');
                            if (!button && menu.classList.contains('show')) {
                                menu.classList.remove('show');
                            }
                        });

                        function toggleExportMenu() {
                            const menu = document.getElementById('exportMenu');
                            menu.classList.toggle('show');
                        }

                        function clearOutput() {
                            const wrapper = document.querySelector('.output-wrapper');
                            wrapper.classList.add('hidden');
                        }

                        function downloadCSV() {
                            const table = document.getElementById('resultTable');
                            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
                            const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => 
                                Array.from(row.querySelectorAll('td pre')).map(pre => {
                                    // Use full version for export
                                    const val = pre.hasAttribute('data-full') ? 
                                        decodeURIComponent(pre.getAttribute('data-full')) : 
                                        pre.textContent;
                                    return val.includes(',') || val.includes('"') || val.includes('\\n') ?
                                        '"' + val.replace(/"/g, '""') + '"' :
                                        val;
                                })
                            );

                            const csv = [
                                headers.join(','),
                                ...rows.map(row => row.join(','))
                            ].join('\\n');

                            downloadFile(csv, 'query_result.csv', 'text/csv');
                        }

                        function downloadJSON() {
                            const table = document.getElementById('resultTable');
                            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
                            const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => {
                                const rowData = {};
                                Array.from(row.querySelectorAll('td pre')).forEach((pre, index) => {
                                    // Use full version for export
                                    rowData[headers[index]] = pre.hasAttribute('data-full') ? 
                                        decodeURIComponent(pre.getAttribute('data-full')) : 
                                        pre.textContent;
                                });
                                return rowData;
                            });

                            const json = JSON.stringify(rows, null, 2);
                            downloadFile(json, 'query_result.json', 'application/json');
                        }

                        function downloadExcel() {
                            const table = document.getElementById('resultTable');
                            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
                            const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => 
                                Array.from(row.querySelectorAll('td pre')).map(pre => {
                                    // Use full version for export
                                    return pre.hasAttribute('data-full') ? 
                                        decodeURIComponent(pre.getAttribute('data-full')) : 
                                        pre.textContent;
                                })
                            );

                            let xml = '<?xml version="1.0"?>\\n<?mso-application progid="Excel.Sheet"?>\\n';
                            xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\\n';
                            xml += '<Worksheet ss:Name="Query Result"><Table>\\n';
                            
                            xml += '<Row>' + headers.map(h => 
                                '<Cell><Data ss:Type="String">' + 
                                (h || '').replace(/[<>&]/g, c => c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;') + 
                                '</Data></Cell>'
                            ).join('') + '</Row>\\n';
                            
                            rows.forEach(row => {
                                xml += '<Row>' + row.map(cell => {
                                    const value = cell || '';
                                    return '<Cell><Data ss:Type="String">' + 
                                        value.toString().replace(/[<>&]/g, c => 
                                            c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'
                                        ) + 
                                        '</Data></Cell>';
                                }).join('') + '</Row>\\n';
                            });
                            
                            xml += '</Table></Worksheet></Workbook>';
                            downloadFile(xml, 'query_result.xls', 'application/vnd.ms-excel');
                        }

                        function downloadFile(content, filename, type) {
                            const blob = new Blob([content], { type });
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(a.href);
                            // Close the export menu after downloading
                            document.getElementById('exportMenu').classList.remove('show');
                        }

                        // Add click handler for expandable cells
                        document.querySelectorAll('td pre[data-full]').forEach(pre => {
                            pre.addEventListener('click', function(e) {
                                const full = decodeURIComponent(this.getAttribute('data-full'));
                                if (this.classList.contains('expanded')) {
                                    this.textContent = this.getAttribute('data-minimized') || this.textContent;
                                    this.classList.remove('expanded');
                                } else {
                                    if (!this.hasAttribute('data-minimized')) {
                                        this.setAttribute('data-minimized', this.textContent);
                                    }
                                    this.textContent = full;
                                    this.classList.add('expanded');
                                }
                                e.stopPropagation();
                            });
                        });
                    </script>`;

                const output = new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.text(html, 'text/html')
                ]);

                output.metadata = {
                    outputType: 'display_data',
                    custom: {
                        vscode: {
                            cellId: cell.document.uri.toString(),
                            controllerId: this.id,
                            enableScripts: true
                        }
                    }
                };

                execution.replaceOutput([output]);
                execution.end(true);
                console.log('PostgresKernel: Cell execution completed successfully');
            } else {
                const output = new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.text(`
                        <div style="
                            padding: 10px;
                            margin: 5px 0;
                            background: var(--vscode-editor-background);
                            border: 1px solid var(--vscode-panel-border);
                            border-radius: 4px;
                        ">
                            <div style="color: var(--vscode-gitDecoration-addedResourceForeground);">
                                ✓ Query executed successfully
                            </div>
                            <div style="
                                color: var(--vscode-foreground);
                                opacity: 0.7;
                                font-size: 0.9em;
                                margin-top: 5px;
                            ">
                                Execution time: ${executionTime.toFixed(3)} seconds
                            </div>
                        </div>
                    `, 'text/html')
                ]);
                execution.replaceOutput([output]);
                execution.end(true);
            }
        } catch (err: any) {
            console.error('PostgresKernel: Cell execution failed:', err);
            execution.replaceOutput([
                new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.error({
                        name: 'Error',
                        message: err.message || 'Unknown error occurred'
                    })
                ])
            ]);
            execution.end(false);
        }
    }
}
