import * as vscode from 'vscode';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'postgresExplorer.chatView';

    private _view?: vscode.WebviewView;
    private _messages: { role: 'user' | 'assistant'; content: string }[] = [];

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this._handleUserMessage(data.message);
                    break;
                case 'clearChat':
                    this._messages = [];
                    this._updateChatHistory();
                    break;
            }
        });
    }

    private async _handleUserMessage(message: string) {
        // Add user message to history
        this._messages.push({ role: 'user', content: message });
        this._updateChatHistory();

        // TODO: Integrate with AI provider for actual responses
        // For now, show a placeholder response
        const response = `Thanks for your message! AI chat integration is coming soon. You said: "${message}"`;
        
        this._messages.push({ role: 'assistant', content: response });
        this._updateChatHistory();
    }

    private _updateChatHistory() {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateMessages',
                messages: this._messages
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PostgreSQL Chat</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            padding: 8px;
        }

        .chat-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 8px;
        }

        .chat-header h3 {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-sideBarSectionHeader-foreground);
        }

        .clear-btn {
            background: none;
            border: none;
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 3px;
        }

        .clear-btn:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }

        .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 8px 0;
        }

        .message {
            margin-bottom: 12px;
            padding: 8px 12px;
            border-radius: 8px;
            max-width: 90%;
            word-wrap: break-word;
        }

        .message.user {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            margin-left: auto;
            border-bottom-right-radius: 2px;
        }

        .message.assistant {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            margin-right: auto;
            border-bottom-left-radius: 2px;
        }

        .message-role {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            margin-bottom: 4px;
            opacity: 0.7;
        }

        .message-content {
            font-size: 13px;
            line-height: 1.4;
        }

        .input-container {
            display: flex;
            gap: 6px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .chat-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: 13px;
            outline: none;
            resize: none;
            min-height: 36px;
            max-height: 100px;
        }

        .chat-input:focus {
            border-color: var(--vscode-focusBorder);
        }

        .chat-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        .send-btn {
            padding: 8px 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .send-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 20px;
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        .empty-state-text {
            font-size: 13px;
            line-height: 1.5;
        }

        .empty-state-hint {
            font-size: 11px;
            margin-top: 8px;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h3>💬 SQL Assistant</h3>
            <button class="clear-btn" onclick="clearChat()">Clear</button>
        </div>
        
        <div class="messages-container" id="messagesContainer">
            <div class="empty-state" id="emptyState">
                <div class="empty-state-icon">🐘</div>
                <div class="empty-state-text">
                    Ask questions about your PostgreSQL database, get help with queries, or explore your data.
                </div>
                <div class="empty-state-hint">
                    Type a message below to get started
                </div>
            </div>
        </div>
        
        <div class="input-container">
            <textarea 
                class="chat-input" 
                id="chatInput" 
                placeholder="Ask about your database..."
                rows="1"
                onkeydown="handleKeyDown(event)"
            ></textarea>
            <button class="send-btn" id="sendBtn" onclick="sendMessage()">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1.5 1.5L14.5 8L1.5 14.5V9L10.5 8L1.5 7V1.5Z"/>
                </svg>
            </button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messagesContainer = document.getElementById('messagesContainer');
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');
        const emptyState = document.getElementById('emptyState');

        function sendMessage() {
            const message = chatInput.value.trim();
            if (!message) return;

            vscode.postMessage({
                type: 'sendMessage',
                message: message
            });

            chatInput.value = '';
            chatInput.style.height = 'auto';
        }

        function clearChat() {
            vscode.postMessage({
                type: 'clearChat'
            });
        }

        function handleKeyDown(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }

        // Auto-resize textarea
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'updateMessages':
                    renderMessages(message.messages);
                    break;
            }
        });

        function renderMessages(messages) {
            if (messages.length === 0) {
                emptyState.style.display = 'flex';
                // Remove only message elements, keep empty state
                const messageElements = messagesContainer.querySelectorAll('.message');
                messageElements.forEach(el => el.remove());
                return;
            }

            emptyState.style.display = 'none';
            
            // Clear existing messages
            const messageElements = messagesContainer.querySelectorAll('.message');
            messageElements.forEach(el => el.remove());

            // Render new messages
            messages.forEach(msg => {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + msg.role;
                
                const roleDiv = document.createElement('div');
                roleDiv.className = 'message-role';
                roleDiv.textContent = msg.role === 'user' ? 'You' : 'Assistant';
                
                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                contentDiv.textContent = msg.content;
                
                messageDiv.appendChild(roleDiv);
                messageDiv.appendChild(contentDiv);
                messagesContainer.appendChild(messageDiv);
            });

            // Scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    </script>
</body>
</html>`;
    }
}
