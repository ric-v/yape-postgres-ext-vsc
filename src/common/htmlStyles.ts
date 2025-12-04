/**
 * Common HTML/CSS styles and utilities for consistent UI across the extension
 * This module provides reusable style definitions and HTML template builders
 */

/**
 * CSS Variables and Theme-aware styles
 */
export const CSS_VARIABLES = {
    // Colors
    editorBackground: 'var(--vscode-editor-background)',
    editorForeground: 'var(--vscode-editor-foreground)',
    buttonBackground: 'var(--vscode-button-background)',
    buttonForeground: 'var(--vscode-button-foreground)',
    buttonSecondaryBackground: 'var(--vscode-button-secondaryBackground)',
    buttonSecondaryForeground: 'var(--vscode-button-secondaryForeground)',
    widgetBorder: 'var(--vscode-widget-border)',
    panelBorder: 'var(--vscode-panel-border)',
    textBlockQuoteBackground: 'var(--vscode-textBlockQuote-background)',
    textBlockQuoteBorder: 'var(--vscode-textBlockQuote-border)',
    listHoverBackground: 'var(--vscode-list-hoverBackground)',
    errorForeground: 'var(--vscode-errorForeground)',
    testingIconPassed: 'var(--vscode-testing-iconPassed)',
    debugIconStartForeground: 'var(--vscode-debugIcon-startForeground)',
    menuBackground: 'var(--vscode-menu-background)',
    menuBorder: 'var(--vscode-menu-border)',
    menuForeground: 'var(--vscode-menu-foreground)',
    menuSelectionBackground: 'var(--vscode-menu-selectionBackground)',
    descriptionForeground: 'var(--vscode-descriptionForeground)',
    textLinkForeground: 'var(--vscode-textLink-foreground)',
    
    // Fonts
    fontFamily: 'var(--vscode-font-family)',
    editorFontFamily: 'var(--vscode-editor-font-family)',
} as const;

/**
 * Common inline styles as JavaScript objects for programmatic use
 */
export const COMMON_STYLES = {
    container: {
        fontFamily: CSS_VARIABLES.fontFamily,
        fontSize: '13px',
        color: CSS_VARIABLES.editorForeground,
        border: `1px solid ${CSS_VARIABLES.widgetBorder}`,
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '8px',
    },
    
    header: {
        padding: '6px 12px',
        background: CSS_VARIABLES.editorBackground,
        borderBottom: `1px solid ${CSS_VARIABLES.widgetBorder}`,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        userSelect: 'none',
    },
    
    successHeader: {
        background: 'rgba(115, 191, 105, 0.25)',
        borderLeft: `4px solid ${CSS_VARIABLES.testingIconPassed}`,
    },
    
    button: {
        background: CSS_VARIABLES.buttonBackground,
        color: CSS_VARIABLES.buttonForeground,
        border: 'none',
        padding: '4px 12px',
        cursor: 'pointer',
        borderRadius: '2px',
        fontSize: '12px',
        fontWeight: '500',
    },
    
    buttonSecondary: {
        background: CSS_VARIABLES.buttonSecondaryBackground,
        color: CSS_VARIABLES.buttonSecondaryForeground,
    },
    
    table: {
        width: '100%',
        borderCollapse: 'separate' as const,
        borderSpacing: '0',
        fontSize: '13px',
        whiteSpace: 'nowrap' as const,
        lineHeight: '1.5',
    },
    
    tableHeader: {
        textAlign: 'left' as const,
        padding: '8px 12px',
        borderBottom: `1px solid ${CSS_VARIABLES.widgetBorder}`,
        borderRight: `1px solid ${CSS_VARIABLES.widgetBorder}`,
        fontWeight: '600',
        color: CSS_VARIABLES.editorForeground,
        position: 'sticky' as const,
        top: '0',
        background: CSS_VARIABLES.editorBackground,
        zIndex: '10',
        userSelect: 'none' as const,
    },
    
    tableCell: {
        padding: '6px 12px',
        borderBottom: `1px solid ${CSS_VARIABLES.widgetBorder}`,
        borderRight: `1px solid ${CSS_VARIABLES.widgetBorder}`,
        color: CSS_VARIABLES.editorForeground,
    },
} as const;

/**
 * Convert style object to inline CSS string
 */
export function styleToString(styleObj: Record<string, string | number>): string {
    return Object.entries(styleObj)
        .map(([key, value]) => {
            // Convert camelCase to kebab-case
            const cssKey = key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
            return `${cssKey}: ${value}`;
        })
        .join('; ');
}

/**
 * Markdown template builders for notebook cells
 */
export class MarkdownBuilder {
    /**
     * Create an info box with icon and message
     */
    static infoBox(message: string, title: string = 'Note'): string {
        return `<div style="font-size: 12px; background-color: #2b3a42; border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>ℹ️ ${title}:</strong> ${message}
</div>`;
    }

    /**
     * Create a warning box with icon and message
     */
    static warningBox(message: string, title: string = 'Warning'): string {
        return `<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>⚠️ ${title}:</strong> ${message}
</div>`;
    }

    /**
     * Create a success/tip box with icon and message
     */
    static successBox(message: string, title: string = 'Tip'): string {
        return `<div style="font-size: 12px; background-color: #2d3e30; border-left: 3px solid #2ecc71; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>💡 ${title}:</strong> ${message}
</div>`;
    }

