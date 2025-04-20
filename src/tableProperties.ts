import * as vscode from 'vscode';
import { Client } from 'pg';

export class TablePropertiesPanel {
    public static async show(client: Client, schema: string, name: string, isView: boolean = false, isFunction: boolean = false): Promise<void> {
        try {
            if (isFunction) {
                // Get function information
                const functionQuery = `
                    SELECT p.proname,
                           pg_get_function_arguments(p.oid) as arguments,
                           pg_get_function_result(p.oid) as result_type,
                           pg_get_functiondef(p.oid) as definition,
                           d.description as description,
                           l.lanname as language
                    FROM pg_proc p
                    LEFT JOIN pg_description d ON p.oid = d.objoid
                    LEFT JOIN pg_language l ON p.prolang = l.oid
                    WHERE p.proname = $1
                    AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`;

                const functionResult = await client.query(functionQuery, [name, schema]);
                if (functionResult.rows.length === 0) {
                    throw new Error('Function not found');
                }

                const functionInfo = functionResult.rows[0];
                
                // Create HTML for function properties
                const panel = vscode.window.createWebviewPanel(
                    'functionProperties',
                    `${name} Properties`,
                    vscode.ViewColumn.One,
                    { enableScripts: true }
                );

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
                            
                            .header {
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                margin-bottom: 20px;
                                padding-bottom: 8px;
                                border-bottom: 1px solid var(--vscode-panel-border);
                            }
                            
                            .info-section {
                                background: var(--vscode-editor-background);
                                border-radius: 6px;
                                box-shadow: 0 2px 8px var(--vscode-widget-shadow);
                                padding: 16px;
                                margin-bottom: 16px;
                            }

                            .info-row {
                                display: grid;
                                grid-template-columns: 120px 1fr;
                                gap: 16px;
                                padding: 8px 0;
                                border-bottom: 1px solid var(--vscode-panel-border);
                            }

                            .info-row:last-child {
                                border-bottom: none;
                            }

                            .label {
                                color: var(--vscode-foreground);
                                opacity: 0.8;
                            }

                            .value {
                                color: var(--vscode-editor-foreground);
                            }

                            .definition {
                                font-family: var(--vscode-editor-font-family);
                                white-space: pre;
                                overflow-x: auto;
                                padding: 16px;
                                background: var(--vscode-editor-background);
                                border-radius: 6px;
                            }

                            .keyword { color: var(--vscode-symbolIcon-keywordForeground); }
                            .type { color: var(--vscode-symbolIcon-typeParameterForeground); }
                            .identifier { color: var(--vscode-symbolIcon-variableForeground); }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h2>${schema}.${name}</h2>
                            </div>

                            <div class="info-section">
                                <div class="info-row">
                                    <span class="label">Arguments</span>
                                    <span class="value">${functionInfo.arguments || 'None'}</span>
                                </div>
                                <div class="info-row">
                                    <span class="label">Returns</span>
                                    <span class="value">${functionInfo.result_type}</span>
                                </div>
                                <div class="info-row">
                                    <span class="label">Language</span>
                                    <span class="value">${functionInfo.language}</span>
                                </div>
                                ${functionInfo.description ? `
                                <div class="info-row">
                                    <span class="label">Description</span>
                                    <span class="value">${functionInfo.description}</span>
                                </div>` : ''}
                            </div>

                            <div class="info-section">
                                <h3>Definition</h3>
                                <pre class="definition">${formatSqlWithHighlighting(functionInfo.definition)}</pre>
                            </div>
                        </div>
                    </body>
                    </html>`;

                return;
            }

            // Get column information
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
                WHERE a.attrelid = '${schema}.${name}'::regclass
                AND a.attnum > 0
                AND NOT a.attisdropped
                ORDER BY a.attnum`;

            // Get definition based on type
            const definitionQuery = isView ? 
                `SELECT pg_get_viewdef('${schema}.${name}'::regclass, true) as definition` :
                `WITH 
                columns AS (
                    SELECT string_agg(
                        format(
                            '%I %s%s%s',
                            column_name,
                            data_type,
                            CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
                            CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END
                        ),
                        ', '
                        ORDER BY ordinal_position
                    ) as column_list
                    FROM information_schema.columns
                    WHERE table_schema = '${schema}'
                    AND table_name = '${name}'
                ),
                constraint_columns AS (
                    SELECT 
                        tc.constraint_name,
                        tc.constraint_type,
                        string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as column_list,
                        string_agg(ccu.column_name, ', ' ORDER BY kcu.ordinal_position) as ref_column_list,
                        ccu.table_schema as ref_schema,
                        ccu.table_name as ref_table
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu ON 
                        tc.constraint_name = kcu.constraint_name AND 
                        tc.table_schema = kcu.table_schema
                    LEFT JOIN information_schema.referential_constraints rc ON 
                        tc.constraint_name = rc.constraint_name AND 
                        tc.table_schema = rc.constraint_schema
                    LEFT JOIN information_schema.constraint_column_usage ccu ON 
                        rc.unique_constraint_name = ccu.constraint_name AND 
                        rc.unique_constraint_schema = ccu.table_schema
                    WHERE tc.table_schema = '${schema}' 
                    AND tc.table_name = '${name}'
                    GROUP BY tc.constraint_name, tc.constraint_type, ccu.table_schema, ccu.table_name
                ),
                constraints AS (
                    SELECT string_agg(
                        CASE 
                            WHEN constraint_type = 'PRIMARY KEY' THEN 
                                format(', CONSTRAINT %I PRIMARY KEY (%s)', 
                                    constraint_name, 
                                    column_list
                                )
                            WHEN constraint_type = 'UNIQUE' THEN 
                                format(', CONSTRAINT %I UNIQUE (%s)',
                                    constraint_name,
                                    column_list
                                )
                            WHEN constraint_type = 'FOREIGN KEY' THEN 
                                format(', CONSTRAINT %I FOREIGN KEY (%s) REFERENCES %I.%I (%s)',
                                    constraint_name,
                                    column_list,
                                    ref_schema,
                                    ref_table,
                                    ref_column_list
                                )
                        END,
                        ' '
                        ORDER BY constraint_name
                    ) as constraint_list
                    FROM constraint_columns
                ),
                table_type AS (
                    SELECT CASE 
                        WHEN c.relpersistence = 'u' THEN ' UNLOGGED'
                        ELSE ''
                    END as persistence
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = '${schema}'
                    AND c.relname = '${name}'
                )
                SELECT format(
                    'CREATE TABLE %I.%I (%s%s)%s',
                    '${schema}',
                    '${name}',
                    c.column_list,
                    COALESCE(co.constraint_list, ''),
                    t.persistence
                ) as definition
                FROM columns c
                CROSS JOIN table_type t
                LEFT JOIN constraints co ON true`;

            const [colResult, defResult] = await Promise.all([
                client.query(columnQuery),
                client.query(definitionQuery)
            ]);

            // Format the definition with proper indentation
            const definition = isView ? 
                defResult.rows[0].definition :
                defResult.rows[0].definition
                    .replace(/[<>]/g, (m: string): string => m === '<' ? '&lt;' : '&gt;')
                    .replace(/\((.*)\)/s, (match: string, group: string): string => {
                        return '(\n  ' + group
                            .split(',')
                            .map((line: string): string => line.trim())
                            .join(',\n  ') + '\n)';
                    });

            const panel = vscode.window.createWebviewPanel(
                isView ? 'viewProperties' : 'tableProperties',
                `${name} Properties`,
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
                            <h2>${schema}.${name}</h2>
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
                            <pre>${formatSqlWithHighlighting(definition)}</pre>
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
            vscode.window.showErrorMessage(`Error loading properties: ${err.message}`);
        }
    }
}
function formatSqlWithHighlighting(formattedScript: string): string {
    const escapedScript = formattedScript
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    return escapedScript
        // Highlight SQL keywords
        .replace(/\b(CREATE|TABLE|VIEW|FUNCTION|RETURNS|LANGUAGE|AS|BEGIN|END|DECLARE|IF|THEN|ELSE|RETURN|PRIMARY KEY|NOT NULL|NULL)\b/g, '<span class="keyword">$1</span>')
        // Highlight data types
        .replace(/\b(integer|text|boolean|timestamp|numeric|character varying|without time zone|bigint|smallint|real|double precision|json|jsonb|uuid|date|time|bytea)\b/g, '<span class="type">$1</span>')
        // Highlight schema and identifiers
        .replace(/(\w+)\.(\w+)/g, '<span class="identifier">$1</span>.<span class="identifier">$2</span>')
        // Highlight constraints
        .replace(/\b(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|REFERENCES)\b/g, '<span class="constraint">$1</span>')
        // Highlight function keywords
        .replace(/\b(plpgsql|sql|STABLE|VOLATILE|IMMUTABLE|SECURITY DEFINER|PARALLEL SAFE)\b/g, '<span class="keyword">$1</span>');
}

