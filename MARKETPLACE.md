<div align="center">

# 🐘 PostgreSQL Explorer

### *Professional Database Management for VS Code*

**A comprehensive PostgreSQL database management extension featuring interactive SQL notebooks, real-time monitoring dashboard, AI-powered assistance, and advanced database operations—all within VS Code.**

</div>

---

## 📸 Screenshots

### 📊 Real-Time Database Dashboard
![Dashboard](resources/screenshots/pg-exp-dash.png)
*Monitor connections, queries, and performance metrics in real-time*

### 🔗 Connection Management
![Connection Management](resources/screenshots/pg-exp-connection.png)
*Manage multiple database connections with an intuitive interface*

### 📓 Interactive SQL Notebooks
![SQL Notebooks](resources/screenshots/pg-exp-view.png)
*Write and execute queries with rich output formatting*

### 🛠️ Object Creation
![Object Creation](resources/screenshots/pg-exp-create.png)
*Create database objects with intelligent templates*

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🔌 **Secure Connections** | Manage multiple connections with VS Code SecretStorage encryption |
| 📊 **Live Dashboard** | Real-time metrics, active query monitoring, and performance graphs |
| 📓 **SQL Notebooks** | Interactive notebooks with rich output, AI assistance, and export options |
| 🌳 **Database Explorer** | Browse tables, views, functions, types, extensions, and roles |
| 🛠️ **Object Operations** | Full CRUD operations, scripts, VACUUM, ANALYZE, REINDEX |
| 🤖 **AI-Powered** | GitHub Copilot, OpenAI, Anthropic, and Google Gemini integration |
| ⌨️ **Developer Tools** | IntelliSense, keyboard shortcuts, PSQL terminal access |
| 📤 **Export Data** | Export query results to CSV, JSON, or Excel formats |

---

## 🎯 Why PostgreSQL Explorer?

<table>
<tr>
<td width="50%">

### 🎨 Modern Interface
- Beautiful, intuitive UI designed for developers
- Real-time dashboard with live metrics
- Context-aware operations
- Seamless VS Code integration

</td>
<td width="50%">

### ⚡ Powerful Features
- Interactive SQL notebooks
- 🤖 AI-powered Copilot & agentic support
- Advanced query management
- Complete CRUD operations

</td>
</tr>
<tr>
<td>

### 🔐 Secure & Reliable
- VS Code SecretStorage for credentials
- Safe connection management
- Transaction support
- Data integrity protection

</td>
<td>

### 🚀 Developer Friendly
- 🤖 GitHub Copilot integration
- Keyboard shortcuts
- IntelliSense support
- PSQL terminal integration

</td>
</tr>
</table>

---

## 🌳 Database Explorer

Navigate your database with an intuitive hierarchical tree view:

```
📁 Connection
└── 🗄️ Database
    └── 📂 Schema
        ├── 📊 Tables
        ├── 👁️ Views
        ├── 🔄 Materialized Views
        ├── ⚙️ Functions
        ├── 🏷️ Types
        ├── 🔗 Foreign Tables
        ├── 🧩 Extensions
        └── 👥 Roles
```

---

## 🤖 AI-Powered Assistance

Leverage AI to write, optimize, and debug your queries faster:

- **Smart Completions** — Context-aware SQL suggestions
- **Query Explanation** — Understand complex queries in plain English
- **Query Optimization** — Get performance improvement suggestions
- **Error Detection** — Real-time syntax and logical error detection
- **Natural Language to SQL** — Describe what you need, let AI write the SQL

**Supported AI Providers:**
- GitHub Copilot (VS Code LM)
- OpenAI
- Anthropic Claude
- Google Gemini
- Custom Endpoints

---

## 🚀 Quick Start

### Installation

1. Open VS Code → Press `Ctrl+Shift+X`
2. Search for **PostgreSQL Explorer**
3. Click **Install**

Or install via command line:
```bash
code --install-extension ric-v.postgres-explorer
```

### First Connection

1. Click the PostgreSQL icon in the Activity Bar
2. Click **Add Connection** or use `Ctrl+Shift+P` → `PostgreSQL: Add Connection`
3. Enter your connection details and click **Save**
4. Click on your connection to connect and start exploring!

---

## 📊 Complete Database Operations

| Object Type | Operations |
|-------------|------------|
| 📊 **Tables** | View, Edit, Insert, Update, Delete, Truncate, Drop, VACUUM, ANALYZE, REINDEX |
| 👁️ **Views** | View Definition, Edit, Query Data, Drop |
| 🔄 **Materialized Views** | Refresh, View Data, Edit, Drop |
| ⚙️ **Functions** | View, Edit, Call with Parameters, Drop |
| 🏷️ **Types** | View Properties, Edit, Drop |
| 🔗 **Foreign Tables** | View, Edit, Drop |
| 🧩 **Extensions** | Enable, Disable, Drop |
| 👥 **Roles** | Grant/Revoke Permissions, Edit, Drop |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Execute current cell |
| `Shift+Enter` | Execute and move to next |
| `F5` | Refresh current item |
| `Ctrl+Shift+P` | Command palette |

---

## 📚 Resources

- 📖 [Full Documentation](https://dev-asterix.github.io/yape/)
- 🐛 [Report Issues](https://github.com/dev-asterix/yape/issues)
- 💡 [Request Features](https://github.com/dev-asterix/yape/issues/new?template=feature_request.md)
- ⭐ [Star on GitHub](https://github.com/dev-asterix/yape)

---

## 📝 License

This extension is licensed under the [MIT License](https://github.com/dev-asterix/yape/blob/main/LICENSE).

---

<div align="center">

**Made with ❤️ for the PostgreSQL Community**

Also available on [Open VSX](https://open-vsx.org/extension/ric-v/postgres-explorer)

</div>
