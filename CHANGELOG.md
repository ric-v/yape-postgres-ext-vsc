# Changelog

All notable changes to the PostgreSQL Explorer extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
