# PostgreSQL Explorer for VS Code

[![Version](https://img.shields.io/visual-studio-marketplace/v/ric-v.postgres-explorer)](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/ric-v.postgres-explorer)](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/ric-v.postgres-explorer)](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer)

A powerful PostgreSQL database explorer with interactive SQL notebooks, table visualization, and data export capabilities.

## ✨ Key Features

### 🔌 Easy Database Connection
- Quick connection setup with secure credential storage
- Support for multiple database connections
- Auto-reconnect and connection health monitoring

### 📊 Interactive SQL Notebooks
- Write and execute SQL queries in notebook cells
- Rich table output with sorting capabilities
- Export results to CSV and Excel formats
- View execution status and row counts

### 🌳 Smart Database Explorer
- Tree view of databases, schemas, and tables
- Quick access to table properties and structure
- Real-time database structure updates
- Context-aware actions for each item

### 📋 Table Properties Panel
- Detailed view of table structure
- Column definitions and data types
- Primary keys and foreign key relationships
- Index information and constraints

## 🚀 Quick Start

### 1. Connect to Your Database

1. Click the PostgreSQL icon in the Activity Bar (or press `Ctrl+Shift+P` and search for "PostgreSQL: Add Connection")
2. Click the "+" button to add a new connection
3. Enter your connection details:
   ```
   Host: localhost (or your database host)
   Port: 5432 (default PostgreSQL port)
   Username: your_username
   Password: your_password
   Database: your_database
   ```
4. Save the connection

### 2. Explore Your Database

- Expand the connection in the tree view to see databases
- Navigate through schemas and tables
- Right-click items for context actions

### 3. Create SQL Notebooks

1. Right-click on any database, schema, or table
2. Select "New PostgreSQL Notebook"
3. Write SQL in notebook cells:
   ```sql
   -- Example query
   SELECT * FROM users
   WHERE created_at >= NOW() - INTERVAL '7 days'
   ORDER BY created_at DESC;
   ```
4. Press `Ctrl+Enter` to execute a cell

### 4. Work with Results

- Click column headers to sort results
- Use the export buttons to save data:
  - CSV: For spreadsheet applications
  - Excel: For Microsoft Excel

## 💡 Pro Tips

1. **Quick Table Info**
   - Click any table in the explorer to see its structure
   - Hover over columns to see data types and constraints

2. **Efficient Querying**
   - Use table names from the explorer (drag & drop supported)
   - Save commonly used queries in notebooks
   - Use multiple cells for complex operations

3. **Data Export**
   - Large result sets are automatically paginated
   - Exports preserve data types and formatting
   - Files are saved in your workspace root

## ⚙️ Extension Settings

Customize through VS Code settings (`Ctrl+,`):

```json
{
  "postgresExplorer.connections": [],     // Saved connections
  "postgresExplorer.autoConnect": true,  // Auto-connect on startup
  "postgresExplorer.maxResults": 1000    // Max rows per query
}
```

## 🔧 Troubleshooting

### Common Issues

1. **Connection Failed**
   - Verify host and port are correct
   - Check username and password
   - Ensure database server is running
   - Check firewall settings

2. **Query Timeout**
   - Reduce the data set with WHERE clauses
   - Use LIMIT to restrict results
   - Consider indexing frequently queried columns

3. **Export Issues**
   - Ensure write permissions in workspace
   - Close files in other applications
   - Check available disk space

## 📝 License

This extension is licensed under the [MIT License](LICENSE).

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📫 Support

- [Report Issues](https://github.com/ric-v/yape-yet-another-postgres-explorer/issues)
- [Feature Requests](https://github.com/ric-v/yape-yet-another-postgres-explorer/issues/new)
- [Documentation](https://github.com/ric-v/yape-yet-another-postgres-explorer/wiki)

---

**Enjoying the extension?** [Rate us on the marketplace](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer) ⭐
