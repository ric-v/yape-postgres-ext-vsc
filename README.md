# PostgreSQL Explorer for VS Code

A powerful Visual Studio Code extension for exploring and querying PostgreSQL databases with an integrated notebook experience.

## Features

- 🌳 **Database Explorer**: Tree view of databases, schemas, and tables
- 📝 **SQL Notebooks**: Interactive SQL notebooks with rich output
- 📊 **Table Properties**: Detailed view of table structure, constraints, and indexes
- 📥 **Export Capabilities**: Export query results to CSV and Excel formats
- 🔄 **Auto-refresh**: Real-time updates of database structure
- 🔒 **Secure**: Safe storage of connection credentials

### Interactive SQL Notebooks
- Execute SQL queries with rich output formatting
- Sort results by clicking on column headers
- Export results to CSV or Excel format
- View execution status and row counts

### Table Properties
- View detailed table structure
- See column definitions, data types, and constraints
- Examine indexes and their definitions
- Quick access to table statistics

## Installation

1. Download the VSIX file from the latest release
2. Install in VS Code:
   ```bash
   code --install-extension postgres-explorer-0.0.1.vsix
   ```
   Or install through VS Code:
   - Press `Ctrl+Shift+X` to open the Extensions view
   - Click the "..." menu
   - Select "Install from VSIX..."
   - Choose the downloaded VSIX file

## Usage

1. **Connect to Database**
   - Click the PostgreSQL icon in the Activity Bar
   - Click the "+" button to add a new connection
   - Enter connection details:
     - Host
     - Port
     - Username
     - Password
     - Database name

2. **Create SQL Notebook**
   - Right-click on a database, schema, or table
   - Select "New PostgreSQL Notebook"
   - Write and execute SQL queries

3. **View Table Properties**
   - Click on any table in the explorer
   - View detailed information about the table structure

4. **Export Results**
   - Execute a query in a notebook
   - Use the "Export CSV" or "Export Excel" buttons
   - Files will be saved in your workspace root

## Development Setup

1. **Prerequisites**
   ```bash
   node >= 16.x
   npm >= 8.x
   ```

2. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd postgres-explorer
   npm install
   ```

3. **Build**
   ```bash
   npm run compile
   ```

4. **Run/Debug**
   - Press F5 in VS Code to start debugging
   - A new VS Code window will open with the extension loaded
   - Make changes and press Ctrl+R (Cmd+R on macOS) in the debug window to reload

## Project Structure

```
postgres-explorer/
├── src/                    # Source code
│   ├── extension.ts        # Extension entry point
│   ├── notebookKernel.ts  # SQL notebook implementation
│   ├── tableProperties.ts  # Table properties panel
│   └── databaseTreeProvider.ts  # Database explorer tree view
├── package.json           # Extension manifest
└── tsconfig.json         # TypeScript configuration
```

## Contributing

1. Fork the repository
2. Create a feature branch
   ```bash
   git checkout -b feature/my-feature
   ```
3. Make your changes
4. Run tests and lint
   ```bash
   npm run test
   ```
5. Submit a pull request

### Coding Guidelines

- Follow TypeScript best practices
- Use meaningful variable and function names
- Add comments for complex logic
- Update documentation for new features
- Write tests for new functionality

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [VS Code Extension API](https://code.visualstudio.com/api)
- Uses [node-postgres](https://node-postgres.com/) for database connectivity
