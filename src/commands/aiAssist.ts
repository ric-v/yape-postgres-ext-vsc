import * as vscode from 'vscode';
import * as https from 'https';
import { ErrorHandlers, StringUtils } from './helper';
import { ConnectionManager } from '../services/ConnectionManager';
import { PostgresMetadata } from '../common/types';

// Interface for table schema information
interface TableSchemaInfo {
    tableName: string;
    schemaName: string;
    columns: Array<{
        name: string;
        dataType: string;
        isNullable: boolean;
        defaultValue: string | null;
        isPrimaryKey: boolean;
        isForeignKey: boolean;
        references?: string;
    }>;
    indexes: Array<{
        name: string;
        columns: string[];
        isUnique: boolean;
        isPrimary: boolean;
    }>;
    constraints: Array<{
        name: string;
        type: string;
        definition: string;
    }>;
}

// Interface for cell context
interface CellContext {
    currentQuery: string;
    cellIndex: number;
    previousCells: string[];
    lastOutput?: string;
    tableSchemas: TableSchemaInfo[];
    databaseInfo?: {
        name: string;
        version?: string;
    };
}

export async function cmdAiAssist(cell: vscode.NotebookCell | undefined, context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
    outputChannel.appendLine('AI Assist command triggered');

    if (!cell) {
        outputChannel.appendLine('No cell provided in arguments, checking active notebook editor');
        const activeEditor = vscode.window.activeNotebookEditor;
        if (activeEditor && activeEditor.selection) {
            // Get the first selected cell
            if (activeEditor.selection.start < activeEditor.notebook.cellCount) {
                cell = activeEditor.notebook.cellAt(activeEditor.selection.start);
                outputChannel.appendLine(`Found active cell at index ${activeEditor.selection.start}`);
            }
        }
    }

    if (!cell) {
        outputChannel.appendLine('No cell found');
        vscode.window.showErrorMessage('No cell selected');
        return;
    }

    // TypeScript now knows cell is vscode.NotebookCell because of the return above
    const validCell = cell;

    const userInput = await AiTaskSelector.selectTask();
    if (!userInput) {
        return;
    }

    try {
        const config = vscode.workspace.getConfiguration('postgresExplorer');
        const provider = config.get<string>('aiProvider') || 'vscode-lm';
        const modelInfo = await getModelInfo(provider, config);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `AI (${modelInfo}) is analyzing your query...`,
            cancellable: true
        }, async (progress, token) => {

            progress.report({ message: "Gathering context..." });

            // Gather cell context including table schemas
            const cellContext = await gatherCellContext(validCell, context, outputChannel);

            progress.report({ message: "Generating response..." });

            let responseText = '';

            if (provider === 'vscode-lm') {
                responseText = await callVsCodeLm(userInput, cellContext, token, config);
            } else {
                responseText = await callDirectApi(provider, userInput, cellContext, config, outputChannel);
            }

            // Parse the response to check for placement instruction
            const { query, placement } = parseAiResponse(responseText);

            // Clean up response if it contains markdown code blocks despite instructions
            const cleanedQuery = StringUtils.cleanMarkdownCodeBlocks(query);

            if (cleanedQuery.trim()) {
                if (placement === 'new_cell') {
                    // Add as a new cell below the current one
                    const notebook = validCell.notebook;
                    const targetIndex = validCell.index + 1;

                    const newCellData = new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Code,
                        cleanedQuery,
                        'sql'
                    );

                    const notebookEdit = new vscode.NotebookEdit(
                        new vscode.NotebookRange(targetIndex, targetIndex),
                        [newCellData]
                    );

                    const workspaceEdit = new vscode.WorkspaceEdit();
                    workspaceEdit.set(notebook.uri, [notebookEdit]);
                    await vscode.workspace.applyEdit(workspaceEdit);

                    vscode.window.showInformationMessage(`AI (${modelInfo}) response added as new cell below for comparison.`);
                } else {
                    // Replace the current cell content (default behavior)
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(
                        validCell.document.uri,
                        new vscode.Range(0, 0, validCell.document.lineCount, 0),
                        cleanedQuery
                    );
                    await vscode.workspace.applyEdit(edit);

                    vscode.window.showInformationMessage(`AI (${modelInfo}) response has replaced the current cell content.`);
                }
            }
        });

    } catch (error) {
        console.error('AI Assist Error:', error);
        const message = error instanceof Error ? error.message : String(error);
        await ErrorHandlers.showError(
            `AI Assist failed: ${message}`,
            'Configure Settings',
            'workbench.action.openSettings'
        );
    }
}

/**
 * Gather context from the cell and notebook for AI assistance
 */
