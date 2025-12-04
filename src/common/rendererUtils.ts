/**
 * Reusable utilities for notebook cell renderers
 * Provides consistent styling and component creation
 */

import { COMMON_STYLES, CSS_VARIABLES, styleToString } from './htmlStyles';

/**
 * Create a styled button with consistent appearance
 */
export function createButton(
    text: string,
    variant: 'primary' | 'secondary' = 'secondary'
): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    
    const baseStyle = COMMON_STYLES.button;
    const variantStyle = variant === 'secondary' ? COMMON_STYLES.buttonSecondary : {};
    
    Object.assign(btn.style, baseStyle, variantStyle);
    
    return btn;
}

/**
 * Create a styled container with consistent appearance
 */
export function createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    Object.assign(container.style, COMMON_STYLES.container);
    return container;
}

/**
 * Create a collapsible header
 */
export function createCollapsibleHeader(
    title: string,
    summary: string,
    isSuccess: boolean = false
): { header: HTMLDivElement; chevron: HTMLSpanElement } {
    const header = document.createElement('div');
    
    const baseStyle = COMMON_STYLES.header;
    const successStyle = isSuccess ? COMMON_STYLES.successHeader : {};
    
    Object.assign(header.style, baseStyle, successStyle);
    
    const chevron = document.createElement('span');
    chevron.textContent = '▼';
    chevron.style.fontSize = '10px';
    chevron.style.transition = 'transform 0.2s';
    chevron.style.display = 'inline-block';
    
    const titleSpan = document.createElement('span');
    titleSpan.textContent = title;
    titleSpan.style.fontWeight = '600';
    titleSpan.style.textTransform = 'uppercase';
    
    const summarySpan = document.createElement('span');
    summarySpan.style.marginLeft = 'auto';
    summarySpan.style.opacity = '0.7';
    summarySpan.style.fontSize = '0.9em';
    summarySpan.textContent = summary;
    
    header.appendChild(chevron);
    header.appendChild(titleSpan);
    header.appendChild(summarySpan);
    
    return { header, chevron };
}

/**
 * Create a styled table
 */
export function createTable(): HTMLTableElement {
    const table = document.createElement('table');
    Object.assign(table.style, COMMON_STYLES.table);
    return table;
}

/**
 * Create a table header cell
 */
export function createTableHeader(text: string): HTMLTableCellElement {
    const th = document.createElement('th');
    th.textContent = text;
    Object.assign(th.style, COMMON_STYLES.tableHeader);
    return th;
}

/**
 * Create a table data cell
 */
export function createTableCell(content: string | HTMLElement): HTMLTableCellElement {
    const td = document.createElement('td');
    
    if (typeof content === 'string') {
        td.textContent = content;
    } else {
        td.appendChild(content);
    }
    
    Object.assign(td.style, COMMON_STYLES.tableCell);
    return td;
}

/**
 * Create an actions bar
 */
export function createActionsBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.style.display = 'none'; // Hidden by default
    bar.style.padding = '8px 12px';
    bar.style.gap = '8px';
    bar.style.alignItems = 'center';
    bar.style.borderBottom = `1px solid ${CSS_VARIABLES.panelBorder}`;
    bar.style.background = CSS_VARIABLES.editorBackground;
    return bar;
}

/**
 * Create a messages container (for SQL notices)
 */
export function createMessagesContainer(messages: string[]): HTMLDivElement {
    const container = document.createElement('div');
    container.style.padding = '8px 12px';
    container.style.background = CSS_VARIABLES.textBlockQuoteBackground;
    container.style.borderLeft = `4px solid ${CSS_VARIABLES.textBlockQuoteBorder}`;
    container.style.margin = '8px 12px 0 12px';
    container.style.fontFamily = CSS_VARIABLES.editorFontFamily;
    container.style.whiteSpace = 'pre-wrap';
    container.style.fontSize = '12px';
    
    const title = document.createElement('div');
    title.textContent = 'Messages';
    title.style.fontWeight = '600';
    title.style.marginBottom = '4px';
    title.style.opacity = '0.8';
    container.appendChild(title);
    
    messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.textContent = msg;
        msgDiv.style.marginBottom = '2px';
        container.appendChild(msgDiv);
    });
    
    return container;
}

/**
 * Create an export dropdown menu
 */
