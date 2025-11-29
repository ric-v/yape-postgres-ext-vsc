import * as vscode from 'vscode';

export class SecretStorageService {
    private static instance: SecretStorageService;
    private constructor(private readonly context: vscode.ExtensionContext) { }

    public static getInstance(context?: vscode.ExtensionContext): SecretStorageService {
        if (!SecretStorageService.instance) {
            if (!context) {
                throw new Error('SecretStorageService not initialized');
            }
            SecretStorageService.instance = new SecretStorageService(context);
        }
        return SecretStorageService.instance;
    }

    public async getPassword(connectionId: string): Promise<string | undefined> {
        return await this.context.secrets.get(`postgres-password-${connectionId}`);
    }

    public async setPassword(connectionId: string, password: string): Promise<void> {
        await this.context.secrets.store(`postgres-password-${connectionId}`, password);
    }

    public async deletePassword(connectionId: string): Promise<void> {
        await this.context.secrets.delete(`postgres-password-${connectionId}`);
    }
}
