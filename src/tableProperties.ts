import * as vscode from 'vscode';
import { Client } from 'pg';

export class TablePropertiesPanel {
    public static async show(client: Client, schema: string, tableName: string): Promise<void> {
        try {
            // Get column information for table view
            const columnQuery = `
                SELECT 
                    a.attname as column_name,
                    pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
                    a.attnotnull as is_not_null,
                    (
                        SELECT pg_catalog.pg_get_expr(d.adbin, d.adrelid)
                        FROM pg_catalog.pg_attrdef d
                        WHERE d.adrelid = a.attrelid
                        AND d.adnum = a.attnum
                        AND a.atthasdef
                    ) as default_value,
                    CASE 
                        WHEN pc.contype = 'p' THEN true
                        ELSE false
                    END as is_primary_key
                FROM pg_catalog.pg_attribute a
                LEFT JOIN pg_catalog.pg_constraint pc 
                    ON pc.conrelid = a.attrelid 
                    AND a.attnum = ANY(pc.conkey)
                    AND pc.contype = 'p'
                WHERE a.attrelid = '${schema}.${tableName}'::regclass
                AND a.attnum > 0
                AND NOT a.attisdropped
                ORDER BY a.attnum`;

            // Get CREATE TABLE script
            const scriptQuery = `
                WITH table_info AS (
                    SELECT
                        a.attname as column_name,
                        pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
                        CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'NULL' END as nullable,
                        CASE WHEN a.atthasdef THEN pg_get_expr(d.adbin, d.adrelid) ELSE '' END as default_value,
                        CASE WHEN pc.contype = 'p' THEN ', PRIMARY KEY' ELSE '' END as key_constraint
                    FROM pg_catalog.pg_attribute a
                    LEFT JOIN pg_catalog.pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
                    LEFT JOIN pg_catalog.pg_constraint pc ON pc.conrelid = a.attrelid 
                        AND a.attnum = ANY(pc.conkey) AND pc.contype = 'p'
                    WHERE a.attrelid = '${schema}.${tableName}'::regclass
                    AND a.attnum > 0 AND NOT a.attisdropped
                    ORDER BY a.attnum
                )
                SELECT format(
                    'CREATE TABLE %I.%I (%s);',
                    '${schema}',
                    '${tableName}',
                    string_agg(
                        format('%I %s %s%s',
                            column_name,
                            data_type,
                            nullable,
                            key_constraint
                        ),
                        ', '
                    )
                ) as table_script
                FROM table_info;
            `;

            const [colResult, scriptResult] = await Promise.all([
                client.query(columnQuery),
                client.query(scriptQuery)
            ]);

            // Format CREATE TABLE script with proper indentation
            interface ScriptResult {
                table_script: string;
            }

            interface FormatMatchResult {
                match: string;
                group: string;
            }

            const formattedScript: string = scriptResult.rows[0].table_script
                .replace(/[<>]/g, (m: string): string => m === '<' ? '&lt;' : '&gt;')
                .replace(/\((.*)\)/s, (match: string, group: string): string => {
                    return '(\n  ' + group
                        .split(',')
                        .map((line: string): string => line.trim())
                        .join(',\n  ') + '\n)';
                });

            const panel = vscode.window.createWebviewPanel(
                'tableProperties',
                `${tableName} Properties`,
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            // Generate table HTML content
            const tableContent = colResult.rows.map(col => `
                <tr>
                    <td class="${col.is_primary_key ? 'pk-column' : ''} ${col.is_not_null ? 'required-column' : ''}">${col.column_name}</td>
                    <td>${col.data_type}</td>
                    <td style="text-align: center;">
                        <input type="checkbox" 
                               class="custom-checkbox" 
                               ${!col.is_not_null ? 'checked' : ''} 
                               disabled 
                               title="${col.is_not_null ? 'Not Nullable' : 'Nullable'}"
                        >
                    </td>
                    <td>${col.default_value || ''}</td>
                    <td style="text-align: center;">
                        <input type="checkbox" 
                               class="custom-checkbox" 
                               ${col.is_primary_key ? 'checked' : ''} 
                               disabled 
                               title="${col.is_primary_key ? 'Primary Key' : 'Not Primary Key'}"
                        >
                    </td>
                </tr>
            `).join('');

            panel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { 
                            padding: 16px; 
                            font-family: var(--vscode-editor-font-family);
                            color: var(--vscode-editor-foreground);
                        }
                        .container { display: grid; gap: 16px; }
                        
                        /* Header styles */
                        .header {
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            margin-bottom: 20px;
                            padding-bottom: 8px;
                            border-bottom: 1px solid var(--vscode-panel-border);
                        }

                        /* Switch styles */
                        .switch-container {
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            opacity: 0.8;
                        }

                        .view-label {
                            font-size: 12px;
                            color: var(--vscode-foreground);
                            opacity: 0.8;
                        }

                        .switch {
                            position: relative;
                            display: inline-block;
                            width: 36px;
                            height: 20px;
                        }

                        .switch input { opacity: 0; width: 0; height: 0; }

                        .slider {
                            position: absolute;
                            cursor: pointer;
                            top: 0; left: 0; right: 0; bottom: 0;
                            background-color: var(--vscode-button-secondaryBackground);
                            transition: .2s;
                            border-radius: 10px;
                            opacity: 0.6;
                        }

                        .slider:before {
                            position: absolute;
                            content: "";
                            height: 14px;
                            width: 14px;
                            left: 3px;
                            bottom: 3px;
                            background-color: var(--vscode-button-foreground);
                            transition: .2s;
                            border-radius: 50%;
                        }

                        input:checked + .slider {
                            background-color: var(--vscode-button-background);
                        }

                        input:checked + .slider:before {
                            transform: translateX(16px);
                        }

                        /* View styles */
                        #tableView, #scriptView { 
                            display: none; 
                            opacity: 0;
                            transition: opacity 0.3s ease-in-out;
                        }
                        #tableView.active, #scriptView.active { 
                            display: block;
                            opacity: 1;
                        }

                        /* Table styles */
                        .table-container {
                            background: var(--vscode-editor-background);
                            border-radius: 6px;
                            box-shadow: 0 2px 8px var(--vscode-widget-shadow);
                            overflow: hidden;
                        }
                        
                        table { 
                            border-collapse: separate;
                            border-spacing: 0;
                            width: 100%;
                        }
                        
                        th, td { 
                            border: none;
                            padding: 12px 16px;
                            text-align: left;
                        }
                        
                        th {
                            background-color: var(--vscode-editor-background);
                            color: var(--vscode-symbolIcon-classForeground);
                            font-weight: 600;
                            font-size: 0.9em;
                            text-transform: uppercase;
                            letter-spacing: 0.05em;
                            border-bottom: 2px solid var(--vscode-panel-border);
                        }
                        
                        tr:not(:last-child) td {
                            border-bottom: 1px solid var(--vscode-panel-border);
                        }
                        
                        td {
                            background: var(--vscode-editor-background);
                            font-family: var(--vscode-editor-font-family);
                        }

                        /* Column highlighting */
                        .pk-column {
                            color: var(--vscode-symbolIcon-constantForeground);
                            font-weight: 600;
                        }
                        
                        .required-column {
                            color: var(--vscode-gitDecoration-modifiedResourceForeground);
                        }

                        /* Script View */
                        .script-container {
                            background: var(--vscode-editor-background);
                            border-radius: 6px;
                            box-shadow: 0 2px 8px var(--vscode-widget-shadow);
                        }
                        
                        pre {
                            margin: 0;
                            padding: 16px;
                            overflow-x: auto;
                            font-family: var(--vscode-editor-font-family);
                            font-size: 13px;
                            line-height: 1.5;
                            color: var(--vscode-editor-foreground);
                        }

                        .keyword { color: var(--vscode-symbolIcon-keywordForeground); }
                        .identifier { color: var(--vscode-symbolIcon-variableForeground); }
                        .type { color: var(--vscode-symbolIcon-typeParameterForeground); }
                        .constraint { color: var(--vscode-symbolIcon-constantForeground); }

                        /* Checkbox styles */
                        .custom-checkbox {
                            appearance: none;
                            width: 16px;
                            height: 16px;
                            border: 1px solid var(--vscode-checkbox-border);
                            background: var(--vscode-checkbox-background);
                            border-radius: 3px;
                            cursor: default;
                            position: relative;
                        }

                        .custom-checkbox:checked {
                            background: var(--vscode-checkbox-selectBackground);
                            border-color: var(--vscode-checkbox-selectBorder);
                        }

                        .custom-checkbox:checked::after {
                            content: "✓";
                            position: absolute;
                            color: var(--vscode-checkbox-foreground);
                            font-size: 12px;
                            left: 2px;
                            top: -1px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h2>${schema}.${tableName}</h2>
                            <div class="switch-container">
                                <span class="view-label">Table</span>
                                <label class="switch">
                                    <input type="checkbox" id="viewSwitch">
                                    <span class="slider"></span>
                                </label>
                                <span class="view-label">Script</span>
                            </div>
                        </div>

                        <div id="tableView" class="table-container active">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Column Name</th>
                                        <th>Data Type</th>
                                        <th style="text-align: center;" title="Check means column is nullable">Nullable</th>
                                        <th>Default</th>
                                        <th style="text-align: center;" title="Check means column is primary key">Primary Key</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tableContent}
                                </tbody>
                            </table>
                        </div>

                        <div id="scriptView" class="script-container">
                            <pre>${formatSqlWithHighlighting(formattedScript)}</pre>
                        </div>
                    </div>

                    <script>
                        const viewSwitch = document.getElementById('viewSwitch');
                        const tableView = document.getElementById('tableView');
                        const scriptView = document.getElementById('scriptView');

                        // Initialize views
                        tableView.classList.add('active');
                        scriptView.classList.remove('active');

                        viewSwitch.addEventListener('change', (e) => {
                            if (e.target.checked) {
                                requestAnimationFrame(() => {
                                    tableView.classList.remove('active');
                                    scriptView.classList.add('active');
                                });
                            } else {
                                requestAnimationFrame(() => {
                                    scriptView.classList.remove('active');
                                    tableView.classList.add('active');
                                });
                            }
                        });

                        // Helper function for SQL syntax highlighting
                        function formatSqlWithHighlighting(sql) {
                            const escapeHtml = (text) => {
                                return text
                                    .replace(/&/g, "&amp;")
                                    .replace(/</g, "&lt;")
                                    .replace(/>/g, "&gt;");
                            };
                            
                            return escapeHtml(sql)
                                .replace(/\b(CREATE TABLE|PRIMARY KEY|NOT NULL)\b/g, '<span class="keyword">$1</span>')
                                .replace(/\b(integer|text|boolean|timestamp|numeric|character varying|without time zone)\b/g, '<span class="type">$1</span>')
                                .replace(/(\w+)\.(\w+)/g, '<span class="identifier">$1</span>.<span class="identifier">$2</span>');
                        }
                    </script>
                </body>
                </html>`;
        } catch (err: any) {
            vscode.window.showErrorMessage(`Error loading table properties: ${err.message}`);
        }
    }
}
function formatSqlWithHighlighting(formattedScript: string): string {
    // First escape HTML special characters
    const escapedScript = formattedScript
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Add syntax highlighting using spans with specific classes
    return escapedScript
        // Highlight SQL keywords
        .replace(/\b(CREATE TABLE|PRIMARY KEY|NOT NULL|NULL)\b/g, '<span class="keyword">$1</span>')
        // Highlight data types
        .replace(/\b(integer|text|boolean|timestamp|numeric|character varying|without time zone)\b/g, '<span class="type">$1</span>')
        // Highlight schema and table identifiers
        .replace(/(\w+)\.(\w+)/g, '<span class="identifier">$1</span>.<span class="identifier">$2</span>')
        // Highlight constraints
        .replace(/\b(PRIMARY KEY)\b/g, '<span class="constraint">$1</span>');
}

