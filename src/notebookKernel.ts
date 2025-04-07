import * as vscode from 'vscode';
import { Client } from 'pg';

interface NotebookMetadata {
    connectionId: string;
    databaseName: string;
    host: string;
    port: number;
    username: string;
    password: string;
}

export class PostgresKernel {
    private readonly id = 'postgres-kernel';
    private readonly label = 'PostgreSQL Kernel';
    private readonly controller: vscode.NotebookController;
    private messageHandler?: (message: any) => void;

    constructor(messageHandler?: (message: any) => void) {
        console.log('PostgresKernel: Initializing');
        this.controller = vscode.notebooks.createNotebookController(
            this.id,
            'postgres-notebook',
            this.label
        );

        this.messageHandler = messageHandler;
        console.log('PostgresKernel: Message handler registered:', !!messageHandler);

        this.controller.supportedLanguages = ['sql'];
        this.controller.supportsExecutionOrder = true;
        this.controller.description = 'PostgreSQL Query Executor';
        this.controller.executeHandler = this._executeAll.bind(this);
    }

    private async _executeAll(cells: vscode.NotebookCell[], _notebook: vscode.NotebookDocument, _controller: vscode.NotebookController): Promise<void> {
        for (const cell of cells) {
            await this._doExecution(cell);
        }
    }

    private async _doExecution(cell: vscode.NotebookCell): Promise<void> {
        console.log('PostgresKernel: Starting cell execution');
        const execution = this.controller.createNotebookCellExecution(cell);
        execution.start(Date.now());

        try {
            const metadata = cell.notebook.metadata as NotebookMetadata;
            if (!metadata) {
                throw new Error('No connection metadata found');
            }

            const client = new Client({
                host: metadata.host,
                port: metadata.port,
                user: metadata.username,
                password: String(metadata.password),
                database: metadata.databaseName
            });

            await client.connect();
            console.log('PostgresKernel: Connected to database');

            const query = cell.document.getText();
            const result = await client.query(query);
            await client.end();

            if (result.fields.length > 0) {
                console.log('PostgresKernel: Query returned', result.rows.length, 'rows');
                
                const headers = result.fields.map(f => f.name);
                const rows = result.rows;
                
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
                        }
                        th {
                            background: var(--vscode-editor-background);
                            position: sticky;
                            top: 0;
                        }
                        tr:nth-child(even) {
                            background: var(--vscode-list-hoverBackground);
                        }
                        .hidden {
                            display: none !important;
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
                                                const val = row[h];
                                                return `<td>${val === null ? '' : val}</td>`;
                                            }).join('')}</tr>`
                                        ).join('')}
                                    </tbody>
                                </table>
                            </div>
                            <div>${rows.length} rows</div>
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
                                Array.from(row.querySelectorAll('td')).map(cell => {
                                    const val = cell.textContent || '';
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
                                Array.from(row.querySelectorAll('td')).forEach((cell, index) => {
                                    rowData[headers[index]] = cell.textContent || '';
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
                                Array.from(row.querySelectorAll('td')).map(cell => cell.textContent || '')
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
                    vscode.NotebookCellOutputItem.text('<div>No results</div>', 'text/html')
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

    dispose() {
        this.controller.dispose();
    }
}
