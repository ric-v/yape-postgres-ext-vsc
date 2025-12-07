import * as vscode from 'vscode';
import * as https from 'https';
import { getChatViewProvider } from './extension';

export interface AiSettings {
    provider: string;
    apiKey?: string;
    model?: string;
    endpoint?: string;
}

export class AiSettingsPanel {
    public static currentPanel: AiSettingsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        private readonly _extensionContext: vscode.ExtensionContext
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._initialize();

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'saveSettings':
                        try {
                            const settings = message.settings;
                            const config = vscode.workspace.getConfiguration('postgresExplorer');
                            
                            await config.update('aiProvider', settings.provider, vscode.ConfigurationTarget.Global);
                            await config.update('aiModel', settings.model || '', vscode.ConfigurationTarget.Global);
                            await config.update('aiEndpoint', settings.endpoint || '', vscode.ConfigurationTarget.Global);
                            
                            // Store API key in secret storage
                            if (settings.apiKey) {
                                await this._extensionContext.secrets.store('postgresExplorer.aiApiKey', settings.apiKey);
                            } else {
                                await this._extensionContext.secrets.delete('postgresExplorer.aiApiKey');
                            }
                            
                            this._panel.webview.postMessage({
                                type: 'saveSuccess'
                            });
                            
                            // Notify chat view to refresh model info
                            const chatViewProvider = getChatViewProvider();
                            if (chatViewProvider) {
                                chatViewProvider.refreshModelInfo();
                            }
                            
                            vscode.window.showInformationMessage('AI settings saved successfully!');
                        } catch (err: any) {
                            this._panel.webview.postMessage({
                                type: 'saveError',
                                error: err.message
                            });
                        }
                        break;

                    case 'testConnection':
                        try {
                            const settings = message.settings;
                            let testResult = '';
                            
                            if (settings.provider === 'vscode-lm') {
                                // Test VS Code LM
                                let models: vscode.LanguageModelChat[];
                                
                                if (settings.model) {
                                    // Extract base name if format is "name (family)"
                                    const baseName = settings.model.replace(/\s*\(.*\)$/, '').trim();
                                    
                                    // Try to find the specific configured model
                                    const allModels = await vscode.lm.selectChatModels({});
                                    const matchingModels = allModels.filter(m => 
                                        m.id === baseName || 
                                        m.name === baseName || 
                                        m.family === baseName ||
                                        m.id === settings.model || 
                                        m.name === settings.model || 
                                        m.family === settings.model
                                    );
                                    
                                    if (matchingModels.length > 0) {
                                        models = matchingModels;
                                        testResult = `VS Code Language Model available: ${models[0].name || models[0].id}`;
                                    } else {
                                        testResult = `Configured model "${settings.model}" not found. Available models: ${allModels.map(m => m.name || m.id).join(', ')}`;
                                    }
                                } else {
                                    // No specific model configured, check for any available models
                                    models = await vscode.lm.selectChatModels({});
                                    if (models.length > 0) {
                                        testResult = `VS Code Language Model available. Found ${models.length} model(s): ${models.slice(0, 3).map(m => m.name || m.id).join(', ')}${models.length > 3 ? '...' : ''}`;
                                    } else {
                                        throw new Error('No VS Code Language Models available. Please install GitHub Copilot or other LM extension.');
                                    }
                                }
                            } else if (settings.provider === 'openai') {
                                // Test OpenAI connection
                                if (!settings.apiKey) {
                                    throw new Error('API Key is required for OpenAI');
                                }
                                testResult = await this._testOpenAI(settings.apiKey, settings.model || 'gpt-4');
                            } else if (settings.provider === 'anthropic') {
                                // Test Anthropic connection
                                if (!settings.apiKey) {
                                    throw new Error('API Key is required for Anthropic');
                                }
                                testResult = await this._testAnthropic(settings.apiKey, settings.model || 'claude-3-5-sonnet-20241022');
                            } else if (settings.provider === 'gemini') {
                                // Test Gemini connection
                                if (!settings.apiKey) {
                                    throw new Error('API Key is required for Gemini');
                                }
                                testResult = await this._testGemini(settings.apiKey, settings.model || 'gemini-pro');
                            } else if (settings.provider === 'custom') {
                                // Test custom endpoint
                                if (!settings.endpoint) {
                                    throw new Error('Endpoint is required for custom provider');
                                }
                                testResult = 'Custom endpoint configured. Ensure it supports OpenAI-compatible API.';
                            }
                            
                            this._panel.webview.postMessage({
                                type: 'testSuccess',
                                result: testResult
                            });
                        } catch (err: any) {
                            this._panel.webview.postMessage({
                                type: 'testError',
                                error: err.message
                            });
                        }
                        break;

