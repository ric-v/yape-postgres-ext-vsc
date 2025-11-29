import type { ActivationFunction } from 'vscode-notebook-renderer';

export const activate: ActivationFunction = context => {
    return {
        renderOutputItem(data, element) {
            const json = data.json();

            if (!json) {
                element.innerText = 'No data';
                return;
            }

            const { columns, rows, rowCount, command } = json;

            const container = document.createElement('div');
            container.style.fontFamily = 'var(--vscode-font-family)';
            container.style.fontSize = 'var(--vscode-editor-font-size)';
            container.style.color = 'var(--vscode-editor-foreground)';
            container.style.padding = '8px 0';

            // Status line
            const status = document.createElement('div');
            status.style.marginBottom = '12px';
            status.style.fontSize = '0.9em';
            status.style.opacity = '0.8';
            status.style.display = 'flex';
            status.style.gap = '12px';
            status.style.alignItems = 'center';

            const cmdSpan = document.createElement('span');
            cmdSpan.textContent = command || 'QUERY';
            cmdSpan.style.fontWeight = '500';
            cmdSpan.style.color = 'var(--vscode-textLink-foreground)';

            const countSpan = document.createElement('span');
            countSpan.textContent = `${rowCount} rows`;

            status.appendChild(cmdSpan);
            status.appendChild(countSpan);
            container.appendChild(status);

            if (rows && rows.length > 0) {
                const tableContainer = document.createElement('div');
                tableContainer.style.overflowX = 'auto';
                tableContainer.style.border = '1px solid var(--vscode-widget-border)';
                tableContainer.style.borderRadius = '6px';
                tableContainer.style.background = 'var(--vscode-editor-background)';

                const table = document.createElement('table');
                table.style.width = '100%';
                table.style.borderCollapse = 'collapse';
                table.style.fontSize = '0.9em';
                table.style.whiteSpace = 'nowrap';

                // Header
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                headerRow.style.background = 'var(--vscode-list-hoverBackground)';

                columns.forEach((col: string) => {
                    const th = document.createElement('th');
                    th.textContent = col;
                    th.style.textAlign = 'left';
                    th.style.padding = '8px 12px';
                    th.style.borderBottom = '1px solid var(--vscode-widget-border)';
                    th.style.fontWeight = '500';
                    th.style.color = 'var(--vscode-descriptionForeground)';
                    th.style.position = 'sticky';
                    th.style.top = '0';
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);
                table.appendChild(thead);

                // Body
                const tbody = document.createElement('tbody');
                rows.forEach((row: any, index: number) => {
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid var(--vscode-widget-border)';
                    if (index % 2 === 1) {
                        tr.style.background = 'rgba(128, 128, 128, 0.02)';
                    }

                    columns.forEach((col: string) => {
                        const td = document.createElement('td');
                        const val = row[col];

                        if (val === null) {
                            td.textContent = 'NULL';
                            td.style.color = 'var(--vscode-descriptionForeground)';
                            td.style.fontStyle = 'italic';
                        } else if (typeof val === 'object') {
                            td.textContent = JSON.stringify(val);
                            td.style.fontFamily = 'var(--vscode-editor-font-family)';
                        } else {
                            td.textContent = String(val);
                        }

                        td.style.padding = '8px 12px';
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });
                table.appendChild(tbody);
                tableContainer.appendChild(table);
                container.appendChild(tableContainer);
            } else {
                const empty = document.createElement('div');
                empty.textContent = 'No results found';
                empty.style.fontStyle = 'italic';
                empty.style.opacity = '0.7';
                container.appendChild(empty);
            }

            element.appendChild(container);
        }
    };
};
