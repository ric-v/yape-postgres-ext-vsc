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
                
                // Prepare the data
                const headers = result.fields.map(f => f.name);
                const rows = result.rows;
                
                const html = `
                    <style>
                        .export-container {
                            margin-bottom: 16px;
                        }
                        .export-button {
                            background: var(--vscode-button-background);
                            color: var(--vscode-button-foreground);
                            border: none;
                            padding: 8px 16px;
                            cursor: pointer;
                            margin-right: 8px;
                            border-radius: 2px;
                        }
                        .export-button:hover {
                            background: var(--vscode-button-hoverBackground);
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
                    </style>
                    <div class="export-container">
                        <button class="export-button" onclick="downloadCSV()">Export CSV</button>
                        <button class="export-button" onclick="downloadExcel()">Export Excel</button>
                    </div>
                    <div class="table-container">
                        <table id="resultTable">
                            <thead>
                                <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                            </thead>
                            <tbody>
                                ${rows.map(row => 
                                    `<tr>${headers.map(h => 
                                        `<td>${row[h] === null ? '' : String(row[h])}</td>`
                                    ).join('')}</tr>`
                                ).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div>${rows.length} rows</div>
                    <script>
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

                        function downloadExcel() {
                            const table = document.getElementById('resultTable');
                            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
                            const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => 
                                Array.from(row.querySelectorAll('td')).map(cell => cell.textContent)
                            );

                            let xml = '<?xml version="1.0"?>\\n<?mso-application progid="Excel.Sheet"?>\\n';
                            xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\\n';
                            xml += '<Worksheet ss:Name="Query Result"><Table>\\n';
                            
                            // Add headers
                            xml += '<Row>' + headers.map(h => 
                                '<Cell><Data ss:Type="String">' + 
                                (h || '').replace(/[<>&]/g, c => c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;') + 
                                '</Data></Cell>'
                            ).join('') + '</Row>\\n';
                            
                            // Add data rows
                            rows.forEach(row => {
                                xml += '<Row>' + row.map(cell => {
                                    const value = cell || '';
                                    const type = !isNaN(value) && value !== '' ? 'Number' : 'String';
                                    return '<Cell><Data ss:Type="' + type + '">' + 
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
