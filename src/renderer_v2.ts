import type { ActivationFunction } from 'vscode-notebook-renderer';

export const activate: ActivationFunction = context => {
    return {
        renderOutputItem(data, element) {
            const json = data.json();

            if (!json) {
                element.innerText = 'No data';
                return;
            }

            const { columns, rows, rowCount, command, notices, executionTime, tableInfo, success, columnTypes } = json;
            // Deep copy rows to allow modifications without affecting originals
            const originalRows: any[] = rows ? JSON.parse(JSON.stringify(rows)) : [];
            let currentRows: any[] = rows ? JSON.parse(JSON.stringify(rows)) : [];
            const selectedIndices = new Set<number>();
            
            // Track modified cells: Map of "rowIndex-columnName" -> { originalValue, newValue }
            const modifiedCells = new Map<string, { originalValue: any, newValue: any }>();
            let currentlyEditingCell: HTMLElement | null = null;
            
            // Track date/time column display mode: true = local time, false = original value
            const dateTimeDisplayMode = new Map<string, boolean>();

            // ... (rest of the code)

            // Main Container (Collapsible Wrapper)
            const mainContainer = document.createElement('div');
            mainContainer.style.fontFamily = 'var(--vscode-font-family), "Segoe UI", "Helvetica Neue", sans-serif';
            mainContainer.style.fontSize = '13px';
            mainContainer.style.color = 'var(--vscode-editor-foreground)';
            mainContainer.style.border = '1px solid var(--vscode-widget-border)';
            mainContainer.style.borderRadius = '4px';
            mainContainer.style.overflow = 'hidden';
            mainContainer.style.marginBottom = '8px';

            // Header
            const header = document.createElement('div');
            header.style.padding = '6px 12px';
            // Use green background for successful queries, neutral for others
            if (success) {
                header.style.background = 'rgba(115, 191, 105, 0.25)'; // Green tint for success
                header.style.borderLeft = '4px solid var(--vscode-testing-iconPassed)';
            } else {
                header.style.background = 'var(--vscode-editor-background)';
            }
            header.style.borderBottom = '1px solid var(--vscode-widget-border)';
            header.style.cursor = 'pointer';
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.gap = '8px';
            header.style.userSelect = 'none';

            const chevron = document.createElement('span');
            chevron.textContent = '▼'; // Expanded by default
            chevron.style.fontSize = '10px';
            chevron.style.transition = 'transform 0.2s';
            chevron.style.display = 'inline-block';

            const title = document.createElement('span');
            title.textContent = command || 'QUERY';
            title.style.fontWeight = '600';
            title.style.textTransform = 'uppercase';

            const summary = document.createElement('span');
            summary.style.marginLeft = 'auto';
            summary.style.opacity = '0.7';
            summary.style.fontSize = '0.9em';

            let summaryText = '';
            if (rowCount !== undefined && rowCount !== null) {
                summaryText += `${rowCount} rows`;
            }
            if (notices && notices.length > 0) {
                summaryText += summaryText ? `, ${notices.length} messages` : `${notices.length} messages`;
            }
            if (executionTime !== undefined) {
                summaryText += summaryText ? `, ${executionTime.toFixed(3)}s` : `${executionTime.toFixed(3)}s`;
            }
            if (!summaryText) summaryText = 'No results';
            summary.textContent = summaryText;

            header.appendChild(chevron);
            header.appendChild(title);
            header.appendChild(summary);
            mainContainer.appendChild(header);

            // Content Container
            const contentContainer = document.createElement('div');
            contentContainer.style.display = 'flex'; // Expanded by default
            contentContainer.style.flexDirection = 'column';
            contentContainer.style.height = '100%'; // Added to ensure content takes full height if needed
            mainContainer.appendChild(contentContainer);

            // Toggle Logic
            let isExpanded = true;
            header.addEventListener('click', () => {
                isExpanded = !isExpanded;
                contentContainer.style.display = isExpanded ? 'flex' : 'none';
                chevron.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
                header.style.borderBottom = isExpanded ? '1px solid var(--vscode-widget-border)' : 'none';
            });

            // Messages Section
            if (notices && notices.length > 0) {
                const messagesContainer = document.createElement('div');
                messagesContainer.style.padding = '8px 12px';
                messagesContainer.style.background = 'var(--vscode-textBlockQuote-background)';
                messagesContainer.style.borderLeft = '4px solid var(--vscode-textBlockQuote-border)';
                messagesContainer.style.margin = '8px 12px 0 12px'; // Add margin
                messagesContainer.style.fontFamily = 'var(--vscode-editor-font-family)';
                messagesContainer.style.whiteSpace = 'pre-wrap';
                messagesContainer.style.fontSize = '12px';

                const title = document.createElement('div');
                title.textContent = 'Messages';
                title.style.fontWeight = '600';
                title.style.marginBottom = '4px';
                title.style.opacity = '0.8';
                messagesContainer.appendChild(title);

                notices.forEach((msg: string) => {
                    const msgDiv = document.createElement('div');
                    msgDiv.textContent = msg;
                    msgDiv.style.marginBottom = '2px';
                    messagesContainer.appendChild(msgDiv);
                });

                contentContainer.appendChild(messagesContainer);
            }

            // Actions Bar
            const actionsBar = document.createElement('div');
            actionsBar.style.display = 'none'; // Hidden by default
            actionsBar.style.padding = '8px 12px';
            actionsBar.style.gap = '8px';
            actionsBar.style.alignItems = 'center';
            actionsBar.style.borderBottom = '1px solid var(--vscode-panel-border)';
            actionsBar.style.background = 'var(--vscode-editor-background)';

            const createButton = (text: string, primary: boolean = false) => {
                const btn = document.createElement('button');
                btn.textContent = text;
                btn.style.background = primary ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)';
                btn.style.color = primary ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)';
                btn.style.border = 'none';
                btn.style.padding = '4px 12px';
                btn.style.cursor = 'pointer';
                btn.style.borderRadius = '2px';
                btn.style.fontSize = '12px';
                btn.style.fontWeight = '500';
                return btn;
            };
            const selectAllBtn = createButton('Select All', true);
            selectAllBtn.addEventListener('click', () => {
                const allSelected = selectedIndices.size === currentRows.length;

                if (allSelected) {
                    selectedIndices.clear();
                    selectAllBtn.innerText = 'Select All';
                } else {
                    currentRows.forEach((_, i) => selectedIndices.add(i));
                    selectAllBtn.innerText = 'Deselect All';
                }

                updateTable();
                updateActionsVisibility();
            });
            actionsBar.appendChild(selectAllBtn);

            const copyBtn = createButton('Copy Selected', true);
            copyBtn.addEventListener('click', async () => {
                if (selectedIndices.size === 0) return;

                const selectedRows = currentRows.filter((_, i) => selectedIndices.has(i));

                // Convert to CSV
                const header = columns.map((c: string) => `"${c.replace(/"/g, '""')}"`).join(',');
                const body = selectedRows.map(row => {
                    return columns.map((col: string) => {
                        const val = row[col];
                        if (val === null || val === undefined) return '';
                        const str = String(val);
                        // Quote strings if they contain commas, quotes, or newlines
                        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                            return `"${str.replace(/"/g, '""')}"`;
                        }
                        return str;
                    }).join(',');
                }).join('\n');

                const csv = `${header}\n${body}`;

                navigator.clipboard.writeText(csv).then(() => {
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = 'Copied!';
                    copyBtn.style.background = 'var(--vscode-debugIcon-startForeground)';
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.style.background = 'var(--vscode-button-background)';
                    }, 2000);
                }).catch((err: Error) => {
                    console.error('Failed to copy:', err);
                    copyBtn.textContent = 'Failed';
                    copyBtn.style.background = 'var(--vscode-errorForeground)';
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy Selected';
                        copyBtn.style.background = 'var(--vscode-button-background)';
                    }, 2000);
                });
            });

            const deleteBtn = createButton(tableInfo ? 'Script Delete' : 'Remove from View', !!tableInfo);

            deleteBtn.addEventListener('click', () => {
                if (selectedIndices.size === 0) return;

                if (tableInfo) {
                    // Send script_delete message to kernel
                    const selectedRows = currentRows.filter((_, i) => selectedIndices.has(i));
                    if (context.postMessage) {
                        context.postMessage({
                            type: 'script_delete',
                            schema: tableInfo.schema,
                            table: tableInfo.table,
                            primaryKeys: tableInfo.primaryKeys,
                            rows: selectedRows,
                            cellIndex: (json as any).cellIndex // Access cellIndex from JSON
                        });
                    }
                } else {
                    // Fallback to remove from view
                    if (confirm('Remove selected rows from this view?')) {
                        currentRows = currentRows.filter((_, i) => !selectedIndices.has(i));
                        selectedIndices.clear();
                        updateTable();
                        updateActionsVisibility();
                    }
                }
            });

            const exportBtn = createButton('Export ▼', true);
            exportBtn.style.position = 'relative';

            exportBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                // Remove existing dropdown if any
                const existing = document.querySelector('.export-dropdown');
                if (existing) {
                    existing.remove();
                    return;
                }

                const menu = document.createElement('div');
                menu.className = 'export-dropdown';
                menu.style.position = 'absolute';
                menu.style.top = '100%';
                menu.style.left = '0';
                menu.style.background = 'var(--vscode-menu-background)';
                menu.style.border = '1px solid var(--vscode-menu-border)';
                menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                menu.style.zIndex = '100';
                menu.style.minWidth = '150px';
                menu.style.borderRadius = '3px';
                menu.style.padding = '4px 0';

                const createMenuItem = (label: string, onClick: () => void) => {
                    const item = document.createElement('div');
                    item.textContent = label;
                    item.style.padding = '6px 12px';
                    item.style.cursor = 'pointer';
                    item.style.color = 'var(--vscode-menu-foreground)';
                    item.style.fontSize = '12px';

                    item.addEventListener('mouseenter', () => {
                        item.style.background = 'var(--vscode-menu-selectionBackground)';
                        item.style.color = 'var(--vscode-menu-selectionForeground)';
                    });
                    item.addEventListener('mouseleave', () => {
                        item.style.background = 'transparent';
                        item.style.color = 'var(--vscode-menu-foreground)';
                    });
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        onClick();
                        menu.remove();
                    });
                    return item;
                };

                const downloadFile = (content: string, filename: string, type: string) => {
                    const blob = new Blob([content], { type });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                };

                const stringifyValue = (val: any): string => {
                    if (val === null || val === undefined) return '';
                    if (typeof val === 'object') return JSON.stringify(val);
                    return String(val);
                };

                const getCSV = () => {
                    const header = columns.map((c: string) => `"${c.replace(/"/g, '""')}"`).join(',');
                    const body = currentRows.map(row => {
                        return columns.map((col: string) => {
                            const val = row[col];
                            const str = stringifyValue(val);
                            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                return `"${str.replace(/"/g, '""')}"`;
                            }
                            return str;
                        }).join(',');
                    }).join('\n');
                    return `${header}\n${body}`;
                };

                const getMarkdown = () => {
                    const header = `| ${columns.join(' | ')} |`;
                    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
                    const body = currentRows.map(row => {
                        return `| ${columns.map((col: string) => {
                            const val = row[col];
                            if (val === null || val === undefined) return 'NULL';
                            const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
                            return str.replace(/\|/g, '\\|').replace(/\n/g, ' ');
                        }).join(' | ')} |`;
                    }).join('\n');
                    return `${header}\n${separator}\n${body}`;
                };

                const getSQLInsert = () => {
                    if (!tableInfo) return '-- Table information not available for INSERT script';
                    const tableName = `"${tableInfo.schema}"."${tableInfo.table}"`;
                    const cols = columns.map((c: string) => `"${c}"`).join(', ');

                    return currentRows.map((row: any) => {
                        const values = columns.map((col: string) => {
                            const val = row[col];
                            if (val === null || val === undefined) return 'NULL';
                            if (typeof val === 'number') return val;
                            if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
                            const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
                            return `'${str.replace(/'/g, "''")}'`;
                        }).join(', ');
                        return `INSERT INTO ${tableName} (${cols}) VALUES (${values});`;
                    }).join('\n');
                };

                const getExcel = () => {
                    // Simple HTML-based Excel format
                    const header = columns.map((c: string) => `<th>${c}</th>`).join('');
                    const body = currentRows.map(row => {
                        const cells = columns.map((col: string) => {
                            const val = row[col];
                            return `<td>${stringifyValue(val)}</td>`;
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
                        </html>
                    `;
                };

                menu.appendChild(createMenuItem('Save as CSV', () => {
                    downloadFile(getCSV(), `export_${Date.now()}.csv`, 'text/csv');
                }));

                menu.appendChild(createMenuItem('Save as Excel', () => {
                    downloadFile(getExcel(), `export_${Date.now()}.xls`, 'application/vnd.ms-excel');
                }));

                menu.appendChild(createMenuItem('Save as JSON', () => {
                    const jsonStr = JSON.stringify(currentRows, null, 2);
                    downloadFile(jsonStr, `export_${Date.now()}.json`, 'application/json');
                }));

                menu.appendChild(createMenuItem('Save as Markdown', () => {
                    downloadFile(getMarkdown(), `export_${Date.now()}.md`, 'text/markdown');
                }));

                if (tableInfo) {
                    menu.appendChild(createMenuItem('Copy SQL INSERT', () => {
                        navigator.clipboard.writeText(getSQLInsert()).then(() => {
                            exportBtn.textContent = 'Copied!';
                            setTimeout(() => exportBtn.textContent = 'Export ▼', 2000);
                        });
                    }));
                }

                menu.appendChild(createMenuItem('Copy to Clipboard', () => {
                    navigator.clipboard.writeText(getCSV()).then(() => {
                        exportBtn.textContent = 'Copied!';
                        setTimeout(() => exportBtn.textContent = 'Export ▼', 2000);
                    });
                }));

                exportBtn.appendChild(menu);

                // Close menu when clicking outside
                const closeMenu = () => {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                };
                setTimeout(() => document.addEventListener('click', closeMenu), 0);
            });

            actionsBar.appendChild(selectAllBtn);
            actionsBar.appendChild(copyBtn);
            actionsBar.appendChild(exportBtn);
            actionsBar.appendChild(deleteBtn);
            
            // Save Changes button (hidden by default)
            const saveBtn = createButton('💾 Save Changes', true);
            saveBtn.style.display = 'none';
            saveBtn.style.backgroundColor = 'var(--vscode-debugIcon-startForeground)';
            saveBtn.addEventListener('click', () => {
                if (!tableInfo || modifiedCells.size === 0) return;
                
                // Generate UPDATE statements for modified rows
                const updates: string[] = [];
                const modifiedRowIndices = new Set<number>();
                
                modifiedCells.forEach((change, key) => {
                    const dashIndex = key.indexOf('-');
                    const rowIndexStr = key.substring(0, dashIndex);
                    modifiedRowIndices.add(parseInt(rowIndexStr));
                });
                
                modifiedRowIndices.forEach(rowIndex => {
                    const row = currentRows[rowIndex];
                    const setClauses: string[] = [];
                    
                    // Get all modified columns for this row
                    columns.forEach((col: string) => {
                        const cellKey = `${rowIndex}-${col}`;
                        if (modifiedCells.has(cellKey)) {
                            const { newValue } = modifiedCells.get(cellKey)!;
                            const formattedValue = formatValueForSQL(newValue, columnTypes?.[col]);
                            setClauses.push(`"${col}" = ${formattedValue}`);
                        }
                    });
                    
                    if (setClauses.length > 0) {
                        // Build WHERE clause using primary keys
                        const whereClauses = tableInfo.primaryKeys.map((pk: string) => {
                            const pkValue = originalRows[rowIndex][pk]; // Use original row value for PK
                            const formattedPkValue = formatValueForSQL(pkValue, columnTypes?.[pk]);
                            return `"${pk}" = ${formattedPkValue}`;
                        });
                        
                        const tableName = `"${tableInfo.schema}"."${tableInfo.table}"`;
                        updates.push(`UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')};`);
                    }
                });
                
                if (updates.length > 0 && context.postMessage) {
                    // Show saving state
                    saveBtn.textContent = '⏳ Saving...';
                    saveBtn.style.opacity = '0.7';
                    (saveBtn as HTMLButtonElement).disabled = true;
                    
                    console.log('Renderer: Sending execute_update_background message', { updates, cellIndex: (json as any).cellIndex });
                    console.log('Renderer: context.postMessage is available:', !!context.postMessage);
                    
                    const messageData = {
                        type: 'execute_update_background',
                        statements: updates,
                        cellIndex: (json as any).cellIndex
                    };
                    console.log('Renderer: Message data:', JSON.stringify(messageData));
                    
                    try {
                        context.postMessage(messageData);
                        console.log('Renderer: postMessage called successfully');
                    } catch (err: any) {
                        console.error('Renderer: postMessage error:', err);
                    }
                    
                    // Clear modifications after sending (kernel will handle execution)
                    modifiedCells.clear();
                    
                    // Reset button after a short delay
                    setTimeout(() => {
                        saveBtn.textContent = '💾 Save Changes';
                        saveBtn.style.opacity = '1';
                        (saveBtn as HTMLButtonElement).disabled = false;
                        updateSaveButtonVisibility();
                        updateTable();
                    }, 1500);
                } else if (updates.length > 0) {
                    console.error('Renderer: postMessage not available');
                    // Fallback: copy to clipboard
                    const query = updates.join('\n');
                    navigator.clipboard.writeText(query).then(() => {
                        alert('postMessage not available. UPDATE statements copied to clipboard. Please execute manually.');
                    });
                }
            });
            actionsBar.appendChild(saveBtn);
            
            // Discard Changes button (hidden by default)
            const discardBtn = createButton('✕ Discard', false);
            discardBtn.style.display = 'none';
            discardBtn.addEventListener('click', () => {
                // Restore original values
                modifiedCells.forEach((change, key) => {
                    const dashIndex = key.indexOf('-');
                    const rowIndexStr = key.substring(0, dashIndex);
                    const colName = key.substring(dashIndex + 1);
                    const rowIndex = parseInt(rowIndexStr);
                    currentRows[rowIndex][colName] = change.originalValue;
                });
                modifiedCells.clear();
                updateSaveButtonVisibility();
                updateTable();
            });
            actionsBar.appendChild(discardBtn);
            
            // Helper to format value for SQL
            const formatValueForSQL = (val: any, colType?: string): string => {
                if (val === null || val === undefined || val === 'NULL') return 'NULL';
                if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
                if (typeof val === 'number') return String(val);
                if (colType) {
                    const lowerType = colType.toLowerCase();
                    
                    // Handle UUID type
                    if (lowerType === 'uuid') {
                        return `'${String(val).replace(/'/g, "''")}'::uuid`;
                    }
                    
                    // Handle JSON/JSONB types - need to cast explicitly
                    if (lowerType === 'json' || lowerType === 'jsonb') {
                        const jsonStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
                        return `'${jsonStr.replace(/'/g, "''")}'::${lowerType}`;
                    }
                    
                    // Handle array types (e.g., _int4, _text, integer[], text[])
                    if (lowerType.startsWith('_') || lowerType.includes('[]')) {
                        if (Array.isArray(val)) {
                            // Format as PostgreSQL array literal: '{1,2,3}'
                            const arrayStr = val.map(v => {
                                if (v === null) return 'NULL';
                                if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`;
                                return String(v);
                            }).join(',');
                            return `'{${arrayStr}}'`;
                        }
                        // If it's a string representation of array, pass through
                        if (typeof val === 'string') {
                            // Convert JSON array notation to PostgreSQL array
                            if (val.startsWith('[')) {
                                try {
                                    const arr = JSON.parse(val);
                                    const arrayStr = arr.map((v: any) => {
                                        if (v === null) return 'NULL';
                                        if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`;
                                        return String(v);
                                    }).join(',');
                                    return `'{${arrayStr}}'`;
                                } catch {
                                    return `'${val.replace(/'/g, "''")}'`;
                                }
                            }
                            // Already in PostgreSQL format like {1,2,3}
                            if (val.startsWith('{')) {
                                return `'${val.replace(/'/g, "''")}'`;
                            }
                        }
                    }
                    
                    // Handle numeric types
                    if (lowerType.includes('int') || lowerType === 'numeric' || lowerType === 'decimal' || lowerType === 'real' || lowerType.includes('float') || lowerType.includes('double')) {
                        const num = parseFloat(val);
                        if (!isNaN(num)) return String(num);
                    }
                    
                    // Handle boolean types
                    if (lowerType === 'bool' || lowerType === 'boolean') {
                        return val === 'true' || val === true ? 'TRUE' : 'FALSE';
                    }
                }
                // Handle arrays without type info
                if (Array.isArray(val)) {
                    const arrayStr = val.map(v => {
                        if (v === null) return 'NULL';
                        if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`;
                        return String(v);
                    }).join(',');
                    return `'{${arrayStr}}'`;
                }
                // Handle objects (likely JSON) without explicit type
                if (typeof val === 'object') {
                    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
                }
                // Default: treat as string
                return `'${String(val).replace(/'/g, "''")}'`;
            };
            
            // Update save button visibility
            const updateSaveButtonVisibility = () => {
                const hasChanges = modifiedCells.size > 0 && tableInfo;
                saveBtn.style.display = hasChanges ? 'block' : 'none';
                discardBtn.style.display = hasChanges ? 'block' : 'none';
                if (hasChanges) {
                    saveBtn.textContent = `💾 Save Changes (${modifiedCells.size})`;
                }
            };
            
            contentContainer.appendChild(actionsBar);

            const tableContainer = document.createElement('div');
            tableContainer.style.overflow = 'auto';
            tableContainer.style.flex = '1';
            tableContainer.style.position = 'relative';
            tableContainer.style.maxHeight = '500px'; // Limit height for scrolling within the block
            contentContainer.appendChild(tableContainer);

            const updateActionsVisibility = () => {
                actionsBar.style.display = currentRows.length > 0 ? 'flex' : 'none';
                copyBtn.style.display = selectedIndices.size > 0 ? 'block' : 'none';
                deleteBtn.style.display = selectedIndices.size > 0 ? 'block' : 'none';

                if (selectedIndices.size === currentRows.length && currentRows.length > 0) {
                    selectAllBtn.textContent = 'Deselect All';
                } else {
                    selectAllBtn.textContent = 'Select All';
                }
            };

            // Helper to get timezone abbreviation
            const getTimezoneAbbr = (date: Date): string => {
                // Try to get timezone abbreviation from toLocaleString
                const parts = date.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ');
                return parts[parts.length - 1] || '';
            };

            const formatValue = (val: any, colType?: string): { text: string, isNull: boolean, type: string } => {
                if (val === null) return { text: 'NULL', isNull: true, type: 'null' };
                if (typeof val === 'boolean') return { text: val ? 'TRUE' : 'FALSE', isNull: false, type: 'boolean' };
                if (typeof val === 'number') return { text: String(val), isNull: false, type: 'number' };
                if (val instanceof Date) {
                    const tz = getTimezoneAbbr(val);
                    return { text: `${val.toLocaleString()} ${tz}`, isNull: false, type: 'date' };
                }
                
                // Handle date/timestamp strings based on column type or string pattern
                if (typeof val === 'string' && colType) {
                    const lowerType = colType.toLowerCase();
                    // Check if it's a timestamp or date type
                    if (lowerType.includes('timestamp') || lowerType === 'timestamptz') {
                        const date = new Date(val);
                        if (!isNaN(date.getTime())) {
                            const tz = getTimezoneAbbr(date);
                            return { text: `${date.toLocaleString()} ${tz}`, isNull: false, type: 'timestamp' };
                        }
                    } else if (lowerType === 'date') {
                        const date = new Date(val);
                        if (!isNaN(date.getTime())) {
                            const tz = getTimezoneAbbr(date);
                            return { text: `${date.toLocaleDateString()} ${tz}`, isNull: false, type: 'date' };
                        }
                    } else if (lowerType === 'time' || lowerType === 'timetz') {
                        // For time-only fields, just format as time
                        // Time strings like "14:30:00" should be displayed as local time format
                        const today = new Date();
                        const timeDate = new Date(`${today.toDateString()} ${val}`);
                        if (!isNaN(timeDate.getTime())) {
                            const tz = getTimezoneAbbr(timeDate);
                            return { text: `${timeDate.toLocaleTimeString()} ${tz}`, isNull: false, type: 'time' };
                        }
                    }
                }
                
                // Handle JSON/JSONB types
                if (colType && (colType.toLowerCase() === 'json' || colType.toLowerCase() === 'jsonb')) {
                    return { text: JSON.stringify(val), isNull: false, type: 'json' };
                }
                
                if (typeof val === 'object') return { text: JSON.stringify(val), isNull: false, type: 'object' };
                return { text: String(val), isNull: false, type: 'string' };
            };

            // JSON Modal viewer
            const showJsonModal = (jsonValue: any, columnName: string) => {
                // Remove existing modal if any
                const existingModal = mainContainer.querySelector('.json-modal-overlay');
                if (existingModal) existingModal.remove();

                const overlay = document.createElement('div');
                overlay.className = 'json-modal-overlay';
                overlay.style.position = 'absolute';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.right = '0';
                overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
                overlay.style.zIndex = '100';
                overlay.style.padding = '8px';

                const modal = document.createElement('div');
                modal.style.backgroundColor = 'var(--vscode-editor-background)';
                modal.style.border = '1px solid var(--vscode-widget-border)';
                modal.style.borderRadius = '8px';
                modal.style.width = '100%';
                modal.style.maxHeight = '400px';
                modal.style.display = 'flex';
                modal.style.flexDirection = 'column';
                modal.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';

                // Header
                const header = document.createElement('div');
                header.style.display = 'flex';
                header.style.justifyContent = 'space-between';
                header.style.alignItems = 'center';
                header.style.padding = '12px 16px';
                header.style.borderBottom = '1px solid var(--vscode-widget-border)';
                header.style.backgroundColor = 'var(--vscode-sideBar-background)';
                header.style.borderRadius = '8px 8px 0 0';

                const titleSpan = document.createElement('span');
                titleSpan.textContent = `📋 ${columnName}`;
                titleSpan.style.fontWeight = '600';
                titleSpan.style.fontSize = '14px';

                const buttonContainer = document.createElement('div');
                buttonContainer.style.display = 'flex';
                buttonContainer.style.gap = '8px';

                const copyBtn = document.createElement('button');
                copyBtn.textContent = 'Copy';
                copyBtn.style.background = 'var(--vscode-button-background)';
                copyBtn.style.color = 'var(--vscode-button-foreground)';
                copyBtn.style.border = 'none';
                copyBtn.style.padding = '4px 12px';
                copyBtn.style.borderRadius = '4px';
                copyBtn.style.cursor = 'pointer';
                copyBtn.style.fontSize = '12px';
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(JSON.stringify(jsonValue, null, 2)).then(() => {
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => copyBtn.textContent = 'Copy', 2000);
                    });
                });

                const closeBtn = document.createElement('button');
                closeBtn.textContent = '✕';
                closeBtn.style.background = 'transparent';
                closeBtn.style.color = 'var(--vscode-foreground)';
                closeBtn.style.border = 'none';
                closeBtn.style.padding = '4px 8px';
                closeBtn.style.cursor = 'pointer';
                closeBtn.style.fontSize = '16px';
                closeBtn.style.opacity = '0.7';
                closeBtn.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
                closeBtn.addEventListener('mouseleave', () => closeBtn.style.opacity = '0.7');
                closeBtn.addEventListener('click', () => overlay.remove());

                buttonContainer.appendChild(copyBtn);
                buttonContainer.appendChild(closeBtn);
                header.appendChild(titleSpan);
                header.appendChild(buttonContainer);

                // Content
                const content = document.createElement('div');
                content.style.padding = '16px';
                content.style.overflow = 'auto';
                content.style.flex = '1';

                const pre = document.createElement('pre');
                pre.style.margin = '0';
                pre.style.fontFamily = 'var(--vscode-editor-font-family)';
                pre.style.fontSize = '13px';
                pre.style.lineHeight = '1.5';
                pre.style.whiteSpace = 'pre-wrap';
                pre.style.wordBreak = 'break-word';

                // Syntax highlight the JSON
                const formattedJson = JSON.stringify(jsonValue, null, 2);
                const highlighted = formattedJson
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"([^"]+)":/g, '<span style="color: var(--vscode-symbolIcon-propertyForeground);">"$1"</span>:')
                    .replace(/: "([^"]*)"/g, ': <span style="color: var(--vscode-symbolIcon-stringForeground);">"$1"</span>')
                    .replace(/: (\d+\.?\d*)/g, ': <span style="color: var(--vscode-symbolIcon-numberForeground);">$1</span>')
                    .replace(/: (true|false)/g, ': <span style="color: var(--vscode-symbolIcon-booleanForeground);">$1</span>')
                    .replace(/: (null)/g, ': <span style="color: var(--vscode-descriptionForeground);">$1</span>');

                pre.innerHTML = highlighted;
                content.appendChild(pre);

                modal.appendChild(header);
                modal.appendChild(content);
                overlay.appendChild(modal);

                // Close on overlay click
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) overlay.remove();
                });

                // Close on Escape key
                const escHandler = (e: KeyboardEvent) => {
                    if (e.key === 'Escape') {
                        overlay.remove();
                        document.removeEventListener('keydown', escHandler);
                    }
                };
                document.addEventListener('keydown', escHandler);

                // Insert at the top of mainContainer
                mainContainer.style.position = 'relative';
                mainContainer.insertBefore(overlay, mainContainer.firstChild);
            };

            const updateTable = () => {
                tableContainer.innerHTML = '';
                // countSpan.textContent = `${currentRows.length} rows`; // Moved to header summary

                if (currentRows.length === 0) {
                    const empty = document.createElement('div');
                    empty.textContent = 'No results found';
                    empty.style.fontStyle = 'italic';
                    empty.style.opacity = '0.7';
                    empty.style.padding = '20px';
                    empty.style.textAlign = 'center';
                    tableContainer.appendChild(empty);
                    return;
                }

                const table = document.createElement('table');
                table.style.width = '100%';
                table.style.borderCollapse = 'separate';
                table.style.borderSpacing = '0';
                table.style.fontSize = '13px';
                table.style.whiteSpace = 'nowrap';
                table.style.lineHeight = '1.5';

                const thead = document.createElement('thead');
                const tbody = document.createElement('tbody');

                // Header
                const headerRow = document.createElement('tr');

                // Selection Header
                const selectTh = document.createElement('th');
                selectTh.style.width = '30px';
                selectTh.style.position = 'sticky';
                selectTh.style.top = '0';
                selectTh.style.background = 'var(--vscode-editor-background)';
                selectTh.style.borderBottom = '1px solid var(--vscode-widget-border)';
                selectTh.style.zIndex = '10';
                headerRow.appendChild(selectTh);

                columns.forEach((col: string) => {
                    const th = document.createElement('th');
                    th.style.textAlign = 'left';
                    th.style.padding = '8px 12px';
                    th.style.borderBottom = '1px solid var(--vscode-widget-border)';
                    th.style.borderRight = '1px solid var(--vscode-widget-border)';
                    th.style.fontWeight = '600';
                    th.style.color = 'var(--vscode-editor-foreground)';
                    th.style.position = 'sticky';
                    th.style.top = '0';
                    th.style.background = 'var(--vscode-editor-background)';
                    th.style.zIndex = '10';
                    th.style.userSelect = 'none';

                    // Column name container
                    const colNameContainer = document.createElement('div');
                    colNameContainer.style.display = 'flex';
                    colNameContainer.style.alignItems = 'center';
                    colNameContainer.style.gap = '4px';

                    // Column name
                    const colName = document.createElement('span');
                    colName.textContent = col;
                    colNameContainer.appendChild(colName);

                    th.appendChild(colNameContainer);

                    // Column type container (with icons and toggle for date/time)
                    if (columnTypes && columnTypes[col]) {
                        const colTypeContainer = document.createElement('div');
                        colTypeContainer.style.display = 'flex';
                        colTypeContainer.style.alignItems = 'center';
                        colTypeContainer.style.gap = '4px';
                        colTypeContainer.style.marginTop = '2px';
                        
                        const colType = document.createElement('span');
                        colType.textContent = columnTypes[col];
                        colType.style.fontSize = '0.8em';
                        colType.style.fontWeight = '500';
                        colType.style.color = 'var(--vscode-descriptionForeground)';
                        colType.style.opacity = '0.7';
                        colTypeContainer.appendChild(colType);
                        
                        // Primary key icon
                        const isPrimaryKey = tableInfo?.primaryKeys?.includes(col);
                        if (isPrimaryKey) {
                            const pkIcon = document.createElement('span');
                            pkIcon.textContent = '🔑';
                            pkIcon.style.fontSize = '0.85em';
                            pkIcon.title = 'Primary Key';
                            colTypeContainer.appendChild(pkIcon);
                        }

                        // Unique key icon (only if not already a primary key)
                        const isUniqueKey = tableInfo?.uniqueKeys?.includes(col);
                        if (isUniqueKey && !isPrimaryKey) {
                            const ukIcon = document.createElement('span');
                            ukIcon.textContent = '🔐';
                            ukIcon.style.fontSize = '0.85em';
                            ukIcon.title = 'Unique Key';
                            colTypeContainer.appendChild(ukIcon);
                        }
                        
                        // Add toggle button for date/time columns
                        const lowerColType = columnTypes[col].toLowerCase();
                        const isDateTimeCol = lowerColType.includes('timestamp') || lowerColType === 'timestamptz' || 
                                              lowerColType === 'date' || lowerColType === 'time' || lowerColType === 'timetz';
                        
                        if (isDateTimeCol) {
                            // Initialize display mode if not set
                            if (!dateTimeDisplayMode.has(col)) {
                                dateTimeDisplayMode.set(col, true); // true = local time
                            }
                            
                            const toggleBtn = document.createElement('button');
                            const isLocal = dateTimeDisplayMode.get(col);
                            toggleBtn.textContent = isLocal ? '🌐' : '🏠';
                            toggleBtn.style.background = 'var(--vscode-button-secondaryBackground)';
                            toggleBtn.style.color = 'var(--vscode-button-secondaryForeground)';
                            toggleBtn.style.border = 'none';
                            toggleBtn.style.borderRadius = '3px';
                            toggleBtn.style.padding = '1px 4px';
                            toggleBtn.style.cursor = 'pointer';
                            toggleBtn.style.fontSize = '10px';
                            toggleBtn.style.lineHeight = '1';
                            toggleBtn.title = isLocal ? 'Showing local time - Click to show original' : 'Showing original - Click to show local time';
                            
                            toggleBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                const currentMode = dateTimeDisplayMode.get(col) ?? true;
                                dateTimeDisplayMode.set(col, !currentMode);
                                updateTable(); // Re-render the table
                            });
                            
                            colTypeContainer.appendChild(toggleBtn);
                        }
                        
                        th.appendChild(colTypeContainer);
                    }

                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);

                // Body
                currentRows.forEach((row: any, index: number) => {
                    const tr = document.createElement('tr');
                    tr.style.cursor = 'pointer';

                    const updateRowStyle = () => {
                        if (selectedIndices.has(index)) {
                            tr.style.background = 'var(--vscode-list-activeSelectionBackground)';
                            tr.style.color = 'var(--vscode-list-activeSelectionForeground)';
                        } else {
                            tr.style.background = index % 2 === 0 ? 'transparent' : 'var(--vscode-keybindingTable-rowsBackground)'; // Alternating colors if available, or just transparent
                            tr.style.color = 'var(--vscode-editor-foreground)';
                        }
                    };
                    updateRowStyle();

                    tr.addEventListener('click', (e) => {
                        if (e.ctrlKey || e.metaKey) {
                            if (selectedIndices.has(index)) {
                                selectedIndices.delete(index);
                            } else {
                                selectedIndices.add(index);
                            }
                        } else {
                            selectedIndices.clear();
                            selectedIndices.add(index);
                        }
                        // Re-render all rows to update selection styles (inefficient but simple for now)
                        // Optimization: just update this row and previously selected rows
                        Array.from(tbody.children).forEach((child: any, i) => {
                            const isSelected = selectedIndices.has(i);
                            if (isSelected) {
                                child.style.background = 'var(--vscode-list-activeSelectionBackground)';
                                child.style.color = 'var(--vscode-list-activeSelectionForeground)';
                            } else {
                                child.style.background = i % 2 === 0 ? 'transparent' : 'rgba(128, 128, 128, 0.04)';
                                child.style.color = 'var(--vscode-editor-foreground)';
                            }
                        });
                        updateActionsVisibility();
                    });

                    tr.addEventListener('mouseenter', () => {
                        if (!selectedIndices.has(index)) {
                            tr.style.background = 'var(--vscode-list-hoverBackground)';
                        }
                    });

                    tr.addEventListener('mouseleave', () => {
                        if (!selectedIndices.has(index)) {
                            tr.style.background = index % 2 === 0 ? 'transparent' : 'rgba(128, 128, 128, 0.04)';
                        }
                    });

                    // Selection Cell
                    const selectTd = document.createElement('td');
                    selectTd.style.borderBottom = '1px solid var(--vscode-widget-border)';
                    selectTd.style.borderRight = '1px solid var(--vscode-widget-border)';
                    selectTd.style.textAlign = 'center';
                    selectTd.style.fontSize = '10px';
                    selectTd.style.color = 'var(--vscode-descriptionForeground)';
                    selectTd.textContent = String(index + 1);
                    tr.appendChild(selectTd);

                    columns.forEach((col: string) => {
                        const td = document.createElement('td');
                        const val = row[col];
                        const colType = columnTypes ? columnTypes[col] : undefined;
                        const { text, isNull, type } = formatValue(val, colType);
                        const cellKey = `${index}-${col}`;
                        const isModified = modifiedCells.has(cellKey);
                        
                        // Debug: Log modified cell detection
                        if (isModified) {
                            console.log('Renderer: Rendering modified cell with highlight:', cellKey);
                        }

                        td.style.padding = '6px 12px';
                        td.style.borderBottom = '1px solid var(--vscode-widget-border)';
                        td.style.borderRight = '1px solid var(--vscode-widget-border)';
                        td.style.textAlign = 'left'; // Ensure left alignment for all cells
                        
                        // Set cursor based on editability
                        const isPrimaryKey = tableInfo?.primaryKeys?.includes(col);
                        td.style.cursor = tableInfo && !isPrimaryKey ? 'text' : 'default';
                        if (isPrimaryKey) {
                            td.style.backgroundColor = 'rgba(128, 128, 128, 0.1)';
                            td.title = 'Primary key - cannot be edited';
                        }
                        
                        // Highlight modified cells - apply AFTER base styles and make more visible
                        if (isModified) {
                            td.style.backgroundColor = '#fff3cd'; // Brighter yellow background
                            td.style.borderLeft = '4px solid #ffc107';
                            td.style.color = '#856404'; // Darker text for contrast
                            td.setAttribute('data-modified', 'true');
                        }
                        
                        // Function to enable editing
                        const enableEditing = (e: Event) => {
                            e.stopPropagation();
                            if (!tableInfo) return; // Only allow editing if we have table info
                            if (currentlyEditingCell === td) return; // Already editing this cell
                            
                            // Don't allow editing primary key columns
                            if (tableInfo.primaryKeys && tableInfo.primaryKeys.includes(col)) {
                                console.log('Renderer: Cannot edit primary key column:', col);
                                return;
                            }
                            
                            // Close any other editing cell
                            if (currentlyEditingCell) {
                                const existingInput = currentlyEditingCell.querySelector('input, textarea');
                                if (existingInput) {
                                    (existingInput as HTMLElement).blur();
                                }
                            }
                            
                            currentlyEditingCell = td;
                            const currentValue = currentRows[index][col];
                            const isJsonType = type === 'json' || type === 'object';
                            const isBoolType = type === 'boolean';
                            
                            td.innerHTML = '';
                            
                            if (isBoolType) {
                                // For boolean, use a checkbox
                                const checkbox = document.createElement('input');
                                checkbox.type = 'checkbox';
                                checkbox.checked = currentValue === true;
                                checkbox.style.width = '18px';
                                checkbox.style.height = '18px';
                                checkbox.style.cursor = 'pointer';
                                
                                checkbox.addEventListener('change', () => {
                                    const newValue = checkbox.checked;
                                    if (newValue !== originalRows[index][col]) {
                                        modifiedCells.set(cellKey, { originalValue: originalRows[index][col], newValue });
                                    } else {
                                        modifiedCells.delete(cellKey);
                                    }
                                    currentRows[index][col] = newValue;
                                    updateSaveButtonVisibility();
                                    currentlyEditingCell = null;
                                    updateTable();
                                });
                                
                                td.appendChild(checkbox);
                                checkbox.focus();
                            } else if (isJsonType) {
                                // For JSON, use textarea
                                const textarea = document.createElement('textarea');
                                textarea.value = typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : (currentValue || '');
                                textarea.style.width = '100%';
                                textarea.style.minWidth = '200px';
                                textarea.style.minHeight = '80px';
                                textarea.style.padding = '4px';
                                textarea.style.border = '1px solid var(--vscode-focusBorder)';
                                textarea.style.borderRadius = '3px';
                                textarea.style.backgroundColor = 'var(--vscode-input-background)';
                                textarea.style.color = 'var(--vscode-input-foreground)';
                                textarea.style.fontFamily = 'var(--vscode-editor-font-family)';
                                textarea.style.fontSize = '12px';
                                textarea.style.resize = 'both';
                                
                                const saveEdit = () => {
                                    let newValue: any;
                                    try {
                                        newValue = JSON.parse(textarea.value);
                                    } catch {
                                        newValue = textarea.value;
                                    }
                                    
                                    const originalValue = originalRows[index][col];
                                    if (JSON.stringify(newValue) !== JSON.stringify(originalValue)) {
                                        modifiedCells.set(cellKey, { originalValue, newValue });
                                    } else {
                                        modifiedCells.delete(cellKey);
                                    }
                                    currentRows[index][col] = newValue;
                                    updateSaveButtonVisibility();
                                    currentlyEditingCell = null;
                                    updateTable();
                                };
                                
                                textarea.addEventListener('blur', saveEdit);
                                textarea.addEventListener('keydown', (e) => {
                                    if (e.key === 'Escape') {
                                        currentlyEditingCell = null;
                                        updateTable();
                                    }
                                });
                                
                                td.appendChild(textarea);
                                textarea.focus();
                            } else {
                                // For other types, use input
                                const input = document.createElement('input');
                                input.type = 'text';
                                input.value = currentValue === null ? '' : String(currentValue);
                                input.style.width = '100%';
                                input.style.minWidth = '50px';
                                input.style.padding = '4px';
                                input.style.border = '1px solid var(--vscode-focusBorder)';
                                input.style.borderRadius = '3px';
                                input.style.backgroundColor = 'var(--vscode-input-background)';
                                input.style.color = 'var(--vscode-input-foreground)';
                                input.style.fontFamily = 'inherit';
                                input.style.fontSize = 'inherit';
                                input.placeholder = 'NULL';
                                
                                const saveEdit = () => {
                                    let newValue: any = input.value;
                                    
                                    // Handle NULL
                                    if (newValue === '' || newValue.toUpperCase() === 'NULL') {
                                        newValue = null;
                                    } else if (colType) {
                                        // Try to parse based on type
                                        const lowerType = colType.toLowerCase();
                                        if (lowerType.includes('int') || lowerType === 'numeric' || lowerType === 'decimal' || lowerType === 'real' || lowerType.includes('float') || lowerType.includes('double')) {
                                            const num = parseFloat(newValue);
                                            if (!isNaN(num)) newValue = num;
                                        }
                                    }
                                    
                                    const originalValue = originalRows[index][col];
                                    // Use string comparison to handle type coercion issues
                                    const strNew = newValue === null ? 'null' : String(newValue);
                                    const strOrig = originalValue === null ? 'null' : String(originalValue);
                                    console.log('Renderer: Comparing values', { cellKey, newValue, originalValue, strNew, strOrig, isEqual: strNew === strOrig });
                                    
                                    if (strNew !== strOrig) {
                                        console.log('Renderer: Cell modified, adding to modifiedCells:', cellKey);
                                        modifiedCells.set(cellKey, { originalValue, newValue });
                                    } else {
                                        console.log('Renderer: Cell unchanged, removing from modifiedCells:', cellKey);
                                        modifiedCells.delete(cellKey);
                                    }
                                    currentRows[index][col] = newValue;
                                    console.log('Renderer: modifiedCells now has', modifiedCells.size, 'entries:', Array.from(modifiedCells.keys()));
                                    updateSaveButtonVisibility();
                                    currentlyEditingCell = null;
                                    updateTable();
                                };
                                
                                input.addEventListener('blur', saveEdit);
                                input.addEventListener('keydown', (e) => {
                                    if (e.key === 'Enter') {
                                        saveEdit();
                                    } else if (e.key === 'Escape') {
                                        currentlyEditingCell = null;
                                        updateTable();
                                    }
                                });
                                
                                td.appendChild(input);
                                input.focus();
                                input.select();
                            }
                        };

                        if (isNull) {
                            td.textContent = text;
                            td.style.color = 'var(--vscode-descriptionForeground)';
                            td.style.fontStyle = 'italic';
                            td.style.fontSize = '0.9em';
                            if (tableInfo) td.addEventListener('dblclick', enableEditing);
                        } else if (type === 'number') {
                            td.textContent = text;
                            td.style.fontFamily = 'var(--vscode-editor-font-family)'; // Monospace for numbers
                            if (tableInfo) td.addEventListener('dblclick', enableEditing);
                        } else if (type === 'boolean') {
                            // Custom styled checkbox for better visibility
                            const checkboxContainer = document.createElement('span');
                            checkboxContainer.style.display = 'inline-flex';
                            checkboxContainer.style.alignItems = 'center';
                            checkboxContainer.style.justifyContent = 'center';
                            checkboxContainer.style.width = '16px';
                            checkboxContainer.style.height = '16px';
                            checkboxContainer.style.borderRadius = '3px';
                            checkboxContainer.style.border = '2px solid';
                            checkboxContainer.style.fontSize = '14px';
                            checkboxContainer.style.fontWeight = 'bold';
                            checkboxContainer.style.cursor = tableInfo ? 'pointer' : 'default';
                            
                            if (val) {
                                checkboxContainer.style.backgroundColor = '#498f56ff';
                                checkboxContainer.style.borderColor = '#51aa61ff';
                                checkboxContainer.style.color = '#ffffff';
                                checkboxContainer.textContent = '✓';
                            } else {
                                checkboxContainer.style.backgroundColor = 'transparent';
                                checkboxContainer.style.borderColor = '#6e7681';
                                checkboxContainer.style.color = 'transparent';
                                checkboxContainer.textContent = '';
                            }
                            
                            // Allow clicking to toggle boolean
                            if (tableInfo) {
                                checkboxContainer.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    const newValue = !val;
                                    if (newValue !== originalRows[index][col]) {
                                        modifiedCells.set(cellKey, { originalValue: originalRows[index][col], newValue });
                                    } else {
                                        modifiedCells.delete(cellKey);
                                    }
                                    currentRows[index][col] = newValue;
                                    updateSaveButtonVisibility();
                                    updateTable();
                                });
                            }
                            
                            td.appendChild(checkboxContainer);
                        } else if (type === 'json' || type === 'object') {
                            // Create a clickable JSON preview
                            const jsonContainer = document.createElement('div');
                            jsonContainer.style.display = 'flex';
                            jsonContainer.style.alignItems = 'center';
                            jsonContainer.style.gap = '6px';
                            
                            const jsonIcon = document.createElement('span');
                            jsonIcon.textContent = '{ }';
                            jsonIcon.style.backgroundColor = 'var(--vscode-badge-background)';
                            jsonIcon.style.color = 'var(--vscode-badge-foreground)';
                            jsonIcon.style.padding = '2px 6px';
                            jsonIcon.style.borderRadius = '4px';
                            jsonIcon.style.fontSize = '10px';
                            jsonIcon.style.fontWeight = '600';
                            jsonIcon.style.fontFamily = 'var(--vscode-editor-font-family)';
                            jsonIcon.style.cursor = 'pointer';
                            jsonIcon.title = 'Click to view JSON';
                            
                            // Only the icon opens the modal
                            jsonIcon.addEventListener('click', (e) => {
                                e.stopPropagation();
                                showJsonModal(val, col);
                            });
                            
                            // Hover effect for icon
                            jsonIcon.addEventListener('mouseenter', () => {
                                jsonIcon.style.opacity = '0.8';
                            });
                            jsonIcon.addEventListener('mouseleave', () => {
                                jsonIcon.style.opacity = '1';
                            });
                            
                            const preview = document.createElement('span');
                            // Create a truncated preview
                            const jsonStr = typeof val === 'string' ? val : JSON.stringify(val);
                            const maxLen = 50;
                            preview.textContent = jsonStr.length > maxLen ? jsonStr.substring(0, maxLen) + '...' : jsonStr;
                            preview.style.fontFamily = 'var(--vscode-editor-font-family)';
                            preview.style.fontSize = '12px';
                            preview.style.color = 'var(--vscode-editor-foreground)';
                            preview.style.overflow = 'hidden';
                            preview.style.textOverflow = 'ellipsis';
                            preview.style.whiteSpace = 'nowrap';
                            preview.style.maxWidth = '200px';
                            
                            jsonContainer.appendChild(jsonIcon);
                            jsonContainer.appendChild(preview);
                            
                            td.appendChild(jsonContainer);
                            
                            // Double-click on the cell (not just container) to edit
                            if (tableInfo) {
                                td.addEventListener('dblclick', enableEditing);
                                td.title = 'Double-click to edit';
                            }
                        } else if (type === 'timestamp' || type === 'date' || type === 'time') {
                            // Date/Time - use column-level display mode
                            const showLocal = dateTimeDisplayMode.get(col) ?? true;
                            const originalValue = String(val); // The raw value from database
                            
                            td.textContent = showLocal ? text : originalValue;
                            td.style.fontFamily = 'var(--vscode-editor-font-family)';
                            
                            if (tableInfo) td.addEventListener('dblclick', enableEditing);
                        } else {
                            td.textContent = text;
                            if (tableInfo) td.addEventListener('dblclick', enableEditing);
                        }

                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });

                table.appendChild(thead);
                table.appendChild(tbody);
                tableContainer.appendChild(table);
            };

            updateTable();
            updateActionsVisibility(); // Ensure visibility is updated initially
            element.appendChild(mainContainer);
        }
    };
};
