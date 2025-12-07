/**
 * SQL Templates for Extension Operations
 */

export const ExtensionSQL = {
    /**
     * Enable extension
     */
    enable: (extensionName: string) =>
        `-- Enable extension
CREATE EXTENSION IF NOT EXISTS "${extensionName}";`,

    /**
     * Drop extension
     */
    drop: (extensionName: string) =>
        `-- Drop extension
DROP EXTENSION IF EXISTS "${extensionName}";`,

    /**
     * Drop extension cascade
     */
    dropCascade: (extensionName: string) =>
        `-- Drop extension
DROP EXTENSION IF EXISTS "${extensionName}" CASCADE;`
};
