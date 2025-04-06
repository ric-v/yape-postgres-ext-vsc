import * as vscode from 'vscode';

export class PostgresNotebookSerializer implements vscode.NotebookSerializer {
    async deserializeNotebook(
        content: Uint8Array,
        _token: vscode.CancellationToken
    ): Promise<vscode.NotebookData> {
        const contents = new TextDecoder().decode(content);
        let raw: any;
        try {
            raw = JSON.parse(contents);
        } catch {
            raw = { cells: [] };
        }

        const cells = raw.cells.map((item: any) => 
            new vscode.NotebookCellData(
                item.kind === 'markdown' ? vscode.NotebookCellKind.Markup : vscode.NotebookCellKind.Code,
                item.value,
                item.language
            )
        );

        return new vscode.NotebookData(cells);
    }

    async serializeNotebook(
        data: vscode.NotebookData,
        _token: vscode.CancellationToken
    ): Promise<Uint8Array> {
        const cells = data.cells.map(cell => ({
            kind: cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'sql',
            value: cell.value,
            language: cell.kind === vscode.NotebookCellKind.Markup ? 'markdown' : 'sql'
        }));

        return new TextEncoder().encode(JSON.stringify({ cells }));
    }
}
