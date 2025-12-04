# Centralized Styling System - Quick Reference

## 📁 File Structure

```
src/
├── common/
│   ├── htmlStyles.ts          # CSS variables, styles, HTML/Markdown builders
│   ├── notebookTemplates.ts   # Pre-built notebook cell templates
│   ├── rendererUtils.ts       # Renderer UI component utilities
│   └── types.ts               # (existing)
└── docs/
    ├── STYLING_GUIDE.md        # Comprehensive guide
    └── REFACTORING_EXAMPLE.md  # Refactoring examples
```

## 🎨 Main Modules

### 1. htmlStyles.ts

**Purpose:** CSS variables, common styles, and builders

**Key Exports:**
- `CSS_VARIABLES` - VS Code theme-aware CSS variables
- `COMMON_STYLES` - Pre-defined style objects
- `MarkdownBuilder` - Build markdown content
- `HtmlBuilder` - Build HTML elements
- `NotebookTemplates` - Common notebook patterns

**Quick Examples:**

```typescript
// Use theme colors
CSS_VARIABLES.editorForeground
CSS_VARIABLES.buttonBackground

// Apply common styles
Object.assign(element.style, COMMON_STYLES.button);

// Build markdown
MarkdownBuilder.infoBox('Message')
MarkdownBuilder.table(headers, rows)
MarkdownBuilder.heading('Title', 3, '🎯')
```

### 2. notebookTemplates.ts

**Purpose:** Build consistent notebook cells

**Key Exports:**
- `NotebookCellBuilder` - Builder pattern for custom notebooks
- `CommonNotebookTemplates` - Pre-built templates

**Quick Examples:**

```typescript
// Use pre-built templates
CommonNotebookTemplates.selectQuery(schema, table)
CommonNotebookTemplates.insertQuery(schema, table, columns)
CommonNotebookTemplates.updateQuery(schema, table, primaryKeys)
CommonNotebookTemplates.deleteQuery(schema, table)
CommonNotebookTemplates.vacuumTable(schema, table)
CommonNotebookTemplates.analyzeTable(schema, table)
CommonNotebookTemplates.dropTable(schema, table)
CommonNotebookTemplates.truncateTable(schema, table)

// Use builder for custom notebooks
new NotebookCellBuilder()
    .addHeader('Title', 'Description', '🎯')
    .addInfoBox('Note', 'info')
    .addSection('SQL Title', 'SELECT ...;', '📖')
    .addWarningBox('Be careful!')
    .addDivider()
    .build()
```

### 3. rendererUtils.ts

**Purpose:** Build renderer UI components

**Key Exports:**
- `createButton()` - Styled buttons
- `createContainer()` - Styled containers
- `createTable()` - Styled tables
- `createCollapsibleHeader()` - Collapsible headers
- `createMessagesContainer()` - SQL notices
- Export utilities: `toCSV()`, `toMarkdown()`, `toExcel()`, `toSQLInsert()`
- `formatValue()` - Format cell values
- `downloadFile()` - Download files

**Quick Examples:**

```typescript
// Create UI components
const button = createButton('Export', 'primary');
const container = createContainer();
const table = createTable();
const { header, chevron } = createCollapsibleHeader('Title', '100 rows', true);

// Export data
const csv = toCSV(columns, rows);
downloadFile(csv, 'export.csv', 'text/csv');

// Format values
const { text, isNull, type } = formatValue(cellValue);
```

## 🚀 Common Use Cases

### Use Case 1: Create a Simple Query Notebook

```typescript
import { CommonNotebookTemplates } from '../common/notebookTemplates';

const cells = CommonNotebookTemplates.selectQuery('public', 'users');
await createAndShowNotebook(cells, metadata);
```

### Use Case 2: Create a Custom Notebook

```typescript
import { NotebookCellBuilder } from '../common/notebookTemplates';

const cells = new NotebookCellBuilder()
    .addHeader('Custom Query', 'Run this carefully', '⚠️')
    .addInfoBox('This modifies data', 'warning')
    .addSection('Query', 'UPDATE users SET ...;')
    .build();
```

### Use Case 3: Add Markdown Elements

```typescript
import { MarkdownBuilder } from '../common/htmlStyles';

const markdown = 
    MarkdownBuilder.heading('Results', 3, '📊') + '\n\n' +
    MarkdownBuilder.infoBox('Query completed successfully') + '\n\n' +
    MarkdownBuilder.table(
        ['ID', 'Name', 'Status'],
        [
            ['1', 'John', 'Active'],
            ['2', 'Jane', 'Inactive']
        ]
    );
```

