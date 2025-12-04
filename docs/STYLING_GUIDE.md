# Styling and Template Guide

This guide explains how to use the centralized styling system to maintain consistent UI across the extension.

## Overview

The extension now has a centralized styling system with three main modules:

1. **`htmlStyles.ts`** - CSS variables, style definitions, and HTML/Markdown builders
2. **`notebookTemplates.ts`** - Pre-built notebook cell templates
3. **`rendererUtils.ts`** - Utilities for building renderer UI components

## Benefits

- ✅ **Consistency** - All UI elements use the same styles
- ✅ **Maintainability** - Change styles in one place, update everywhere
- ✅ **Type Safety** - TypeScript ensures correct usage
- ✅ **Reusability** - Pre-built templates for common patterns
- ✅ **Theme Support** - Automatically uses VS Code theme colors

## Usage Examples

### Creating Notebook Cells

#### Using Pre-built Templates

```typescript
import { CommonNotebookTemplates } from '../common/notebookTemplates';

// Create a SELECT query notebook
const cells = CommonNotebookTemplates.selectQuery('public', 'users');

// Create an INSERT query notebook with column info
const cells = CommonNotebookTemplates.insertQuery('public', 'users', [
    { name: 'id', type: 'integer', default: 'nextval(...)' },
    { name: 'name', type: 'text' },
    { name: 'email', type: 'text' }
]);

// Create a VACUUM notebook
const cells = CommonNotebookTemplates.vacuumTable('public', 'users');
```

#### Using the Builder Pattern

```typescript
import { NotebookCellBuilder } from '../common/notebookTemplates';

const cells = new NotebookCellBuilder()
    .addHeader('My Custom Notebook', 'This is a custom notebook', '🎯')
    .addInfoBox('This is an important note', 'info', 'Note')
    .addSection('Query Data', 'SELECT * FROM users;', '📖')
    .addWarningBox('Be careful!', 'Warning')
    .addSQL('-- Your SQL here')
    .build();
```

### Creating Markdown Content

```typescript
import { MarkdownBuilder } from '../common/htmlStyles';

// Info box
const info = MarkdownBuilder.infoBox('This is helpful information');

// Warning box
const warning = MarkdownBuilder.warningBox('This is dangerous!');

// Success/tip box
const tip = MarkdownBuilder.successBox('Here\'s a pro tip!');

// Table
const table = MarkdownBuilder.table(
    ['Column 1', 'Column 2', 'Column 3'],
    [
        ['Row 1 Cell 1', 'Row 1 Cell 2', 'Row 1 Cell 3'],
        ['Row 2 Cell 1', 'Row 2 Cell 2', 'Row 2 Cell 3'],
    ]
);

// Heading with icon
const heading = MarkdownBuilder.heading('My Section', 3, '🎯');

// Code block
const code = MarkdownBuilder.codeBlock('SELECT * FROM users;', 'sql');

// Badge
const badge = MarkdownBuilder.badge('Success', 'success');
```

### Creating Renderer Components

```typescript
import {
    createButton,
    createContainer,
    createCollapsibleHeader,
    createTable,
    createTableHeader,
    createTableCell,
    createMessagesContainer,
    toCSV,
    toMarkdown,
    downloadFile
} from '../common/rendererUtils';

// Create a container
const container = createContainer();

// Create a collapsible header
const { header, chevron } = createCollapsibleHeader('Query Results', '100 rows, 0.5s', true);

// Create a button
const button = createButton('Export', 'primary');
button.addEventListener('click', () => {
    console.log('Export clicked');
});

// Create a table
const table = createTable();
const thead = document.createElement('thead');
const tr = document.createElement('tr');
tr.appendChild(createTableHeader('ID'));
tr.appendChild(createTableHeader('Name'));
thead.appendChild(tr);
table.appendChild(thead);

// Export data
const csvData = toCSV(['id', 'name'], [{ id: 1, name: 'John' }]);
downloadFile(csvData, 'export.csv', 'text/csv');
```

### Accessing Style Constants

```typescript
import { CSS_VARIABLES, COMMON_STYLES, styleToString } from '../common/htmlStyles';

// Use CSS variables
element.style.color = CSS_VARIABLES.editorForeground;
element.style.fontFamily = CSS_VARIABLES.fontFamily;

// Apply common styles
Object.assign(element.style, COMMON_STYLES.button);

// Convert style object to string
const styleStr = styleToString({
    padding: '10px',
    backgroundColor: CSS_VARIABLES.editorBackground
});
// Result: "padding: 10px; background-color: var(--vscode-editor-background)"
```

## Migration Guide

### Before (Old Way)

```typescript
// Inline styles everywhere
const cells = [
    new vscode.NotebookCellData(
        vscode.NotebookCellKind.Markup,
        `### Select Data
<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Execute the query below
</div>`,
        'markdown'
    ),
    new vscode.NotebookCellData(
        vscode.NotebookCellKind.Code,
        'SELECT * FROM users;',
        'sql'
    )
];
```

### After (New Way)

```typescript
// Use pre-built templates
const cells = CommonNotebookTemplates.selectQuery('public', 'users');

// OR use builder
const cells = new NotebookCellBuilder()
    .addHeader('Select Data', 'Execute the query below')
    .addSQL('SELECT * FROM users;')
    .build();
```

## Best Practices

1. **Always use the centralized styles** - Never hardcode colors or CSS values
2. **Use pre-built templates** - They ensure consistency and save time
3. **Use the builder pattern** - For custom notebooks, use `NotebookCellBuilder`
4. **Leverage type safety** - TypeScript will catch errors
5. **Keep it DRY** - If you're repeating code, create a new template

## Adding New Templates

To add a new template, edit `src/common/notebookTemplates.ts`:

```typescript
export class CommonNotebookTemplates {
    /**
     * Create a custom operation notebook
     */
    static myCustomOperation(schema: string, tableName: string): vscode.NotebookCellData[] {
        return new NotebookCellBuilder()
            .addHeader(`My Operation: \`${schema}.${tableName}\``, 'Description here', '🎯')
            .addInfoBox('Important information')
            .addSection('Step 1', 'SQL code here', '📝')
            .build();
    }
}
```

## Customization

To customize the global styles, edit `src/common/htmlStyles.ts`:

```typescript
export const COMMON_STYLES = {
    // Add or modify styles here
    myNewStyle: {
        padding: '10px',
        borderRadius: '5px',
        // ...
    }
};
```

## Testing

When making style changes, test in both light and dark themes:

1. Switch to dark theme: `Ctrl+K Ctrl+T` → Select dark theme
2. Switch to light theme: `Ctrl+K Ctrl+T` → Select light theme
3. Verify all UI elements look correct in both

## Support

For questions or issues with the styling system, refer to:
- `src/common/htmlStyles.ts` - Style definitions
- `src/common/notebookTemplates.ts` - Notebook templates
- `src/common/rendererUtils.ts` - Renderer utilities
