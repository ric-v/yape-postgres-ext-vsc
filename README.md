<div align="center">

# 🐘 PostgreSQL Explorer

### *Professional Database Management for VS Code*

[![Version](https://img.shields.io/visual-studio-marketplace/v/ric-v.postgres-explorer?style=for-the-badge&logo=visual-studio-code&logoColor=white&color=0066CC)](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/ric-v.postgres-explorer?style=for-the-badge&logo=visual-studio-code&logoColor=white&color=2ECC71)](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/ric-v.postgres-explorer?style=for-the-badge&logo=visual-studio-code&logoColor=white&color=F39C12)](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer)
[![Status](https://img.shields.io/badge/status-beta-blue?style=for-the-badge&logo=git&logoColor=white)](https://github.com/dev-asterix/yape)

A comprehensive PostgreSQL database management extension featuring interactive SQL notebooks, real-time monitoring dashboard, AI-powered assistance, and advanced database operations—all within VS Code.

[📖 **Documentation**](https://dev-asterix.github.io/yape/) • [🛒 **Marketplace**](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer) • [🤝 **Contributing**](#-contributing)

</div>

---

## 📸 Preview

![Dashboard](resources/screenshots/pg-exp-dash.png)

---

## ✨ Key Features

- 🔌 **Secure Connections** — VS Code SecretStorage encryption
- 📊 **Live Dashboard** — Real-time metrics & query monitoring
- 📓 **SQL Notebooks** — Interactive notebooks with AI assistance
- 🌳 **Database Explorer** — Browse tables, views, functions, types
- 🛠️ **Object Operations** — CRUD, scripts, VACUUM, ANALYZE, REINDEX
- 🤖 **AI-Powered** — GitHub Copilot, OpenAI, Anthropic, Gemini

---

## 🚀 Quick Start

```bash
# Install from VS Code
ext install ric-v.postgres-explorer

# Or via command line
code --install-extension ric-v.postgres-explorer
```

Then: **PostgreSQL icon** → **Add Connection** → Enter details → **Connect!**

---

## 🏗️ Project Structure

```
yape/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── commands/             # Command implementations
│   │   ├── tables.ts         # Table operations
│   │   ├── views.ts          # View operations
│   │   ├── functions.ts      # Function operations
│   │   ├── connection.ts     # Connection commands
│   │   ├── notebook.ts       # Notebook commands
│   │   └── ...
│   ├── providers/            # VS Code providers
│   │   ├── DatabaseTreeProvider.ts   # Tree view provider
│   │   ├── NotebookKernel.ts         # Notebook kernel
│   │   ├── ChatViewProvider.ts       # AI chat provider
│   │   ├── SqlCompletionProvider.ts  # IntelliSense
│   │   └── ...
│   ├── services/             # Business logic
│   │   ├── ConnectionManager.ts      # Connection handling
│   │   └── SecretStorageService.ts   # Credential storage
│   ├── dashboard/            # Dashboard webview
│   ├── common/               # Shared utilities
│   └── test/                 # Unit tests
├── resources/                # Icons & screenshots
├── docs/                     # Documentation & landing page
├── dist/                     # Compiled output (bundled)
├── out/                      # Compiled output (tsc)
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
└── webpack.config.js         # Webpack config
```

---

## 🛠️ Local Development

### Prerequisites

- **Node.js** ≥ 18.0.0
- **VS Code** ≥ 1.90.0
- **PostgreSQL** (for testing)

### Setup

```bash
# Clone the repository
git clone https://github.com/dev-asterix/yape.git
cd yape

# Install dependencies
npm install

# Compile TypeScript
npm run compile
```

### Development Commands

| Command | Description |
|---------|-------------|
| `npm run watch` | Watch mode (auto-recompile) |
| `npm run compile` | One-time TypeScript compilation |
| `npm run esbuild` | Bundle with esbuild (with sourcemaps) |
| `npm run esbuild-watch` | Bundle in watch mode |
| `npm run test` | Run unit tests |
| `npm run coverage` | Run tests with coverage |
| `npm run vscode:prepublish` | Build for production |

### Running the Extension

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. Or use **Run and Debug** (`Ctrl+Shift+D`) → "Run Extension"

### Debugging Tips

- **Output Panel**: `Ctrl+Shift+U` → Select "PostgreSQL Explorer"
- **DevTools**: `Ctrl+Shift+I` in Extension Development Host
- **Webview Debug**: Right-click in webview → "Inspect"

---

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run with coverage
npm run coverage
```

Tests are located in `src/test/unit/` using Mocha + Chai + Sinon.

---

## 🤝 Contributing

- 🐛 [Report Bugs](https://github.com/dev-asterix/yape/issues/new?template=bug_report.md)
- 💡 [Request Features](https://github.com/dev-asterix/yape/issues/new?template=feature_request.md)
- 🔧 Fork → Branch → PR

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: resolve bug
docs: update documentation
refactor: code restructuring
test: add/update tests
chore: maintenance tasks
```

---

## 📦 Building & Publishing

```bash
# Build VSIX package
npx vsce package

# Publish to VS Code Marketplace
npx vsce publish

# Publish to Open VSX
npx ovsx publish
```

---

## 📝 License

[MIT License](LICENSE)

---

<div align="center">

**Made with ❤️ for the PostgreSQL Community**

[![Made with TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![VS Code](https://img.shields.io/badge/VS%20Code-007ACC?style=flat-square&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)

Also on [Open VSX](https://open-vsx.org/extension/ric-v/postgres-explorer)

</div>