### Use Case 4: Create Renderer Components

```typescript
import { 
    createButton, 
    createTable, 
    createTableHeader,
    createTableCell,
    toCSV,
    downloadFile
} from '../common/rendererUtils';

const exportBtn = createButton('Export CSV', 'primary');
exportBtn.addEventListener('click', () => {
    const csv = toCSV(['id', 'name'], rows);
    downloadFile(csv, 'data.csv', 'text/csv');
});

const table = createTable();
const thead = document.createElement('thead');
const tr = document.createElement('tr');
tr.appendChild(createTableHeader('ID'));
tr.appendChild(createTableHeader('Name'));
thead.appendChild(tr);
table.appendChild(thead);
```

## 📊 Info Box Types

```typescript
// Blue info box
MarkdownBuilder.infoBox('Message')

// Red warning box
MarkdownBuilder.warningBox('Warning message')

// Green success/tip box
MarkdownBuilder.successBox('Tip message')

// Red danger/caution box
MarkdownBuilder.dangerBox('Dangerous action!')
```

## 🎨 Style Constants

```typescript
import { CSS_VARIABLES, COMMON_STYLES } from '../common/htmlStyles';

// CSS Variables (theme-aware)
CSS_VARIABLES.editorBackground
CSS_VARIABLES.editorForeground
CSS_VARIABLES.buttonBackground
CSS_VARIABLES.widgetBorder
CSS_VARIABLES.fontFamily
// ... see htmlStyles.ts for full list

// Common Styles
COMMON_STYLES.container
COMMON_STYLES.header
COMMON_STYLES.successHeader
COMMON_STYLES.button
COMMON_STYLES.buttonSecondary
COMMON_STYLES.table
COMMON_STYLES.tableHeader
COMMON_STYLES.tableCell
```

## ✅ Migration Checklist

When refactoring existing code:

1. [ ] Import utilities: `import { ... } from '../common/...'`
2. [ ] Replace inline styles with `COMMON_STYLES`
3. [ ] Replace hardcoded markdown with `MarkdownBuilder`
4. [ ] Use `CommonNotebookTemplates` for standard operations
5. [ ] Use `NotebookCellBuilder` for custom notebooks
6. [ ] Use `rendererUtils` for renderer components
7. [ ] Test in light and dark themes
8. [ ] Verify functionality

## 🔧 Extending the System

### Add a New Template

Edit `src/common/notebookTemplates.ts`:

```typescript
export class CommonNotebookTemplates {
    static myNewTemplate(schema: string, table: string): vscode.NotebookCellData[] {
        return new NotebookCellBuilder()
            .addHeader(`My Template: \`${schema}.${table}\``, 'Description', '🎯')
            .addSQL('-- SQL here')
            .build();
    }
}
```

### Add a New Style

Edit `src/common/htmlStyles.ts`:

```typescript
export const COMMON_STYLES = {
    // ... existing styles
    myNewStyle: {
        padding: '10px',
        borderRadius: '5px',
        background: CSS_VARIABLES.editorBackground,
    }
};
```

### Add a New Builder Method

Edit `src/common/htmlStyles.ts`:

```typescript
export class MarkdownBuilder {
    // ... existing methods
    static myNewElement(content: string): string {
        return `<div class="my-element">${content}</div>`;
    }
}
```

## 💡 Tips

1. **Always use the centralized system** - Avoid hardcoding styles
2. **Leverage TypeScript** - Let it catch errors
3. **Test in both themes** - Light and dark
4. **Use pre-built templates** - They're faster and consistent
5. **Builder pattern for complex notebooks** - Cleaner code

## 📚 Documentation

- `docs/STYLING_GUIDE.md` - Comprehensive guide with examples
- `docs/REFACTORING_EXAMPLE.md` - Real refactoring examples
- `src/common/htmlStyles.ts` - Source code with JSDoc comments
- `src/common/notebookTemplates.ts` - Template builders
- `src/common/rendererUtils.ts` - Renderer utilities

## 🆘 Support

If you need help:
1. Check the docs above
2. Look at refactored examples in the codebase
3. Review the source code (well-documented)

---

**Last Updated:** December 2025