async function gatherCellContext(cell: vscode.NotebookCell, context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): Promise<CellContext> {
    const currentQuery = cell.document.getText();
    const cellIndex = cell.index;

    // Get previous cells content (up to 5 previous SQL cells for context)
    const previousCells: string[] = [];
    for (let i = Math.max(0, cellIndex - 5); i < cellIndex; i++) {
        const prevCell = cell.notebook.cellAt(i);
        if (prevCell.kind === vscode.NotebookCellKind.Code) {
            previousCells.push(prevCell.document.getText());
        }
    }

    // Try to get the last output of the current cell
    let lastOutput: string | undefined;
    if (cell.outputs && cell.outputs.length > 0) {
        const lastOutputItem = cell.outputs[cell.outputs.length - 1];
        if (lastOutputItem.items && lastOutputItem.items.length > 0) {
            const outputItem = lastOutputItem.items[0];
            if (outputItem.mime === 'application/x-postgres-result') {
                try {
                    const data = JSON.parse(new TextDecoder().decode(outputItem.data));
                    if (data.rows && data.columns) {
                        const totalRows = data.rows.length;
                        const maxSampleRows = 5; // Limit sample rows for context
                        const maxColumns = 20; // Limit columns to avoid token bloat

                        // Truncate columns if too many
                        const displayColumns = data.columns.length > maxColumns
                            ? [...data.columns.slice(0, maxColumns), `... and ${data.columns.length - maxColumns} more columns`]
                            : data.columns;

                        // Only include sample rows if total is reasonable (< 1000 rows)
                        // For very large result sets, just show metadata
                        if (totalRows > 1000) {
                            lastOutput = `Query returned ${totalRows} rows (large result set - sample omitted)\nColumns (${data.columns.length}): ${displayColumns.join(', ')}`;
                        } else if (totalRows > 100) {
                            // For medium result sets, show fewer sample rows
                            const sampleRows = data.rows.slice(0, 3);
                            // Truncate each row's values to avoid huge JSON
                            const truncatedSamples = sampleRows.map((row: any) => {
                                const truncated: any = {};
                                const cols = data.columns.slice(0, maxColumns);
                                for (const col of cols) {
                                    const val = row[col];
                                    if (typeof val === 'string' && val.length > 100) {
                                        truncated[col] = val.substring(0, 100) + '... (truncated)';
                                    } else {
                                        truncated[col] = val;
                                    }
                                }
                                return truncated;
                            });
                            lastOutput = `Columns (${data.columns.length}): ${displayColumns.join(', ')}\nSample data (showing 3 of ${totalRows} rows):\n${JSON.stringify(truncatedSamples, null, 2)}`;
                        } else {
                            // For small result sets, show more samples
                            const sampleRows = data.rows.slice(0, maxSampleRows);
                            const truncatedSamples = sampleRows.map((row: any) => {
                                const truncated: any = {};
                                const cols = data.columns.slice(0, maxColumns);
                                for (const col of cols) {
                                    const val = row[col];
                                    if (typeof val === 'string' && val.length > 200) {
                                        truncated[col] = val.substring(0, 200) + '... (truncated)';
                                    } else {
                                        truncated[col] = val;
                                    }
                                }
                                return truncated;
                            });
                            lastOutput = `Columns (${data.columns.length}): ${displayColumns.join(', ')}\nSample data (showing ${sampleRows.length} of ${totalRows} rows):\n${JSON.stringify(truncatedSamples, null, 2)}`;
                        }
                    } else if (data.command) {
                        lastOutput = `Command: ${data.command}, Rows affected: ${data.rowCount || 0}`;
                    }
                } catch (e) {
                    outputChannel.appendLine('Failed to parse cell output: ' + e);
                }
            }
        }
    }

    // Extract table names from query and fetch their schemas
    const tableSchemas: TableSchemaInfo[] = [];
    const tableNames = extractTableNames(currentQuery);

    if (tableNames.length > 0) {
        try {
            const metadata = cell.notebook.metadata as PostgresMetadata;
            if (metadata?.connectionId) {
                const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
                const connection = connections.find(c => c.id === metadata.connectionId);

                if (connection) {
                    const client = await ConnectionManager.getInstance().getConnection({
                        id: connection.id,
                        host: connection.host,
                        port: connection.port,
                        username: connection.username,
                        database: metadata.databaseName || connection.database,
                        name: connection.name
                    });

                    for (const tableName of tableNames) {
                        try {
                            const schema = await fetchTableSchema(client, tableName);
                            if (schema) {
                                tableSchemas.push(schema);
                            }
                        } catch (e) {
                            outputChannel.appendLine(`Failed to fetch schema for ${tableName}: ${e}`);
                        }
                    }
                }
            }
        } catch (e) {
            outputChannel.appendLine('Failed to connect for schema fetch: ' + e);
        }
    }

    // Get database info
    let databaseInfo: { name: string; version?: string } | undefined;
    try {
        const metadata = cell.notebook.metadata as PostgresMetadata;
        if (metadata?.databaseName) {
            databaseInfo = { name: metadata.databaseName };
        }
    } catch (e) {
        // Ignore
    }

    return {
        currentQuery,
        cellIndex,
        previousCells,
        lastOutput,
        tableSchemas,
        databaseInfo
    };
}