                    case 'loadSettings':
                        try {
                            const config = vscode.workspace.getConfiguration('postgresExplorer');
                            const apiKey = await this._extensionContext.secrets.get('postgresExplorer.aiApiKey');
                            
                            this._panel.webview.postMessage({
                                type: 'settingsLoaded',
                                settings: {
                                    provider: config.get('aiProvider', 'vscode-lm'),
                                    apiKey: apiKey || '',
                                    model: config.get('aiModel', ''),
                                    endpoint: config.get('aiEndpoint', '')
                                }
                            });
                        } catch (err: any) {
                            console.error('Failed to load settings:', err);
                        }
                        break;

                    case 'listModels':
                        try {
                            const settings = message.settings;
                            let models: string[] = [];
                            
                            if (settings.provider === 'vscode-lm') {
                                const availableModels = await vscode.lm.selectChatModels();
                                models = availableModels.map(m => {
                                    // Show model name with family info if available
                                    const name = m.name || m.id;
                                    const family = m.family;
                                    return family && family !== name ? `${name} (${family})` : name;
                                });
                            } else if (settings.provider === 'openai') {
                                if (!settings.apiKey) {
                                    throw new Error('API Key is required to list models');
                                }
                                models = await this._listOpenAIModels(settings.apiKey);
                            } else if (settings.provider === 'anthropic') {
                                // Anthropic doesn't have a public models API, use known models
                                models = [
                                    'claude-3-5-sonnet-20241022',
                                    'claude-3-5-haiku-20241022',
                                    'claude-3-opus-20240229',
                                    'claude-3-sonnet-20240229',
                                    'claude-3-haiku-20240307'
                                ];
                            } else if (settings.provider === 'gemini') {
                                if (!settings.apiKey) {
                                    throw new Error('API Key is required to list models');
                                }
                                models = await this._listGeminiModels(settings.apiKey);
                            } else if (settings.provider === 'custom') {
                                // Try to list models from custom endpoint using OpenAI-compatible API
                                if (settings.endpoint && settings.apiKey) {
                                    models = await this._listCustomModels(settings.endpoint, settings.apiKey);
                                } else {
                                    models = ['custom-model'];
                                }
                            }
                            
                            this._panel.webview.postMessage({
                                type: 'modelsListed',
                                models: models
                            });
                        } catch (err: any) {
                            this._panel.webview.postMessage({
                                type: 'modelsListError',
                                error: err.message
                            });
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _listOpenAIModels(apiKey: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.openai.com',
                path: '/v1/models',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            };

            const req = https.request(options, (res: any) => {
                let body = '';
                res.on('data', (chunk: any) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const data = JSON.parse(body);
                            // Filter for chat models only (gpt-*)
                            const chatModels = data.data
                                .filter((m: any) => m.id.startsWith('gpt-'))
                                .map((m: any) => m.id)
                                .sort()
                                .reverse(); // Show newer models first
                            resolve(chatModels);
                        } catch (e) {
                            reject(new Error('Failed to parse models response'));
                        }
                    } else {
                        reject(new Error(`Failed to list models: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', (err: any) => reject(err));
            req.end();
        });
    }

    private async _listGeminiModels(apiKey: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'generativelanguage.googleapis.com',
                path: `/v1beta/models?key=${apiKey}`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res: any) => {
                let body = '';
                res.on('data', (chunk: any) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const data = JSON.parse(body);
                            // Filter for generateContent capable models
                            const models = data.models
                                .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
                                .map((m: any) => m.name.replace('models/', ''))
                                .sort();
                            resolve(models);
                        } catch (e) {
                            reject(new Error('Failed to parse models response'));
                        }
                    } else {
                        reject(new Error(`Failed to list models: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', (err: any) => reject(err));
            req.end();
        });
    }

    private async _listCustomModels(endpoint: string, apiKey: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            try {
                const url = new URL(endpoint);
                // Try OpenAI-compatible /v1/models endpoint
                const modelsPath = url.pathname.replace(/\/chat\/completions$/, '') + '/models';
                
                const options = {
                    hostname: url.hostname,
                    port: url.port || (url.protocol === 'https:' ? 443 : 80),
                    path: modelsPath,
                    method: 'GET',
                    headers: apiKey ? {
                        'Authorization': `Bearer ${apiKey}`
                    } : {}
                };

                const protocol = url.protocol === 'https:' ? https : require('http');
                const req = protocol.request(options, (res: any) => {
                    let body = '';
                    res.on('data', (chunk: any) => body += chunk);
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            try {
                                const data = JSON.parse(body);
                                const models = data.data?.map((m: any) => m.id) || [];
                                resolve(models);
                            } catch (e) {
                                resolve(['custom-model']); // Fallback
                            }
                        } else {
                            resolve(['custom-model']); // Fallback
                        }
                    });
                });

                req.on('error', () => resolve(['custom-model'])); // Fallback on error
                req.end();
            } catch (e) {
                resolve(['custom-model']); // Fallback
            }
        });
    }

    private async _testOpenAI(apiKey: string, model: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 10
            });

            const options = {
                hostname: 'api.openai.com',
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(`OpenAI connection successful! Model: ${model}`);
                    } else {
                        reject(new Error(`OpenAI API error: ${res.statusCode} - ${body}`));
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.write(data);
            req.end();
        });
    }

    private async _testAnthropic(apiKey: string, model: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 10
            });

            const options = {
                hostname: 'api.anthropic.com',
                path: '/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(`Anthropic connection successful! Model: ${model}`);
                    } else {
                        reject(new Error(`Anthropic API error: ${res.statusCode} - ${body}`));
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.write(data);
            req.end();
        });
    }

    private async _testGemini(apiKey: string, model: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({
                contents: [{ parts: [{ text: 'Hello' }] }]
            });

            const options = {
                hostname: 'generativelanguage.googleapis.com',
                path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(`Gemini connection successful! Model: ${model}`);
                    } else {
                        reject(new Error(`Gemini API error: ${res.statusCode} - ${body}`));
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.write(data);
            req.end();
        });
    }

    public static show(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        const column = vscode.ViewColumn.One;

        if (AiSettingsPanel.currentPanel) {
            AiSettingsPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'aiSettings',
            'AI Settings',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        AiSettingsPanel.currentPanel = new AiSettingsPanel(panel, extensionUri, context);
    }

    private _initialize() {
        this._panel.webview.html = this._getHtmlContent();
    }

    private _getHtmlContent(): string {
        const nonce = this._getNonce();
        const logoUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'postgres-vsc-icon.png')
        );

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this._panel.webview.cspSource} https:; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <title>AI Settings</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                :root {
                    --bg-color: var(--vscode-editor-background);
                    --text-color: var(--vscode-editor-foreground);
                    --secondary-text: var(--vscode-descriptionForeground);
                    --card-bg: var(--vscode-editor-background);
                    --border-color: var(--vscode-widget-border);
                    --accent-color: var(--vscode-textLink-foreground);
                    --hover-bg: var(--vscode-list-hoverBackground);
                    --danger-color: var(--vscode-errorForeground);
                    --success-color: var(--vscode-testing-iconPassed);
                    --warning-color: var(--vscode-editorWarning-foreground);
                    --font-family: var(--vscode-font-family);
                    --shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
                    --shadow-hover: 0 8px 24px rgba(0, 0, 0, 0.08);
                    --card-radius: 12px;
                    --card-border: 1px solid var(--border-color);
                    --input-bg: var(--vscode-input-background);
                    --input-fg: var(--vscode-input-foreground);
                    --input-border: var(--vscode-input-border);
                    --button-bg: var(--vscode-button-background);
                    --button-fg: var(--vscode-button-foreground);
                    --button-hover: var(--vscode-button-hoverBackground);
                    --button-secondary-bg: var(--vscode-button-secondaryBackground);
                    --button-secondary-fg: var(--vscode-button-secondaryForeground);
                    --button-secondary-hover: var(--vscode-button-secondaryHoverBackground);
                }

                body {
                    background-color: var(--bg-color);
                    color: var(--text-color);
                    font-family: var(--font-family);
                    padding: 32px 24px;
                    line-height: 1.6;
                    min-height: 100vh;
                }

                .container {
                    width: 100%;
                    max-width: 720px;
                    margin: 0 auto;
                    animation: fadeIn 0.3s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .header {
                    text-align: center;
                    margin-bottom: 32px;
                }

                .header-icon {
                    width: 56px;
                    height: 56px;
                    margin: 0 auto 16px;
                    background: linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%);
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
                }

                .header-icon img {
                    width: 32px;
                    height: 32px;
                    filter: brightness(0) invert(1);
                }

                .header h1 {
                    font-size: 28px;
                    font-weight: 600;
                    letter-spacing: -0.5px;
                    margin-bottom: 8px;
                }

                .header p {
                    color: var(--secondary-text);
                    font-size: 14px;
                }

                .card {
                    background: var(--card-bg);
                    border: var(--card-border);
                    border-radius: var(--card-radius);
                    box-shadow: var(--shadow);
                    padding: 32px;
                    transition: box-shadow 0.3s ease;
                }

                .section-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 24px;
                    padding-bottom: 12px;
                    border-bottom: 2px solid var(--border-color);
                }

                .section-icon {
                    width: 28px;
                    height: 28px;
                    background: linear-gradient(135deg, var(--accent-color), var(--hover-bg));
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                }

                .section-title {
                    font-size: 15px;
                    font-weight: 600;
                    letter-spacing: -0.2px;
                    color: var(--text-color);
                }

                .form-group {
                    margin-bottom: 24px;
                }

                label {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    color: var(--text-color);
                }

                .required-indicator {
                    color: var(--danger-color);
                    font-size: 16px;
                    line-height: 1;
                }

                .label-hint {
                    display: block;
                    font-size: 12px;
                    color: var(--secondary-text);
                    font-weight: 400;
                    margin-top: 2px;
                }

                .label-description {
                    display: block;
                    margin-top: 4px;
                    font-size: 12px;
                    color: var(--secondary-text);
                    font-weight: 400;
                }

                input, select {
                    width: 100%;
                    padding: 10px 14px;
                    background: var(--input-bg);
                    color: var(--input-fg);
                    border: 1.5px solid var(--input-border);
                    border-radius: 6px;
                    font-family: var(--font-family);
                    font-size: 13px;
                    box-sizing: border-box;
                    transition: all 0.2s ease;
                }

                input:hover, select:hover {
                    border-color: var(--accent-color);
                }

                input:focus, select:focus {
                    outline: none;
                    border-color: var(--accent-color);
                    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15);
                }

                input::placeholder {
                    color: var(--secondary-text);
                    opacity: 0.6;
                }

                select {
                    cursor: pointer;
                }

                .info-box {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    margin-bottom: 24px;
                    border: 1.5px solid;
                }

                .info-box-icon {
                    font-size: 20px;
                    line-height: 1;
                }

                .info-box.info {
                    background: rgba(96, 165, 250, 0.1);
                    border-color: var(--accent-color);
                    color: var(--text-color);
                }

                .info-box.warning {
                    background: rgba(250, 204, 21, 0.1);
                    border-color: var(--warning-color);
                    color: var(--text-color);
                }

                .info-box strong {
                    display: block;
                    margin-bottom: 4px;
                    font-weight: 600;
                }

                .provider-details {
                    display: none;
                    margin-top: 24px;
                    padding: 24px;
                    background: rgba(96, 165, 250, 0.03);
                    border-radius: 8px;
                    border: 1.5px solid var(--border-color);
                }

                .provider-details.active {
                    display: block;
                    animation: fadeIn 0.3s ease;
                }

                .actions {
                    margin-top: 32px;
                    display: flex;
                    gap: 12px;
                    padding-top: 24px;
                    border-top: 1px solid var(--border-color);
                }

                button {
                    flex: 1;
                    padding: 11px 20px;
                    border: none;
                    border-radius: 7px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: var(--font-family);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }

                button:active:not(:disabled) {
                    transform: scale(0.98);
                }

                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none !important;
                }

                .btn-primary {
                    background: var(--button-bg);
                    color: var(--button-fg);
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
                }

                .btn-primary:hover:not(:disabled) {
                    background: var(--button-hover);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                }

                .btn-secondary {
                    background: var(--button-secondary-bg);
                    color: var(--button-secondary-fg);
                }

                .btn-secondary:hover:not(:disabled) {
                    background: var(--button-secondary-hover);
                    transform: translateY(-1px);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }

                .btn-icon {
                    font-size: 16px;
                    line-height: 1;
                }

                .message {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    margin-bottom: 24px;
                    display: none;
                    animation: slideDown 0.3s ease;
                }

                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .message-icon {
                    font-size: 18px;
                    line-height: 1;
                }

                .message.success {
                    background: rgba(34, 197, 94, 0.1);
                    border: 1.5px solid var(--success-color);
                    color: var(--success-color);
                }

                .message.error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1.5px solid var(--danger-color);
                    color: var(--danger-color);
                }

                .message.info {
                    background: rgba(96, 165, 250, 0.1);
                    border: 1.5px solid var(--accent-color);
                    color: var(--accent-color);
                }

                .hidden {
                    display: none !important;
                }

                .model-suggestions {
                    margin-top: 8px;
                    font-size: 12px;
                    color: var(--secondary-text);
                }

                .model-suggestions code {
                    background: rgba(128, 128, 128, 0.2);
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-family: 'Courier New', monospace;
                }

                .link {
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                }

                .link:hover {
                    text-decoration: underline;
                }

                .btn-link {
                    background: none;
                    border: none;
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                    cursor: pointer;
                    padding: 0;
                    font-size: 12px;
                    font-weight: 400;
                }

                .btn-link:hover {
                    text-decoration: underline;
                }

                .btn-link:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .model-input-group {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-icon">
                        <img src="${logoUri}" alt="AI">
                    </div>
                    <h1>AI Configuration</h1>
                    <p>Configure AI provider for query assistance and chat features</p>
                </div>

                <div class="card">
                    <div id="message" class="message"></div>

                    <form id="settingsForm">
                        <div class="section-header">
                            <div class="section-icon">🤖</div>
                            <div class="section-title">AI Provider Configuration</div>
                        </div>

                        <div class="info-box info">
                            <span class="info-box-icon">💡</span>
                            <div>
                                <strong>About AI Features</strong>
                                The AI assistant helps you write SQL queries, understand database concepts, and optimize your PostgreSQL workflows.
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="provider">
                                AI Provider
                                <span class="required-indicator">*</span>
                                <span class="label-description">Select which AI service to use</span>
                            </label>
                            <select id="provider" required>
                                <option value="vscode-lm">VS Code Language Model (GitHub Copilot)</option>
                                <option value="openai">OpenAI (GPT-4, GPT-3.5)</option>
                                <option value="anthropic">Anthropic (Claude)</option>
                                <option value="gemini">Google Gemini</option>
                                <option value="custom">Custom Endpoint (OpenAI-compatible)</option>
                            </select>
                        </div>

                        <!-- VS Code LM Details -->
                        <div id="provider-vscode-lm" class="provider-details active">
                            <div class="info-box info">
                                <span class="info-box-icon">ℹ️</span>
                                <div>
                                    <strong>VS Code Language Model</strong>
                                    Uses GitHub Copilot or other VS Code language model extensions. No API key required. Make sure you have a compatible LM extension installed.
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="model-vscode-lm">
                                    Model (Optional)
                                    <span class="label-description">
                                        <button type="button" class="btn-link list-models-btn" data-provider="vscode-lm">List available models</button>
                                    </span>
                                </label>
                                <select id="model-vscode-lm-select" class="hidden">
                                    <option value="">Select a model...</option>
                                </select>
                                <input type="text" id="model-vscode-lm" placeholder="Leave empty for default or select from list">
                            </div>
                        </div>

                        <!-- OpenAI Details -->
                        <div id="provider-openai" class="provider-details">
                            <div class="form-group">
                                <label for="apiKey-openai">
                                    OpenAI API Key
                                    <span class="required-indicator">*</span>
                                    <span class="label-description">Get your API key from <a href="https://platform.openai.com/api-keys" class="link" target="_blank">OpenAI Platform</a></span>
                                </label>
                                <input type="password" id="apiKey-openai" placeholder="sk-...">
                            </div>
                            <div class="form-group">
                                <label for="model-openai">
                                    Model
                                    <span class="label-description">
                                        <button type="button" class="btn-link list-models-btn" data-provider="openai">List available models</button>
                                    </span>
                                </label>
                                <select id="model-openai-select" class="hidden">
                                    <option value="">Select a model...</option>
                                </select>
                                <input type="text" id="model-openai" placeholder="gpt-4 (recommended)">
                            </div>
                        </div>

                        <!-- Anthropic Details -->
                        <div id="provider-anthropic" class="provider-details">
                            <div class="form-group">
                                <label for="apiKey-anthropic">
                                    Anthropic API Key
                                    <span class="required-indicator">*</span>
                                    <span class="label-description">Get your API key from <a href="https://console.anthropic.com/settings/keys" class="link" target="_blank">Anthropic Console</a></span>
                                </label>
                                <input type="password" id="apiKey-anthropic" placeholder="sk-ant-...">
                            </div>
                            <div class="form-group">
                                <label for="model-anthropic">
                                    Model
                                    <span class="label-description">
                                        <button type="button" class="btn-link list-models-btn" data-provider="anthropic">List available models</button>
                                    </span>
                                </label>
                                <select id="model-anthropic-select" class="hidden">
                                    <option value="">Select a model...</option>
                                </select>
                                <input type="text" id="model-anthropic" placeholder="claude-3-5-sonnet-20241022 (recommended)">
                            </div>
                        </div>

                        <!-- Gemini Details -->
                        <div id="provider-gemini" class="provider-details">
                            <div class="form-group">
                                <label for="apiKey-gemini">
                                    Google API Key
                                    <span class="required-indicator">*</span>
                                    <span class="label-description">Get your API key from <a href="https://makersuite.google.com/app/apikey" class="link" target="_blank">Google AI Studio</a></span>
                                </label>
                                <input type="password" id="apiKey-gemini" placeholder="AIza...">
                            </div>
                            <div class="form-group">
                                <label for="model-gemini">
                                    Model
                                    <span class="label-description">
                                        <button type="button" class="btn-link list-models-btn" data-provider="gemini">List available models</button>
                                    </span>
                                </label>
                                <select id="model-gemini-select" class="hidden">
                                    <option value="">Select a model...</option>
                                </select>
                                <input type="text" id="model-gemini" placeholder="gemini-pro">
                            </div>
                        </div>

                        <!-- Custom Endpoint Details -->
                        <div id="provider-custom" class="provider-details">
                            <div class="info-box warning">
                                <span class="info-box-icon">⚠️</span>
                                <div>
                                    <strong>Custom Endpoint</strong>
                                    Use this for self-hosted or alternative LLM providers that support OpenAI-compatible APIs (like LocalAI, LM Studio, Ollama with proxy, etc.)
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="endpoint-custom">
                                    API Endpoint
                                    <span class="required-indicator">*</span>
                                    <span class="label-description">Full URL to your custom API endpoint</span>
                                </label>
                                <input type="text" id="endpoint-custom" placeholder="http://localhost:8080/v1/chat/completions">
                            </div>
                            <div class="form-group">
                                <label for="apiKey-custom">
                                    API Key (Optional)
                                    <span class="label-description">Leave empty if not required</span>
                                </label>
                                <input type="password" id="apiKey-custom" placeholder="Optional">
                            </div>
                            <div class="form-group">
                                <label for="model-custom">
                                    Model Name
                                    <span class="label-description">Model identifier for your custom endpoint</span>
                                </label>
                                <input type="text" id="model-custom" placeholder="custom-model">
                            </div>
                        </div>

                        <div class="actions">
                            <button type="button" id="testBtn" class="btn-secondary">
                                <span class="btn-icon">⚡</span>
                                <span>Test Connection</span>
                            </button>
                            <button type="submit" id="saveBtn" class="btn-primary">
                                <span class="btn-icon">✓</span>
                                <span>Save Settings</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                const form = document.getElementById('settingsForm');
                const providerSelect = document.getElementById('provider');
                const testBtn = document.getElementById('testBtn');
                const saveBtn = document.getElementById('saveBtn');
                const messageDiv = document.getElementById('message');

                // Request to load current settings
                vscode.postMessage({ command: 'loadSettings' });

                // Provider change handler
                providerSelect.addEventListener('change', () => {
                    const provider = providerSelect.value;
                    document.querySelectorAll('.provider-details').forEach(el => {
                        el.classList.remove('active');
                    });
                    const detailsEl = document.getElementById('provider-' + provider);
                    if (detailsEl) {
                        detailsEl.classList.add('active');
                    }
                    hideMessage();
                    
                    // Auto-load models for the new provider
                    const formData = getFormData();
                    autoLoadModels(provider, formData.apiKey, formData.endpoint);
                });

                function showMessage(text, isError = false) {
                    const type = isError ? 'error' : 'success';
                    const icons = {
                        success: '✓',
                        error: '✗',
                        info: 'ℹ'
                    };
                    messageDiv.innerHTML = \`<span class="message-icon">\${icons[type]}</span><span>\${text}</span>\`;
                    messageDiv.className = 'message ' + type;
                    messageDiv.style.display = 'flex';
                }

                function hideMessage() {
                    messageDiv.style.display = 'none';
                }

                function autoLoadModels(provider, apiKey, endpoint) {
                    // Auto-load models for providers where it's possible
                    if (provider === 'vscode-lm') {
                        // Always load VS Code LM models
                        vscode.postMessage({
                            command: 'listModels',
                            settings: { provider: 'vscode-lm', apiKey: '', endpoint: '' }
                        });
                    } else if (provider === 'anthropic') {
                        // Anthropic has a fixed list, we can show it immediately
                        const anthropicModels = [
                            'claude-3-5-sonnet-20241022',
                            'claude-3-5-haiku-20241022',
                            'claude-3-opus-20240229',
                            'claude-3-sonnet-20240229',
                            'claude-3-haiku-20240307'
                        ];
                        handleModelsListed(anthropicModels);
                    } else if ((provider === 'openai' || provider === 'gemini') && apiKey) {
                        // Load models if API key is available
                        vscode.postMessage({
                            command: 'listModels',
                            settings: { provider: provider, apiKey: apiKey, endpoint: endpoint }
                        });
                    } else if (provider === 'custom' && endpoint) {
                        // Load models if endpoint is available
                        vscode.postMessage({
                            command: 'listModels',
                            settings: { provider: 'custom', apiKey: apiKey, endpoint: endpoint }
                        });
                    }
                }

                function getFormData() {
                    const provider = providerSelect.value;
                    let apiKey = '';
                    let model = '';
                    let endpoint = '';

                    if (provider === 'vscode-lm') {
                        const selectEl = document.getElementById('model-vscode-lm-select');
                        const inputEl = document.getElementById('model-vscode-lm');
                        model = (selectEl && !selectEl.classList.contains('hidden') && selectEl.value) 
                            ? selectEl.value 
                            : inputEl.value;
                    } else if (provider === 'openai') {
                        apiKey = document.getElementById('apiKey-openai').value;
                        const selectEl = document.getElementById('model-openai-select');
                        const inputEl = document.getElementById('model-openai');
                        model = (selectEl && !selectEl.classList.contains('hidden') && selectEl.value) 
                            ? selectEl.value 
                            : inputEl.value;
                    } else if (provider === 'anthropic') {
                        apiKey = document.getElementById('apiKey-anthropic').value;
                        const selectEl = document.getElementById('model-anthropic-select');
                        const inputEl = document.getElementById('model-anthropic');
                        model = (selectEl && !selectEl.classList.contains('hidden') && selectEl.value) 
                            ? selectEl.value 
                            : inputEl.value;
                    } else if (provider === 'gemini') {
                        apiKey = document.getElementById('apiKey-gemini').value;
                        const selectEl = document.getElementById('model-gemini-select');
                        const inputEl = document.getElementById('model-gemini');
                        model = (selectEl && !selectEl.classList.contains('hidden') && selectEl.value) 
                            ? selectEl.value 
                            : inputEl.value;
                    } else if (provider === 'custom') {
                        apiKey = document.getElementById('apiKey-custom').value;
                        model = document.getElementById('model-custom').value;
                        endpoint = document.getElementById('endpoint-custom').value;
                    }

                    return { provider, apiKey, model, endpoint };
                }

                function setFormData(settings) {
                    providerSelect.value = settings.provider || 'vscode-lm';
                    providerSelect.dispatchEvent(new Event('change'));

                    if (settings.provider === 'vscode-lm') {
                        document.getElementById('model-vscode-lm').value = settings.model || '';
                    } else if (settings.provider === 'openai') {
                        document.getElementById('apiKey-openai').value = settings.apiKey || '';
                        document.getElementById('model-openai').value = settings.model || '';
                    } else if (settings.provider === 'anthropic') {
                        document.getElementById('apiKey-anthropic').value = settings.apiKey || '';
                        document.getElementById('model-anthropic').value = settings.model || '';
                    } else if (settings.provider === 'gemini') {
                        document.getElementById('apiKey-gemini').value = settings.apiKey || '';
                        document.getElementById('model-gemini').value = settings.model || '';
                    } else if (settings.provider === 'custom') {
                        document.getElementById('apiKey-custom').value = settings.apiKey || '';
                        document.getElementById('model-custom').value = settings.model || '';
                        document.getElementById('endpoint-custom').value = settings.endpoint || '';
                    }
                }

                // Test button handler
                testBtn.addEventListener('click', () => {
                    hideMessage();
                    testBtn.disabled = true;
                    testBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Testing...</span>';
                    
                    vscode.postMessage({
                        command: 'testConnection',
                        settings: getFormData()
                    });
                });

                // Form submit handler
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    hideMessage();
                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Saving...</span>';
                    
                    vscode.postMessage({
                        command: 'saveSettings',
                        settings: getFormData()
                    });
                });

                // List models button handlers
                document.querySelectorAll('.list-models-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const provider = this.getAttribute('data-provider');
                        const settings = getFormData();
                        
                        if ((provider === 'openai' || provider === 'gemini') && !settings.apiKey) {
                            showMessage('Please enter an API key first', true);
                            return;
                        }
                        
                        // VS Code LM and Anthropic don't require API key check
                        if (provider === 'custom' && !settings.endpoint) {
                            showMessage('Please enter an endpoint first', true);
                            return;
                        }
                        
                        this.disabled = true;
                        this.textContent = 'Loading models...';
                        
                        vscode.postMessage({
                            command: 'listModels',
                            settings: { provider: provider, apiKey: settings.apiKey, endpoint: settings.endpoint }
                        });
                    });
                });

                // Model select change handlers
                ['vscode-lm', 'openai', 'anthropic', 'gemini'].forEach(provider => {
                    const selectEl = document.getElementById('model-' + provider + '-select');
                    const inputEl = document.getElementById('model-' + provider);
                    if (selectEl && inputEl) {
                        selectEl.addEventListener('change', function() {
                            if (this.value) {
                                inputEl.value = this.value;
                            }
                        });
                    }
                });

                // Auto-load models when API key is entered for OpenAI and Gemini
                ['openai', 'gemini'].forEach(provider => {
                    const apiKeyInput = document.getElementById('apiKey-' + provider);
                    if (apiKeyInput) {
                        apiKeyInput.addEventListener('blur', function() {
                            if (this.value && this.value.length > 10) {
                                autoLoadModels(provider, this.value, '');
                            }
                        });
                    }
                });

                // Auto-load models when custom endpoint is entered
                const customEndpoint = document.getElementById('endpoint-custom');
                if (customEndpoint) {
                    customEndpoint.addEventListener('blur', function() {
                        if (this.value) {
                            const apiKey = document.getElementById('apiKey-custom').value;
                            autoLoadModels('custom', apiKey, this.value);
                        }
                    });
                }

                // Message handler
                window.addEventListener('message', event => {
                    const message = event.data;
                    testBtn.disabled = false;
                    testBtn.innerHTML = '<span class="btn-icon">⚡</span><span>Test Connection</span>';
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<span class="btn-icon">✓</span><span>Save Settings</span>';

                    // Reset list models buttons
                    document.querySelectorAll('.list-models-btn').forEach(btn => {
                        btn.disabled = false;
                        btn.textContent = 'List available models';
                    });

                    switch (message.type) {
                        case 'testSuccess':
                            showMessage('✓ ' + message.result);
                            break;
                        case 'testError':
                            showMessage('✗ ' + message.error, true);
                            break;
                        case 'saveSuccess':
                            showMessage('✓ Settings saved successfully!');
                            break;
                        case 'saveError':
                            showMessage('✗ Failed to save: ' + message.error, true);
                            break;
                        case 'settingsLoaded':
                            setFormData(message.settings);
                            // Auto-load models for the current provider
                            const settings = message.settings;
                            if (settings && settings.provider) {
                                autoLoadModels(settings.provider, settings.apiKey || '', settings.endpoint || '');
                            }
                            break;
                        case 'modelsListed':
                            handleModelsListed(message.models);
                            showMessage('✓ Found ' + message.models.length + ' model(s)');
                            break;
                        case 'modelsListError':
                            showMessage('✗ Failed to list models: ' + message.error, true);
                            break;
                    }
                });

                function handleModelsListed(models) {
                    const provider = providerSelect.value;
                    const selectEl = document.getElementById('model-' + provider + '-select');
                    const inputEl = document.getElementById('model-' + provider);
                    
                    if (selectEl && models.length > 0) {
                        // Populate dropdown
                        selectEl.innerHTML = '<option value="">Select a model...</option>';
                        models.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model;
                            option.textContent = model;
                            selectEl.appendChild(option);
                        });
                        
                        // Show dropdown, hide input
                        selectEl.classList.remove('hidden');
                        inputEl.classList.add('hidden');
                        
                        // If there's a current value, select it
                        if (inputEl.value) {
                            selectEl.value = inputEl.value;
                        }
                    }
                }
            </script>
        </body>
        </html>`;
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private dispose() {
        AiSettingsPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
