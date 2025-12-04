import moduleAlias from 'module-alias';
import path from 'path';

moduleAlias.addAlias('vscode', path.join(__dirname, 'unit/mocks/vscode.ts'));