/**
 * Parse AI response to extract query and placement instruction
 */
function parseAiResponse(response: string): { query: string; placement: 'replace' | 'new_cell' } {
    const lines = response.trim().split('\n');
    let placement: 'replace' | 'new_cell' = 'replace';
    let queryLines: string[] = [];

    // Look for placement instruction at the beginning or end of the response
    // Format: [PLACEMENT: new_cell] or [PLACEMENT: replace]
    const placementRegex = /\[PLACEMENT:\s*(new_cell|replace)\]/i;

    for (const line of lines) {
        const match = line.match(placementRegex);
        if (match) {
            placement = match[1].toLowerCase() as 'replace' | 'new_cell';
        } else {
            queryLines.push(line);
        }
    }

    // Also check for placement in SQL comments
    const commentPlacementRegex = /--\s*PLACEMENT:\s*(new_cell|replace)/i;
    const filteredLines: string[] = [];

    for (const line of queryLines) {
        const match = line.match(commentPlacementRegex);
        if (match) {
            placement = match[1].toLowerCase() as 'replace' | 'new_cell';
        } else {
            filteredLines.push(line);
        }
    }

    return {
        query: filteredLines.join('\n').trim(),
        placement
    };
}

/**
 * Extract table names from SQL query
 */
function extractTableNames(query: string): Array<{ schema: string; table: string }> {
    const tables: Array<{ schema: string; table: string }> = [];

    // Patterns to match table references
    const patterns = [
        // FROM/JOIN clause: FROM schema.table or FROM table
        /(?:FROM|JOIN)\s+(?:"?(\w+)"?\.)?"?(\w+)"?(?:\s+(?:AS\s+)?\w+)?/gi,
        // UPDATE table
        /UPDATE\s+(?:"?(\w+)"?\.)?"?(\w+)"?/gi,
        // INSERT INTO table
        /INSERT\s+INTO\s+(?:"?(\w+)"?\.)?"?(\w+)"?/gi,
        // DELETE FROM table
        /DELETE\s+FROM\s+(?:"?(\w+)"?\.)?"?(\w+)"?/gi,
        // CREATE TABLE / ALTER TABLE / DROP TABLE
        /(?:CREATE|ALTER|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/gi,
        // TRUNCATE table
        /TRUNCATE\s+(?:TABLE\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/gi
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(query)) !== null) {
            const schema = match[1] || 'public';
            const table = match[2];

            // Avoid duplicates and SQL keywords
            const sqlKeywords = ['select', 'from', 'where', 'and', 'or', 'not', 'null', 'true', 'false', 'as', 'on', 'in', 'is', 'like', 'between', 'exists', 'case', 'when', 'then', 'else', 'end'];
            if (table && !sqlKeywords.includes(table.toLowerCase()) && !tables.some(t => t.schema === schema && t.table === table)) {
                tables.push({ schema, table });
            }
        }
    }

    return tables;
}

/**
 * Fetch table schema from database
 */
async function fetchTableSchema(client: any, tableRef: { schema: string; table: string }): Promise<TableSchemaInfo | null> {
    const { schema, table } = tableRef;

    // Fetch columns
    const columnsResult = await client.query(`
        SELECT 
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default,
            CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
            CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_foreign_key,
            fk.foreign_table_schema || '.' || fk.foreign_table_name || '(' || fk.foreign_column_name || ')' as references_to
        FROM information_schema.columns c
        LEFT JOIN (
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name 
                AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
                AND tc.table_schema = $1
                AND tc.table_name = $2
        ) pk ON c.column_name = pk.column_name
        LEFT JOIN (
            SELECT 
                kcu.column_name,
                ccu.table_schema as foreign_table_schema,
                ccu.table_name as foreign_table_name,
                ccu.column_name as foreign_column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu 
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = $1
                AND tc.table_name = $2
        ) fk ON c.column_name = fk.column_name
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position
    `, [schema, table]);

    if (columnsResult.rows.length === 0) {
        return null;
    }

    // Fetch indexes
    const indexesResult = await client.query(`
        SELECT 
            i.relname as index_name,
            array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns,
            ix.indisunique as is_unique,
            ix.indisprimary as is_primary
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE n.nspname = $1 AND t.relname = $2
        GROUP BY i.relname, ix.indisunique, ix.indisprimary
    `, [schema, table]);

    // Fetch constraints
    const constraintsResult = await client.query(`
        SELECT 
            tc.constraint_name,
            tc.constraint_type,
            pg_get_constraintdef(c.oid) as definition
        FROM information_schema.table_constraints tc
        JOIN pg_constraint c ON c.conname = tc.constraint_name
        JOIN pg_namespace n ON n.oid = c.connamespace AND n.nspname = tc.table_schema
        WHERE tc.table_schema = $1 AND tc.table_name = $2
    `, [schema, table]);

    return {
        tableName: table,
        schemaName: schema,
        columns: columnsResult.rows.map((row: any) => ({
            name: row.column_name,
            dataType: row.data_type,
            isNullable: row.is_nullable === 'YES',
            defaultValue: row.column_default,
            isPrimaryKey: row.is_primary_key,
            isForeignKey: row.is_foreign_key,
            references: row.is_foreign_key ? row.references_to : undefined
        })),
        indexes: indexesResult.rows.map((row: any) => ({
            name: row.index_name,
            columns: row.columns,
            isUnique: row.is_unique,
            isPrimary: row.is_primary
        })),
        constraints: constraintsResult.rows.map((row: any) => ({
            name: row.constraint_name,
            type: row.constraint_type,
            definition: row.definition
        }))
    };
}

