import { Client } from 'pg';
import * as vscode from 'vscode';

interface PostgresCell {
    kind: 'query';
    value: string;
}

interface NotebookMetadata {
    connectionId: string;
    databaseName: string;
    host: string;
    port: number;
    username: string;
    password: string;
}

interface Cell {
    value: string;
}

export class PostgresNotebookProvider implements vscode.NotebookSerializer {
    async deserializeNotebook(
        content: Uint8Array,
        _token: vscode.CancellationToken
    ): Promise<vscode.NotebookData> {
        let metadata: NotebookMetadata | undefined;
        let cells: vscode.NotebookCellData[] = [];

        if (content.byteLength > 0) {
            try {
                const data = JSON.parse(Buffer.from(content).toString());
                if (data.metadata) {
                    metadata = data.metadata;
                }
                if (Array.isArray(data.cells)) {
                    cells = data.cells.map((cell: Cell) => 
                        new vscode.NotebookCellData(
                            vscode.NotebookCellKind.Code,
                            cell.value,
                            'sql'
                        )
                    );
                }
            } catch {
                cells = [
                    new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        '-- Write your SQL query here\nSELECT NOW();',
                        'sql'
                    )
                ];
            }
        } else {
            cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    '-- Write your SQL query here\nSELECT NOW();',
                    'sql'
                )
            ];
        }

        const notebookData = new vscode.NotebookData(cells);
        if (metadata) {
            notebookData.metadata = {
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
        return notebookData;
    }

    async serializeNotebook(
        data: vscode.NotebookData,
        _token: vscode.CancellationToken
    ): Promise<Uint8Array> {
        const cells: Cell[] = data.cells.map(cell => ({
            value: cell.value,
            kind: cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'sql',
            language: cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'sql'
        }));

        const metadata = {
            ...data.metadata,
            custom: {
                cells: cells,
                metadata: {
                    ...data.metadata,
                    enableScripts: true
                }
            }
        };

        return Buffer.from(JSON.stringify({
            cells,
            metadata
        }));
    }
}

export class PostgresNotebookController {
    readonly controllerId = 'postgres-notebook-controller';
    readonly notebookType = 'postgres-notebook';
    readonly label = 'PostgreSQL Notebook';
    readonly supportedLanguages = ['sql'];

    private readonly _controller: vscode.NotebookController;
    private _executionOrder = 0;

    constructor(private client: () => Client | undefined) {
        this._controller = vscode.notebooks.createNotebookController(
            this.controllerId,
            this.notebookType,
            this.label
        );

        this._controller.supportedLanguages = this.supportedLanguages;
        this._controller.supportsExecutionOrder = true;
        this._controller.executeHandler = this._execute.bind(this);
    }

    dispose() {
        this._controller.dispose();
    }

    private async _execute(
        cells: vscode.NotebookCell[],
        _notebook: vscode.NotebookDocument,
        _controller: vscode.NotebookController
    ): Promise<void> {
        const client = this.client();
        if (!client) {
            vscode.window.showErrorMessage('Please connect to a PostgreSQL database first');
            return;
        }

        for (const cell of cells) {
            const execution = this._controller.createNotebookCellExecution(cell);
            execution.executionOrder = ++this._executionOrder;
            execution.start(Date.now());

            try {
                const result = await client.query(cell.document.getText());
                
                // Create a markdown table from the results
                let output = '| ' + result.fields.map(field => field.name).join(' | ') + ' |\n';
                output += '|' + result.fields.map(() => '---').join('|') + '|\n';
                output += result.rows.map(row => 
                    '| ' + Object.values(row).map(val => 
                        val === null ? 'NULL' : 
                        typeof val === 'object' ? JSON.stringify(val) : 
                        String(val)
                    ).join(' | ')
                ).join(' |\n');

                execution.replaceOutput([
                    new vscode.NotebookCellOutput([
                        vscode.NotebookCellOutputItem.text(output, 'text/markdown')
                    ])
                ]);
                execution.end(true, Date.now());
            } catch (err) {
                execution.replaceOutput([
                    new vscode.NotebookCellOutput([
                        vscode.NotebookCellOutputItem.error(err as Error)
                    ])
                ]);
                execution.end(false, Date.now());
            }
        }
    }
}