    /**
     * Create a danger/caution box with icon and message
     */
    static dangerBox(message: string, title: string = 'Caution'): string {
        return `<div style="font-size: 12px; background-color: #3e2d2d; border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px;">
    <strong>🛑 ${title}:</strong> ${message}
</div>`;
    }

    /**
     * Create a data table in markdown/HTML format
     */
    static table(headers: string[], rows: string[][]): string {
        const headerRow = `    <tr>${headers.map(h => `<th style="text-align: left;">${h}</th>`).join('')}</tr>`;
        const bodyRows = rows.map(row => 
            `    <tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
        ).join('\n');
        
        return `<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
${headerRow}
${bodyRows}
</table>`;
    }

    /**
     * Create a heading with icon
     */
    static heading(text: string, level: number = 3, icon?: string): string {
        const hashes = '#'.repeat(level);
        return `${hashes} ${icon ? icon + ' ' : ''}${text}`;
    }

    /**
     * Create a section divider
     */
    static divider(): string {
        return '\n---\n';
    }

    /**
     * Create a code block
     */
    static codeBlock(code: string, language: string = ''): string {
        return `\`\`\`${language}\n${code}\n\`\`\``;
    }

    /**
     * Create an inline code snippet
     */
    static inlineCode(text: string): string {
        return `\`${text}\``;
    }

    /**
     * Create a badge/label
     */
    static badge(text: string, color: 'success' | 'warning' | 'danger' | 'info' = 'info'): string {
        const colors = {
            success: '#2ecc71',
            warning: '#f39c12',
            danger: '#e74c3c',
            info: '#3498db',
        };
        return `<span style="background: ${colors[color]}; color: white; padding: 2px 8px; border-radius: 3px; font-size: 10px; font-weight: bold;">${text}</span>`;
    }
}

/**
 * HTML template builders for webviews and renderers
 */
export class HtmlBuilder {
    /**
     * Create a button element
     */
    static button(
        text: string,
        onClick?: string,
        variant: 'primary' | 'secondary' = 'primary'
    ): string {
        const styles = variant === 'primary' 
            ? styleToString(COMMON_STYLES.button)
            : styleToString({...COMMON_STYLES.button, ...COMMON_STYLES.buttonSecondary});
        
        return `<button style="${styles}"${onClick ? ` onclick="${onClick}"` : ''}>${text}</button>`;
    }

    /**
     * Create a styled container/card
     */
    static container(content: string, styles?: Partial<typeof COMMON_STYLES.container>): string {
        const finalStyles = styleToString({...COMMON_STYLES.container, ...styles});
        return `<div style="${finalStyles}">${content}</div>`;
    }

    /**
     * Create a collapsible header
     */
    static collapsibleHeader(
        title: string,
        summary: string,
        isSuccess: boolean = false
    ): string {
        const headerStyle = isSuccess
            ? {...COMMON_STYLES.header, ...COMMON_STYLES.successHeader}
            : COMMON_STYLES.header;
        
        return `<div style="${styleToString(headerStyle)}">
    <span style="font-size: 10px; transition: transform 0.2s; display: inline-block;">▼</span>
    <span style="font-weight: 600; text-transform: uppercase;">${title}</span>
    <span style="margin-left: auto; opacity: 0.7; font-size: 0.9em;">${summary}</span>
</div>`;
    }

    /**
     * Create a simple table
     */
    static table(headers: string[], rows: string[][]): string {
        const headerCells = headers.map(h => 
            `<th style="${styleToString(COMMON_STYLES.tableHeader)}">${h}</th>`
        ).join('');
        
        const bodyRows = rows.map(row => 
            `<tr>${row.map(cell => 
                `<td style="${styleToString(COMMON_STYLES.tableCell)}">${cell}</td>`
            ).join('')}</tr>`
        ).join('\n');

        return `<table style="${styleToString(COMMON_STYLES.table)}">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
</table>`;
    }
}

/**
 * Pre-built notebook templates
 */
export class NotebookTemplates {
    /**
     * Standard notebook header with database/table info
     */
    static header(
        title: string,
        description: string,
        icon: string = '📊'
    ): string {
        return `${MarkdownBuilder.heading(title, 3, icon)}

${MarkdownBuilder.infoBox(description)}`;
    }

    /**
     * Operations overview table
     */
    static operationsTable(operations: Array<{
        name: string;
        description: string;
        riskLevel: string;
    }>): string {
        return `${MarkdownBuilder.heading('Available Operations', 4, '🎯')}

${MarkdownBuilder.table(
    ['Operation', 'Description', 'Risk Level'],
    operations.map(op => [op.name, op.description, op.riskLevel])
)}`;
    }

    /**
     * Safety checklist
     */
    static safetyChecklist(items: string[]): string {
        return `${MarkdownBuilder.heading('Safety Checklist', 4, '🔍')}

${MarkdownBuilder.table(
    ['Check', 'Description'],
    items.map(item => ['✅', item])
)}`;
    }

    /**
     * Standard section header for notebooks
     */
    static sectionHeader(title: string, icon?: string): string {
        return MarkdownBuilder.heading(title, 5, icon);
    }
}