async function getModelInfo(provider: string, config: vscode.WorkspaceConfiguration): Promise<string> {
    try {
        const configuredModel = config.get<string>('aiModel');
        
        if (provider === 'vscode-lm') {
            if (configuredModel) {
                const baseName = configuredModel.replace(/\s*\(.*\)$/, '').trim();
                const allModels = await vscode.lm.selectChatModels({});
                const matchingModels = allModels.filter(m => 
                    m.id === baseName || m.name === baseName || m.family === baseName ||
                    m.id === configuredModel || m.name === configuredModel || m.family === configuredModel
                );
                if (matchingModels.length > 0) {
                    return matchingModels[0].name || matchingModels[0].id;
                }
            }
            const models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
            if (models.length > 0) {
                return models[0].name || models[0].id;
            }
            const anyModels = await vscode.lm.selectChatModels({});
            return anyModels.length > 0 ? (anyModels[0].name || anyModels[0].id) : 'Unknown';
        } else {
            if (configuredModel) return configuredModel;
            switch (provider) {
                case 'openai': return 'gpt-4';
                case 'anthropic': return 'claude-3-5-sonnet-20241022';
                case 'gemini': return 'gemini-pro';
                case 'custom': return 'custom-model';
                default: return 'Unknown';
            }
        }
    } catch {
        return 'Unknown';
    }
}

async function callVsCodeLm(userInput: string, cellContext: CellContext, token: vscode.CancellationToken, config: vscode.WorkspaceConfiguration): Promise<string> {
    const configuredModel = config.get<string>('aiModel');
    let models: vscode.LanguageModelChat[];
    
    if (configuredModel) {
        // Extract base name if format is "name (family)"
        const baseName = configuredModel.replace(/\s*\(.*\)$/, '').trim();
        
        // Try to find the specific model by name/id/family
        const allModels = await vscode.lm.selectChatModels({});
        const matchingModels = allModels.filter(m => 
            m.id === baseName || 
            m.name === baseName || 
            m.family === baseName ||
            m.id === configuredModel || 
            m.name === configuredModel || 
            m.family === configuredModel
        );
        models = matchingModels.length > 0 ? matchingModels : allModels;
    } else {
        // Default: prefer GPT-4 class models
        models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
        if (models.length === 0) {
            models = await vscode.lm.selectChatModels({});
        }
    }

    const model = models[0];
    if (!model) {
        throw new Error('No AI models available via VS Code API. Please ensure GitHub Copilot Chat is installed or switch provider.');
    }

    const messages = [
        vscode.LanguageModelChatMessage.User(buildPrompt(userInput, cellContext))
    ];

    const chatRequest = await model.sendRequest(messages, {}, token);
    let responseText = '';

    for await (const fragment of chatRequest.text) {
        responseText += fragment;
    }
    return responseText;
}