export function createExportMenu(
    onExport: (format: 'csv' | 'excel' | 'json' | 'markdown' | 'sql') => void,
    hasSqlOption: boolean = false
): HTMLDivElement {
    const menu = document.createElement('div');
    menu.className = 'export-dropdown';
    menu.style.position = 'absolute';
    menu.style.top = '100%';
    menu.style.left = '0';
    menu.style.background = CSS_VARIABLES.menuBackground;
    menu.style.border = `1px solid ${CSS_VARIABLES.menuBorder}`;
    menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    menu.style.zIndex = '100';
    menu.style.minWidth = '150px';
    menu.style.borderRadius = '3px';
    menu.style.padding = '4px 0';
    
    const createMenuItem = (label: string, format: 'csv' | 'excel' | 'json' | 'markdown' | 'sql') => {
        const item = document.createElement('div');
        item.textContent = label;
        item.style.padding = '6px 12px';
        item.style.cursor = 'pointer';
        item.style.color = CSS_VARIABLES.menuForeground;
        item.style.fontSize = '12px';
        
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = CSS_VARIABLES.menuSelectionBackground;
        });
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'transparent';
        });
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.remove();
            onExport(format);
        });
        
        return item;
    };
    
    menu.appendChild(createMenuItem('Save as CSV', 'csv'));
    menu.appendChild(createMenuItem('Save as Excel', 'excel'));
    menu.appendChild(createMenuItem('Save as JSON', 'json'));
    menu.appendChild(createMenuItem('Save as Markdown', 'markdown'));
    
    if (hasSqlOption) {
        menu.appendChild(createMenuItem('Copy SQL INSERT', 'sql'));
    }
    
    return menu;
}

/**
 * Format a value for display in a table cell
 */
export function formatValue(val: any): { text: string; isNull: boolean; type: string } {
    if (val === null) return { text: 'NULL', isNull: true, type: 'null' };
    if (typeof val === 'boolean') return { text: val ? 'TRUE' : 'FALSE', isNull: false, type: 'boolean' };
    if (typeof val === 'number') return { text: String(val), isNull: false, type: 'number' };
    if (val instanceof Date) return { text: val.toLocaleString(), isNull: false, type: 'date' };
    if (typeof val === 'object') return { text: JSON.stringify(val), isNull: false, type: 'object' };
    return { text: String(val), isNull: false, type: 'string' };
}

/**
 * Download a file with given content
 */
export function downloadFile(content: string, filename: string, type: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Convert table data to CSV format
 */
export function toCSV(columns: string[], rows: any[]): string {
    const header = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
    const body = rows.map(row => {
        return columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return '';
            const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
            return `"${str.replace(/"/g, '""')}"`;
        }).join(',');
    }).join('\n');
    return `${header}\n${body}`;
}

/**
 * Convert table data to Markdown format
 */
export function toMarkdown(columns: string[], rows: any[]): string {
    const header = `| ${columns.join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = rows.map(row => {
        const values = columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return '';
            return String(val).replace(/\|/g, '\\|');
        });
        return `| ${values.join(' | ')} |`;
    }).join('\n');
    return `${header}\n${separator}\n${body}`;
}

/**
 * Convert table data to Excel HTML format
 */
export function toExcel(columns: string[], rows: any[]): string {
    const header = columns.map(c => `<th>${c}</th>`).join('');
    const body = rows.map(row => {
        const cells = columns.map(col => {
            const val = row[col];
            return `<td>${val === null || val === undefined ? '' : String(val)}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');
    
    return `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <!--[if gte mso 9]>
    <xml>
        <x:ExcelWorkbook>
            <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                    <x:Name>Sheet1</x:Name>
                    <x:WorksheetOptions>
                        <x:DisplayGridlines/>
                    </x:WorksheetOptions>
                </x:ExcelWorksheet>
            </x:ExcelWorksheets>
        </x:ExcelWorkbook>
    </xml>
    <![endif]-->
</head>
<body>
    <table>
        <thead><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
    </table>
</body>
</html>`;
}

/**
 * Generate SQL INSERT statements
 */
export function toSQLInsert(tableName: string, columns: string[], rows: any[]): string {
    const cols = columns.map(c => `"${c}"`).join(', ');
    
    return rows.map(row => {
        const values = columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'number') return String(val);
            if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return `'${String(val).replace(/'/g, "''")}'`;
        }).join(', ');
        return `INSERT INTO ${tableName} (${cols}) VALUES (${values});`;
    }).join('\n');
}
