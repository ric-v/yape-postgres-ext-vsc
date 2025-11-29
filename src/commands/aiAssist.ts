import * as vscode from 'vscode';
import * as https from 'https';

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

    const tasks = [
        { label: '$(edit) Custom Instruction', description: 'Enter your own instruction', detail: 'Default' },
        { label: '$(info) Explain Query', description: 'Add comments explaining the query' },
        { label: '$(bug) Fix Syntax', description: 'Correct syntax errors' },
        { label: '$(rocket) Optimize Query', description: 'Improve performance' },
        { label: '$(list-flat) Format Query', description: 'Beautify SQL' }
    ];

    const selection = await vscode.window.showQuickPick(tasks, {
        placeHolder: 'Select an AI task',
        ignoreFocusOut: true
    });

    if (!selection) {
        return;
    }

    let userInput = '';

    if (selection.label.includes('Custom Instruction')) {
        const input = await vscode.window.showInputBox({
            placeHolder: 'How should I modify this query?',
            prompt: 'Enter instructions for the AI'
        });
        if (!input) return;
        userInput = input;
    } else if (selection.label.includes('Explain Query')) {
        userInput = 'Explain what this SQL query does in simple terms. Add comments to the code explaining each part.';
    } else if (selection.label.includes('Fix Syntax')) {
        userInput = 'Fix any syntax errors in this SQL query. Ensure it is valid PostgreSQL.';
    } else if (selection.label.includes('Optimize Query')) {
        userInput = 'Optimize this SQL query for better performance. Use best practices.';
    } else if (selection.label.includes('Format Query')) {
        userInput = 'Format this SQL query to be more readable. Use standard indentation and capitalization.';
    }

    try {
        const config = vscode.workspace.getConfiguration('postgresExplorer');
        const provider = config.get<string>('aiProvider') || 'vscode-lm';

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "AI is thinking...",
            cancellable: true
        }, async (progress, token) => {

            let responseText = '';

            if (provider === 'vscode-lm') {
                responseText = await callVsCodeLm(userInput, validCell, token);
            } else {
                responseText = await callDirectApi(provider, userInput, validCell, config, outputChannel);
            }

            // Clean up response if it contains markdown code blocks despite instructions
            responseText = responseText.replace(/^```sql\n/, '').replace(/^```\n/, '').replace(/\n```$/, '');

            if (responseText.trim()) {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    validCell.document.uri,
                    new vscode.Range(0, 0, validCell.document.lineCount, 0),
                    responseText
                );
                await vscode.workspace.applyEdit(edit);
            }
        });

    } catch (error) {
        console.error('AI Assist Error:', error);
        const message = error instanceof Error ? error.message : String(error);
        const selection = await vscode.window.showErrorMessage(`AI Assist failed: ${message}`, 'Configure Settings');
        if (selection === 'Configure Settings') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'postgresExplorer.ai');
        }
    }
}

async function callVsCodeLm(userInput: string, cell: vscode.NotebookCell, token: vscode.CancellationToken): Promise<string> {
    // Select a model - prefer GPT-4 class models
    const models = await vscode.lm.selectChatModels({ family: 'gpt-4' });
    let model = models[0];

    if (!model) {
        // Fallback to any available model
        const allModels = await vscode.lm.selectChatModels({});
        model = allModels[0];
    }

    if (!model) {
        throw new Error('No AI models available via VS Code API. Please ensure GitHub Copilot Chat is installed or switch provider.');
    }

    const messages = [
        vscode.LanguageModelChatMessage.User(buildPrompt(userInput, cell.document.getText()))
    ];

    const chatRequest = await model.sendRequest(messages, {}, token);
    let responseText = '';

    for await (const fragment of chatRequest.text) {
        responseText += fragment;
    }
    return responseText;
}

async function callDirectApi(provider: string, userInput: string, cell: vscode.NotebookCell, config: vscode.WorkspaceConfiguration, outputChannel: vscode.OutputChannel): Promise<string> {
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

    if (provider === 'openai') {
        endpoint = 'https://api.openai.com/v1/chat/completions';
        model = model || 'gpt-4';
        body = {
            model: model,
            messages: [{ role: 'user', content: buildPrompt(userInput, cell.document.getText()) }],
            temperature: 0.1
        };
    } else if (provider === 'anthropic') {
        endpoint = 'https://api.anthropic.com/v1/messages';
        model = model || 'claude-3-opus-20240229';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        delete headers['Authorization']; // Anthropic uses x-api-key
        body = {
            model: model,
            messages: [{ role: 'user', content: buildPrompt(userInput, cell.document.getText()) }],
            max_tokens: 4096
        };
    } else if (provider === 'gemini') {
        model = model || 'gemini-2.0-flash';
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        outputChannel.appendLine(`Using Gemini endpoint: ${endpoint}`);
        headers['X-goog-api-key'] = apiKey;
        delete headers['Authorization'];
        body = {
            contents: [{
                parts: [{ text: buildPrompt(userInput, cell.document.getText()) }]
            }]
        };
    } else if (provider === 'custom') {
        endpoint = config.get<string>('aiEndpoint') || '';
        if (!endpoint) throw new Error('Endpoint is required for custom provider');
        model = model || 'gpt-3.5-turbo'; // Default fallback
        body = {
            model: model,
            messages: [{ role: 'user', content: buildPrompt(userInput, cell.document.getText()) }]
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

function buildPrompt(userInput: string, currentQuery: string): string {
    return `
You are a PostgreSQL expert. Your task is to modify the following SQL query based on the user's instructions.
Return ONLY the modified SQL query. Do not include markdown formatting (like \`\`\`sql), explanations, or any other text should be given in comments of sql query.

Current Query:
${currentQuery}

User Instructions:
${userInput}
`;
}