async function callDirectApi(provider: string, userInput: string, cellContext: CellContext, config: vscode.WorkspaceConfiguration, outputChannel: vscode.OutputChannel): Promise<string> {
    const apiKey = config.get<string>('aiApiKey');
    if (!apiKey) {
        throw new Error(`API Key is required for ${provider} provider. Please configure postgresExplorer.aiApiKey.`);
    }

    let endpoint = '';
    let model = config.get<string>('aiModel');
    let headers: any = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };
    let body: any = {};
    const prompt = buildPrompt(userInput, cellContext);

    if (provider === 'openai') {
        endpoint = 'https://api.openai.com/v1/chat/completions';
        model = model || 'gpt-4';
        body = {
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1
        };
    } else if (provider === 'anthropic') {
        endpoint = 'https://api.anthropic.com/v1/messages';
        model = model || 'claude-3-5-sonnet-20241022';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        delete headers['Authorization']; // Anthropic uses x-api-key
        body = {
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096
        };
    } else if (provider === 'gemini') {
        model = model || 'gemini-pro';
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        outputChannel.appendLine(`Using Gemini endpoint: ${endpoint}`);
        headers['X-goog-api-key'] = apiKey;
        delete headers['Authorization'];
        body = {
            contents: [{
                parts: [{ text: prompt }]
            }]
        };
    } else if (provider === 'custom') {
        endpoint = config.get<string>('aiEndpoint') || '';
        if (!endpoint) throw new Error('Endpoint is required for custom provider');
        model = model || 'gpt-3.5-turbo'; // Default fallback
        body = {
            model: model,
            messages: [{ role: 'user', content: prompt }]
        };
    }

    return new Promise((resolve, reject) => {
        const url = new URL(endpoint);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: headers
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`API Request failed with status ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    if (provider === 'anthropic') {
                        resolve(json.content[0].text);
                    } else if (provider === 'gemini') {
                        resolve(json.candidates[0].content.parts[0].text);
                    } else {
                        resolve(json.choices[0].message.content);
                    }
                } catch (e) {
                    reject(new Error('Failed to parse API response'));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(JSON.stringify(body));
        req.end();
    });
}

function buildPrompt(userInput: string, cellContext: CellContext): string {
    const { currentQuery, previousCells, lastOutput, tableSchemas, databaseInfo } = cellContext;

    // Build table schema context
    let schemaContext = '';
    if (tableSchemas.length > 0) {
        schemaContext = '\n\n## Table Schemas Referenced in Query\n';
        for (const schema of tableSchemas) {
            schemaContext += `\n### Table: ${schema.schemaName}.${schema.tableName}\n`;
            schemaContext += '**Columns:**\n';
            schemaContext += '| Column | Type | Nullable | Default | PK | FK | References |\n';
            schemaContext += '|--------|------|----------|---------|----|----|------------|\n';
            for (const col of schema.columns) {
                schemaContext += `| ${col.name} | ${col.dataType} | ${col.isNullable ? 'YES' : 'NO'} | ${col.defaultValue || '-'} | ${col.isPrimaryKey ? '✓' : ''} | ${col.isForeignKey ? '✓' : ''} | ${col.references || '-'} |\n`;
            }

            if (schema.indexes.length > 0) {
                schemaContext += '\n**Indexes:**\n';
                for (const idx of schema.indexes) {
                    const columnsStr = Array.isArray(idx.columns) ? idx.columns.join(', ') : String(idx.columns || '');
                    schemaContext += `- ${idx.name}: (${columnsStr}) ${idx.isUnique ? '[UNIQUE]' : ''} ${idx.isPrimary ? '[PRIMARY]' : ''}\n`;
                }
            }

            if (schema.constraints.length > 0) {
                schemaContext += '\n**Constraints:**\n';
                for (const con of schema.constraints) {
                    schemaContext += `- ${con.name} (${con.type}): ${con.definition}\n`;
                }
            }
        }
    }

    // Build previous cells context
    let previousContext = '';
    if (previousCells.length > 0) {
        previousContext = '\n\n## Previous Queries in Notebook (for context)\n```sql\n';
        previousContext += previousCells.slice(-3).join('\n\n-- Next query --\n');
        previousContext += '\n```';
    }

    // Build output context
    let outputContext = '';
    if (lastOutput) {
        outputContext = `\n\n## Last Execution Output\n\`\`\`\n${lastOutput}\n\`\`\``;
    }

    // Build database context
    let dbContext = '';
    if (databaseInfo) {
        dbContext = `\n\n## Database: ${databaseInfo.name}`;
    }

    return `# PostgreSQL Query Assistant

You are an expert PostgreSQL database developer and query optimizer. Your task is to help modify, optimize, or explain SQL queries based on the user's instructions.

## Important Guidelines

1. **Output Format**: Return ONLY the modified SQL query. Do not use markdown code fences (\`\`\`sql).
2. **Comments**: If you need to explain something, use SQL comments (-- or /* */).
3. **Preserve Intent**: Maintain the original query's purpose while applying the requested changes.
4. **Best Practices**: Follow PostgreSQL best practices for:
   - Proper quoting of identifiers when necessary
   - Efficient JOIN ordering
   - Appropriate use of indexes (check the schema info provided)
   - Avoiding SQL injection vulnerabilities (use parameterized queries when showing examples)
   - Proper NULL handling
   - Using appropriate data types
5. **Error Prevention**: If the original query has potential issues, fix them while applying the user's request.
6. **Schema Awareness**: Use the provided table schema information to:
   - Reference correct column names and types
   - Leverage existing indexes for better performance
   - Respect foreign key relationships
   - Understand nullability constraints

## Placement Decision

At the very first line of your response, you MUST include a placement instruction to indicate whether the result should replace the original query or be added as a new cell for comparison:

- Use \`[PLACEMENT: replace]\` when:
  - Fixing syntax errors or bugs in the original query
  - Formatting or beautifying the query
  - Making minor modifications that improve the original
  - The user explicitly asks to "fix", "correct", or "format" the query

- Use \`[PLACEMENT: new_cell]\` when:
  - Creating a significantly different version of the query
  - Adding EXPLAIN ANALYZE or debugging versions
  - Generating INSERT/UPDATE/DELETE from a SELECT
  - Converting to a completely different structure (CTE, subquery, etc.)
  - The user might want to compare both versions
  - Adding explanatory comments that substantially change the query length
  - Creating alternative approaches to solve the same problem
${dbContext}${schemaContext}${previousContext}${outputContext}

## Current Query to Modify
\`\`\`sql
${currentQuery}
\`\`\`

## User Request
${userInput}

## Your Response
First line MUST be the placement instruction (e.g., [PLACEMENT: replace] or [PLACEMENT: new_cell]).
Then provide the SQL query. Remember: NO markdown formatting, just the raw SQL (you may include SQL comments for explanations).
`;
}

