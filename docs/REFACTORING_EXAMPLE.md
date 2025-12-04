# Refactoring Example

This document shows how to refactor existing code to use the new centralized styling system.

## Example: Refactoring a Table Command

### Before (Old Code)

```typescript
export async function cmdScriptSelect(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    const markdown = `### 📖 SELECT Script: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Execute the query below to retrieve data from the table.
</div>`;

    const connectionConfig = await getConnectionWithPassword(item.connectionId!);
    const metadata = createMetadata(connectionConfig, item.databaseName);

    const cells = [
        new vscode.NotebookCellData(
            vscode.NotebookCellKind.Markup,
            markdown,
            'markdown'
        ),
        new vscode.NotebookCellData(
            vscode.NotebookCellKind.Code,
            `SELECT * FROM ${item.schema}.${item.label} LIMIT 100;`,
            'sql'
        )
    ];

    await createAndShowNotebook(cells, metadata);
}
```

### After (New Code)

```typescript
import { CommonNotebookTemplates } from '../common/notebookTemplates';

export async function cmdScriptSelect(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    const connectionConfig = await getConnectionWithPassword(item.connectionId!);
    const metadata = createMetadata(connectionConfig, item.databaseName);

    // Use pre-built template
    const cells = CommonNotebookTemplates.selectQuery(item.schema!, item.label);

    await createAndShowNotebook(cells, metadata);
}
```

**Benefits:**
- ✅ 75% less code
- ✅ Consistent styling
- ✅ Easier to maintain
- ✅ Type-safe

---

## Example: Refactoring a Complex Notebook

### Before (Old Code)

```typescript
export async function cmdInsertTable(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    validateItem(item);
    const connection = await getConnectionWithPassword(item.connectionId!);
    const client = await ConnectionManager.getInstance().getConnection({...});
    
    const result = await client.query(COLUMN_INFO_QUERY, [item.schema, item.label]);
    const columns = result.rows.map(col => col.column_name);
    const placeholders = result.rows.map(col => {
        // Complex placeholder logic...
    });

    const metadata = createMetadata(connection, item.databaseName);
    
    const cells = [
        new vscode.NotebookCellData(
            vscode.NotebookCellKind.Markup,
            `### ➕ Insert Data: \`${item.schema}.${item.label}\`

<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ Note:</strong> Replace placeholder values below with your actual data.
</div>

#### 📋 Common Data Type Formats

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Data Type</th><th style="text-align: left;">Example</th></tr>
    <tr><td>Text</td><td>'example'</td></tr>
    <tr><td>Integer</td><td>42</td></tr>
</table>`,
            'markdown'
        ),
        new vscode.NotebookCellData(
            vscode.NotebookCellKind.Code,
            `INSERT INTO ${item.schema}.${item.label} (...) VALUES (...);`,
            'sql'
        )
    ];

    await createAndShowNotebook(cells, metadata);
}
```

### After (New Code)

```typescript
import { CommonNotebookTemplates } from '../common/notebookTemplates';

export async function cmdInsertTable(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    validateItem(item);
    const connection = await getConnectionWithPassword(item.connectionId!);
    const client = await ConnectionManager.getInstance().getConnection({...});
    
    const result = await client.query(COLUMN_INFO_QUERY, [item.schema, item.label]);
    
    // Map to template format
    const columns = result.rows.map(col => ({
        name: col.column_name,
        type: col.data_type,
        default: col.column_default
    }));

    const metadata = createMetadata(connection, item.databaseName);
    
    // Use pre-built template
    const cells = CommonNotebookTemplates.insertQuery(item.schema!, item.label, columns);

    await createAndShowNotebook(cells, metadata);
}
```

**Benefits:**
- ✅ Much simpler
- ✅ Consistent data type reference table
- ✅ Automatic placeholder generation
- ✅ Easier to update globally

---

## Example: Using the Builder for Custom Notebooks

### For Unique Operations

When you need a custom notebook that doesn't fit existing templates:

