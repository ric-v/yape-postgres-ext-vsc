import * as vscode from 'vscode';

export async function cmdExportData(args: any) {
    console.log('Extension: Export command triggered with args:', args);
    try {
        const { format, content, filename } = args;
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(filename),
            filters: {
                'CSV files': ['csv'],
                'Excel files': ['xls', 'xlsx']
            },
            saveLabel: `Export as ${format.toUpperCase()}`
        });

        console.log('Extension: Save dialog result:', saveUri?.fsPath);
        if (saveUri) {
            console.log('Extension: Writing file content, size:', content.length);
            await vscode.workspace.fs.writeFile(
                saveUri,
                Buffer.from(content, 'utf-8')
            );
            console.log('Extension: File written successfully');
            vscode.window.showInformationMessage(
                `Successfully exported to ${saveUri.fsPath}`
            );
        }
    } catch (err: any) {
        console.error('Extension: Export failed:', err);
        vscode.window.showErrorMessage(`Export failed: ${err.message}`);
    }
}

export async function cmdSaveFile(args: any) {
    try {
        console.log('Saving file with args:', args);
        const { content, filename, type } = args;

        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(filename),
            filters: {
                'CSV files': ['csv'],
                'Excel files': ['xls', 'xlsx']
            },
            saveLabel: `Export as ${type.toUpperCase()}`
        });

        if (saveUri) {
            await vscode.workspace.fs.writeFile(
                saveUri,
                Buffer.from(content)
            );
            vscode.window.showInformationMessage(`Successfully exported to ${saveUri.fsPath}`);
        }
    } catch (err: any) {
        console.error('Save file failed:', err);
        vscode.window.showErrorMessage(`Export failed: ${err.message}`);
    }
}