/**
 * AI Task Selector utility with comprehensive task options
 */
const AiTaskSelector = {
    /**
     * Available AI tasks organized by category
     */
    tasks: [
        // Custom & General
        { label: '$(edit) Custom Instruction', description: 'Enter your own instruction', detail: 'Provide specific instructions for the AI' },

        // Query Understanding
        { label: '$(comment-discussion) Explain Query', description: 'Add detailed comments explaining the query', detail: 'Adds inline comments explaining each clause and operation' },
        { label: '$(question) What Does This Do?', description: 'Get a summary comment at the top', detail: 'Adds a block comment summarizing the query purpose' },

        // Error Fixing & Debugging
        { label: '$(bug) Fix Syntax Errors', description: 'Correct syntax errors in the query', detail: 'Fixes missing keywords, brackets, quotes, and common mistakes' },
        { label: '$(warning) Fix Logic Issues', description: 'Identify and fix logical problems', detail: 'Fixes incorrect JOINs, wrong conditions, NULL handling issues' },
        { label: '$(error) Debug Query', description: 'Add debugging helpers', detail: 'Adds EXPLAIN, row counts, and intermediate result checks' },

        // Performance Optimization
        { label: '$(rocket) Optimize Performance', description: 'Improve query performance', detail: 'Rewrites for better execution plan using indexes and efficient patterns' },
        { label: '$(dashboard) Add EXPLAIN ANALYZE', description: 'Wrap with execution analysis', detail: 'Prepends EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) for profiling' },
        { label: '$(telescope) Suggest Indexes', description: 'Recommend indexes for this query', detail: 'Adds comments suggesting CREATE INDEX statements' },

        // Formatting & Style
        { label: '$(list-flat) Format Query', description: 'Beautify and standardize formatting', detail: 'Applies consistent indentation, casing, and line breaks' },
        { label: '$(symbol-keyword) Uppercase Keywords', description: 'Convert keywords to uppercase', detail: 'Makes SELECT, FROM, WHERE, etc. uppercase for readability' },
        { label: '$(primitive-square) Add Aliases', description: 'Add meaningful table aliases', detail: 'Adds descriptive aliases to tables and subqueries' },

        // Query Modification
        { label: '$(add) Add WHERE Clause', description: 'Add filtering conditions', detail: 'Prompts for conditions to filter results' },
        { label: '$(filter) Add Pagination', description: 'Add LIMIT and OFFSET', detail: 'Adds pagination with sensible defaults' },
        { label: '$(sort-precedence) Add ORDER BY', description: 'Add sorting to results', detail: 'Adds ORDER BY clause with appropriate columns' },
        { label: '$(group-by-ref-type) Add GROUP BY', description: 'Add aggregation', detail: 'Transforms query to use GROUP BY with aggregates' },

        // Query Transformation
        { label: '$(file-submodule) Convert to CTE', description: 'Refactor using WITH clause', detail: 'Extracts subqueries into Common Table Expressions' },
        { label: '$(symbol-interface) Convert to Subquery', description: 'Use subqueries instead of JOINs', detail: 'Transforms JOINs to correlated or uncorrelated subqueries' },
        { label: '$(references) Add JOINs', description: 'Join with related tables', detail: 'Adds appropriate JOINs based on foreign keys' },

        // Security & Safety
        { label: '$(shield) Add Safety Checks', description: 'Add guards against common issues', detail: 'Adds NULL checks, type casting, and boundary conditions' },
        { label: '$(lock) Parameterize Query', description: 'Convert to prepared statement', detail: 'Replaces literals with $1, $2 placeholders' },

        // Data Operations
        { label: '$(diff-insert) Generate INSERT', description: 'Create INSERT from SELECT', detail: 'Wraps SELECT as INSERT INTO ... SELECT' },
        { label: '$(diff-modified) Generate UPDATE', description: 'Create UPDATE statement', detail: 'Generates UPDATE with proper WHERE clause' },
        { label: '$(diff-removed) Generate DELETE', description: 'Create safe DELETE statement', detail: 'Generates DELETE with confirmation checks' },

        // Advanced
        { label: '$(beaker) Add Window Functions', description: 'Use window functions', detail: 'Adds ROW_NUMBER, RANK, LAG, LEAD, etc.' },
        { label: '$(combine) Create UNION Query', description: 'Combine with another query', detail: 'Structures query for UNION/INTERSECT/EXCEPT' },
        { label: '$(json) Handle JSON', description: 'Add JSON operators', detail: 'Uses ->, ->>, jsonb_* functions appropriately' }
    ],

    /**
     * Task instruction templates with detailed prompts
     */
    instructions: {
        'Custom Instruction': null, // Will prompt user

        'Explain Query': `Add comprehensive inline comments to this SQL query explaining:
- The overall purpose of the query
- What each SELECT column represents
- The reason for each JOIN and its relationship
- What each WHERE condition filters
- The purpose of GROUP BY, ORDER BY, and any other clauses
- Any complex expressions or subqueries
Keep the query functional while making it self-documenting.`,

        'What Does This Do?': `Add a detailed block comment at the top of the query that explains:
- What this query does in plain English
- What tables it reads from and why
- What the expected output represents
- Any important assumptions or limitations
Do not modify the query logic itself.`,

        'Fix Syntax Errors': `Fix any syntax errors in this SQL query including:
- Missing or extra commas, parentheses, quotes
- Incorrect keyword spelling or ordering
- Missing semicolons or statement terminators
- Incorrect string escaping
- Invalid identifier quoting
Ensure the query is valid PostgreSQL syntax.`,

        'Fix Logic Issues': `Identify and fix logical issues in this query:
- Incorrect JOIN conditions that could cause cartesian products
- WHERE conditions that might exclude intended rows
- NULL handling issues (use COALESCE, IS NULL, etc.)
- Incorrect aggregate function usage
- Off-by-one errors in date/number comparisons
Add comments explaining what was fixed and why.`,

        'Debug Query': `Modify this query to help with debugging:
- Add EXPLAIN ANALYZE at the start (commented out for easy toggle)
- Add intermediate CTEs to break down complex logic
- Add comments showing expected row counts at each step
- Include RAISE NOTICE statements if this is a function
- Add diagnostic SELECT statements that can be uncommented`,

        'Optimize Performance': `Optimize this query for better performance:
- Rewrite to use existing indexes effectively (check the schema info)
- Eliminate redundant subqueries or JOINs
- Use appropriate join types (consider LATERAL, EXISTS vs IN)
- Add query hints or settings if beneficial
- Consider materialized CTEs for repeated subqueries
- Optimize predicate pushdown
Add comments explaining the optimization rationale.`,

        'Add EXPLAIN ANALYZE': `Wrap this query with EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) to analyze its execution plan. Add a comment header explaining how to interpret the results.`,

        'Suggest Indexes': `Analyze this query and add comments suggesting:
- CREATE INDEX statements that would improve performance
- Which columns should be indexed and why
- Whether composite indexes would help
- Index type recommendations (B-tree, GIN, GiST, etc.)
Keep the original query unchanged, only add comments.`,

        'Format Query': `Format this SQL query with proper styling:
- Consistent indentation (2 or 4 spaces)
- Each clause (SELECT, FROM, WHERE, etc.) on its own line
- Align similar elements vertically where it improves readability
- Logical grouping of related columns and conditions
- Appropriate line breaks for long expressions
Use uppercase for SQL keywords.`,

        'Uppercase Keywords': `Convert all SQL keywords to uppercase while preserving:
- Original case for identifiers (table names, column names)
- Original case for string literals
- Original formatting and whitespace
Keywords include: SELECT, FROM, WHERE, JOIN, AND, OR, ON, AS, etc.`,

        'Add Aliases': `Add meaningful table aliases to this query:
- Use short but descriptive aliases (e.g., 'u' for users, 'o' for orders)
- Apply aliases consistently throughout the query
- Add column aliases for computed/derived columns
- Use AS keyword explicitly for clarity`,

        'Add WHERE Clause': `Add appropriate WHERE clause filtering based on:
- The table schemas and likely filter candidates
- Common filtering patterns for this type of query
- Add placeholder comments where user should specify values
Use parameterized placeholders ($1, $2) for values.`,

        'Add Pagination': `Add pagination to this query:
- Add LIMIT and OFFSET clauses
- Use reasonable defaults (LIMIT 50, OFFSET 0)
- Add comments explaining how to adjust for different pages
- Consider adding a total count CTE if useful
- Ensure ORDER BY is present for consistent pagination`,

        'Add ORDER BY': `Add an ORDER BY clause to this query:
- Choose appropriate columns based on the query context
- Use ASC/DESC based on likely user expectations
- Consider adding secondary sort columns for stability
- Add NULLS FIRST/LAST if NULL handling matters`,

        'Add GROUP BY': `Transform this query to use GROUP BY:
- Identify appropriate grouping columns
- Add aggregate functions (COUNT, SUM, AVG, etc.) for other columns
- Include HAVING clause if filtering on aggregates is useful
- Consider adding grouping sets or rollup if appropriate`,

        'Convert to CTE': `Refactor this query to use Common Table Expressions (WITH clause):
- Extract subqueries into named CTEs
- Break complex logic into readable steps
- Name CTEs descriptively
- Consider using RECURSIVE if applicable
- Maintain query correctness and performance`,

        'Convert to Subquery': `Rewrite this query using subqueries instead of JOINs where appropriate:
- Use correlated subqueries for existence checks
- Use scalar subqueries for single-value lookups
- Use derived tables where performance is better
Add comments explaining the tradeoffs.`,

        'Add JOINs': `Enhance this query by adding JOINs to related tables:
- Use the foreign key relationships from the schema
- Choose appropriate JOIN types (INNER, LEFT, etc.)
- Add useful columns from joined tables
- Ensure join conditions are correct`,

        'Add Safety Checks': `Add safety checks to this query:
- COALESCE for potentially NULL values
- Type casting to prevent type errors
- Bounds checking for numeric operations
- Empty string handling
- Date/timestamp validation
Add comments explaining each safety measure.`,

        'Parameterize Query': `Convert this query to use parameterized placeholders:
- Replace string literals with $1, $2, etc.
- Replace numeric literals that are likely user inputs
- Add a comment header listing parameters and their types
- Keep constant values as literals
Example: WHERE id = $1 AND status = $2`,

        'Generate INSERT': `Transform this SELECT query into an INSERT statement:
- Create INSERT INTO table_name (columns) SELECT ...
- Match column order correctly
- Add RETURNING clause if useful
- Consider ON CONFLICT handling
Add comments about the target table.`,

        'Generate UPDATE': `Generate an UPDATE statement based on this query:
- Create proper SET clauses
- Use appropriate WHERE conditions from the query
- Consider using FROM clause for complex updates
- Add RETURNING clause to see affected rows
Include safety comments about running updates.`,

        'Generate DELETE': `Generate a safe DELETE statement:
- Create proper WHERE clause to limit deletion
- Add a comment with SELECT to preview rows first
- Consider using RETURNING to see deleted rows
- Add transaction wrapper comments (BEGIN/ROLLBACK/COMMIT)
IMPORTANT: Include safety warnings.`,

        'Add Window Functions': `Enhance this query with window functions:
- Add ROW_NUMBER(), RANK(), or DENSE_RANK() for ordering
- Add LAG/LEAD for comparing with adjacent rows
- Add running totals with SUM() OVER
- Add moving averages if appropriate
- Use PARTITION BY for grouping within windows`,

        'Create UNION Query': `Structure this query for combining with other results:
- Format for UNION/UNION ALL
- Ensure column compatibility
- Add type casts if needed
- Add placeholder for the second query
- Include comments about UNION vs UNION ALL choice`,

        'Handle JSON': `Enhance this query with JSON/JSONB operations:
- Use appropriate operators (-> for object, ->> for text)
- Add jsonb_agg or json_agg for aggregation
- Use jsonb_build_object for constructing JSON
- Handle nested JSON access properly
- Add proper type casting from JSON values`
    },

    /**
     * Select and get instruction for AI task
     */
    async selectTask(): Promise<string | undefined> {
        const selection = await vscode.window.showQuickPick(this.tasks, {
            placeHolder: 'Select an AI task for your SQL query',
            ignoreFocusOut: true,
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!selection) {
            return undefined;
        }

        // Find matching instruction key by extracting label text (remove icon)
        const labelText = selection.label.replace(/^\$\([^)]+\)\s*/, '');
        const key = Object.keys(this.instructions).find(k => labelText === k);

        if (!key) {
            return undefined;
        }

        const instruction = this.instructions[key as keyof typeof AiTaskSelector.instructions];

        // If custom instruction, prompt user
        if (instruction === null) {
            const input = await vscode.window.showInputBox({
                placeHolder: 'Describe how you want to modify this query...',
                prompt: 'Enter detailed instructions for the AI (e.g., "Add a join with the orders table and filter by date range")',
                ignoreFocusOut: true
            });
            return input;
        }

        return instruction;
    }
};