```typescript
import { NotebookCellBuilder } from '../common/notebookTemplates';
import { MarkdownBuilder } from '../common/htmlStyles';

export async function cmdCustomOperation(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    const connectionConfig = await getConnectionWithPassword(item.connectionId!);
    const metadata = createMetadata(connectionConfig, item.databaseName);

    const cells = new NotebookCellBuilder()
        // Add header with description
        .addHeader(
            `Custom Operation: \`${item.schema}.${item.label}\``,
            'This is a custom operation that does something special',
            '🎯'
        )
        
        // Add info box
        .addInfoBox('This operation requires special permissions', 'info', 'Note')
        
        // Add a comparison table
        .addMarkdown(MarkdownBuilder.table(
            ['Option', 'Description', 'Impact'],
            [
                ['Option A', 'Fast but risky', '⚠️ High'],
                ['Option B', 'Slow but safe', '✅ Low'],
            ]
        ))
        
        // Add first SQL section
        .addSection(
            'Step 1: Prepare',
            'BEGIN TRANSACTION;',
            '🔧'
        )
        
        // Add warning
        .addInfoBox('Make sure to verify the results before committing!', 'warning')
        
        // Add second SQL section
        .addSection(
            'Step 2: Execute',
            `UPDATE ${item.schema}.${item.label} SET ...;`,
            '▶️'
        )
        
        // Add final step
        .addSection(
            'Step 3: Commit or Rollback',
            '-- Review results, then:\nCOMMIT;\n-- OR\nROLLBACK;',
            '✅'
        )
        
        .build();

    await createAndShowNotebook(cells, metadata);
}
```

---

## Renderer Refactoring Example

### Before (renderer_v2.ts - partial)

```typescript
// Lots of inline styles
const button = document.createElement('button');
button.textContent = 'Export';
button.style.background = 'var(--vscode-button-background)';
button.style.color = 'var(--vscode-button-foreground)';
button.style.border = 'none';
button.style.padding = '4px 12px';
button.style.cursor = 'pointer';
button.style.borderRadius = '2px';
button.style.fontSize = '12px';
button.style.fontWeight = '500';
```

### After

```typescript
import { createButton, toCSV, downloadFile } from '../common/rendererUtils';

// Simple, consistent
const button = createButton('Export', 'primary');
button.addEventListener('click', () => {
    const csv = toCSV(columns, rows);
    downloadFile(csv, 'export.csv', 'text/csv');
});
```

---

## Checklist for Refactoring

When refactoring a file to use the new system:

- [ ] Import necessary utilities from `common/`
- [ ] Replace inline styles with `COMMON_STYLES` constants
- [ ] Replace hardcoded markdown with `MarkdownBuilder` methods
- [ ] Use `CommonNotebookTemplates` for standard operations
- [ ] Use `NotebookCellBuilder` for custom notebooks
- [ ] Use `rendererUtils` for renderer components
- [ ] Test in both light and dark themes
- [ ] Verify all functionality still works
- [ ] Remove unused code

---

## Common Patterns

### Pattern 1: Simple Query Notebook

```typescript
// Old
const cells = [markdown cell, sql cell];

// New
const cells = CommonNotebookTemplates.selectQuery(schema, table);
```

### Pattern 2: Info Box

```typescript
// Old
`<div style="font-size: 12px; background-color: #2b3a42; ...">
    <strong>ℹ️ Note:</strong> Message here
</div>`

// New
MarkdownBuilder.infoBox('Message here')
```

### Pattern 3: Table

```typescript
// Old
`<table style="...">
    <tr><th>Col1</th><th>Col2</th></tr>
    <tr><td>Val1</td><td>Val2</td></tr>
</table>`

// New
MarkdownBuilder.table(
    ['Col1', 'Col2'],
    [['Val1', 'Val2']]
)
```

### Pattern 4: Button

```typescript
// Old
const btn = document.createElement('button');
btn.textContent = 'Click';
btn.style.background = '...';
// ... many more style lines

// New
const btn = createButton('Click', 'primary');
```

---

## Migration Priority

Suggested order for refactoring files:

1. ✅ High-use commands (tables.ts, database.ts) - Most impact
2. ⚠️ Renderer (renderer_v2.ts) - Complex but valuable
3. 📝 Other command files - Lower priority
4. 🎨 Dashboard HTML - Already fairly clean

---

## Need Help?

If you encounter issues during refactoring:

1. Check the documentation in `docs/STYLING_GUIDE.md`
2. Look at refactored examples in the codebase
3. Verify you're using the correct imports
4. Test thoroughly in both themes
