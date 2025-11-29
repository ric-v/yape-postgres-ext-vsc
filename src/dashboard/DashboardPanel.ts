import * as vscode from 'vscode';
import { Client } from 'pg';
import { fetchStats, DashboardStats } from './DashboardData';
import { getHtmlForWebview, getLoadingHtml, getErrorHtml } from './DashboardHtml';

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, private readonly client: Client, private readonly dbName: string) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = getLoadingHtml();

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'refresh':
                        await this._update();
                        break;
                    case 'showDetails':
                        await this._showDetails(message.type);
                        break;
                    case 'terminateQuery':
                        const termAns = await vscode.window.showWarningMessage(
                            `Are you sure you want to terminate query ${message.pid}?`,
                            { modal: true },
                            'Yes', 'No'
                        );
                        if (termAns === 'Yes') {
                            await this._terminateQuery(message.pid);
                        }
                        break;
                    case 'cancelQuery':
                        const cancelAns = await vscode.window.showWarningMessage(
                            `Are you sure you want to cancel query ${message.pid}?`,
                            { modal: true },
                            'Yes', 'No'
                        );
                        if (cancelAns === 'Yes') {
                            await this._cancelQuery(message.pid);
                        }
                        break;
                }
            },
            null,
            this._disposables
        );

        this._update();
    }

    public static async show(client: Client, dbName: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'postgresDashboard',
            `Dashboard: ${dbName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, client, dbName);
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _terminateQuery(pid: number) {
        try {
            await this.client.query('SELECT pg_terminate_backend($1)', [pid]);
            vscode.window.showInformationMessage(`Terminated query with PID ${pid}`);
            this._update();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to terminate query: ${error.message}`);
        }
    }

    private async _cancelQuery(pid: number) {
        try {
            await this.client.query('SELECT pg_cancel_backend($1)', [pid]);
            vscode.window.showInformationMessage(`Cancelled query with PID ${pid}`);
            this._update();
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to cancel query: ${error.message}`);
        }
    }

    private async _update() {
        try {
            const stats = await fetchStats(this.client, this.dbName);
            this._panel.webview.postMessage({ command: 'updateStats', stats });
            // If it's the first load, set the HTML
            if (this._panel.webview.html.includes('Loading Dashboard...')) {
                this._panel.webview.html = getHtmlForWebview(stats);
            }
        } catch (error: any) {
            // Only show error if we haven't loaded the UI yet, otherwise send error message
            if (this._panel.webview.html.includes('Loading Dashboard...')) {
                this._panel.webview.html = getErrorHtml(error.message);
            } else {
                // Could send error toast to webview here
                console.error('Dashboard update failed:', error);
            }
        }
    }

    private async _showDetails(type: string) {
        try {
            let data: any[] = [];
            let columns: string[] = [];

            switch (type) {
                case 'tables':
                    const res = await this.client.query(`
                        SELECT schemaname || '.' || tablename as name,
                               pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size,
                               pg_total_relation_size(schemaname || '.' || tablename) as raw_size
                        FROM pg_tables
                        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                        ORDER BY raw_size DESC
                    `);
                    data = res.rows;
                    columns = ['Name', 'Size'];
                    break;
                case 'views':
                    const vRes = await this.client.query(`
                        SELECT schemaname || '.' || viewname as name,
                               viewowner as owner
                        FROM pg_views
                        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                        ORDER BY schemaname, viewname
                    `);
                    data = vRes.rows;
                    columns = ['Name', 'Owner'];
                    break;
                case 'functions':
                    const fRes = await this.client.query(`
                        SELECT n.nspname || '.' || p.proname as name,
                               l.lanname as language
                        FROM pg_proc p
                        JOIN pg_namespace n ON p.pronamespace = n.oid
                        JOIN pg_language l ON p.prolang = l.oid
                        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
                        ORDER BY n.nspname, p.proname
                    `);
                    data = fRes.rows;
                    columns = ['Name', 'Language'];
                    break;
                // Add other cases as needed
            }

            this._panel.webview.postMessage({ command: 'showDetails', type, data, columns });
        } catch (error: any) {
            console.error('Failed to fetch details:', error);
        }
    }
}
