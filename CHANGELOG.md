# Changelog

All notable changes to the PostgreSQL Explorer extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.4] - 2025-12-13

### Rebranding
- **Project Renamed**: The extension is now **PgStudio**! (formerly "YAPE" / "PostgreSQL Explorer").
- Updated all documentation and UI references to reflect the new professional identity.

### Added
- **Dashboard Visuals**: Added "glow" and "blur" effects to dashboard charts for a modern, premium look.
- **Improved Markdown in Chat**: SQL Assistant now renders rich Markdown tables and syntax highlighting correctly.

### Improved
- **Notebook UX**: The "Open in Notebook" button now provides clearer feedback when no notebook is active.
- **Documentation**: Comprehensive updates to README and Marketplace page.

## [0.5.3] - 2025-12-07

### Fixed
- Minor bug fixes and stability improvements
- Fixed linting errors and type issues across command files

---

## [0.5.2] - 2025-12-06

### Changed
- **SQL Template Refactoring**: Extracted embedded SQL from TypeScript command files into dedicated template modules
  - Created `src/commands/sql/` directory with 13 specialized SQL template modules
  - Modules: columns, constraints, extensions, foreignTables, functions, indexes, materializedViews, schema, tables, types, usersRoles, views
  - Improved code maintainability and separation of concerns

---

## [0.5.1] - 2025-12-05

### Changed
- **Helper Abstractions Refactoring**: Refactored command files to use `getDatabaseConnection` and `NotebookBuilder` methods
  - Updated `tables.ts`, `database.ts`, and `aiAssist.ts` to use new helper abstractions
  - Improved code reusability and consistency across commands

---

## [0.5.0] - 2025-12-05

### Added
- **Enhanced Table Renderer**: New `renderer_v2.ts` with improved table output styling
- **Export Data Functionality**: Export query results to CSV, JSON, and Excel formats
- **Column Operations**: Enhanced column context menu with copy, scripts, and statistics
- **Constraint Operations**: Enhanced constraint management with validation and dependencies
- **Index Operations**: Enhanced index management with usage analysis and maintenance scripts

### Fixed
- Fixed persistent renderer cache issues
- Fixed excessive row height in table output
- Fixed chart initialization in dashboard

---

## [0.4.0] - 2025-12-03

### Added
- **Inline Create Buttons**: Added "+" buttons for creating objects directly from category nodes
  - Tables, Views, Functions, Types, Materialized Views, Foreign Tables, Roles, Extensions, Schemas, Databases
- **Enhanced Script Generation**: Improved CREATE script generation for indexes
- **Column Context Menu**: Added comprehensive column operations menu

### Fixed
- Fixed connection UI button functionality
- Fixed index creation script visibility in context menu

---

## [0.3.0] - 2025-12-01

### Added
- **Comprehensive Test Coverage**: Added unit tests for NotebookKernel with improved coverage
- **Serialization Error Handling**: Improved handling of serialization errors in query results

### Changed
- Improved dashboard UI with pastel colors and modern styling
- Enhanced chart visualizations with area charts and translucent effects
- Fixed Cancel and Kill buttons in active queries table

---

## [0.2.3] - 2025-11-29

### Added
- **AI Assist CodeLens**: Added "✨ Ask AI" link directly above notebook cells for quick access to AI features
- **Multiple AI Providers**: Added native support for Google Gemini, OpenAI, and Anthropic APIs
- **Pre-defined AI Tasks**: Added quick actions for "Explain", "Fix Syntax", "Optimize", and "Format"
- **Inline Toolbar Button**: Added "Ask AI to Modify" button to the cell toolbar
- **Configuration**: Added settings for AI provider, API key, model, and custom endpoint

### Fixed
- **CodeLens Visibility**: Fixed issue where CodeLens was not appearing by correctly registering the `postgres` language ID

## [0.2.2] - 2025-11-29

### Fixed
- **CRITICAL**: Fixed entry point in package.json that caused "command not found" errors when installing from marketplace
  - Changed main entry point from `./out/extension.js` to `./dist/extension.js`
  - Resolves issue where `postgres-explorer.manageConnections` and `postgres-explorer.addConnection` commands were not found
  - All commands now load correctly from the bundled distribution

## [0.2.1] - 2025-11-29

### Added
- Updated comprehensive README with modern design and better structure
- Added GitHub Copilot and agentic AI support documentation
- Enhanced feature descriptions and usage guides
- Added detailed tutorials for common workflows

### Known Issues
- Entry point configuration issue (fixed in 0.2.2)

## [0.2.0] - 2025-11-29

### Added
- Real-time database dashboard with live metrics monitoring
- Active query management (Cancel/Kill operations)
- Performance graphs and trends
- Connection management UI improvements
- Materialized view support
- Foreign table operations
- Type management
- Extension management
- Role and permission management
- PSQL terminal integration
- Backup and restore functionality

### Enhanced
- Improved table operations with maintenance tools (VACUUM, ANALYZE, REINDEX)
- Better script generation for all database objects
- Enhanced notebook interface
- Improved error handling and user feedback

### Changed
- Refactored connection management for better security
- Updated UI with modern, pastel-themed design
- Improved tree view navigation

## [0.1.x] - Previous versions

Earlier versions with basic PostgreSQL exploration, SQL notebooks, and data export features.
