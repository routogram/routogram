/**
 * Converts PascalCase/camelCase identifiers into space-separated title text.
 * Handles consecutive capitals such as `UIStore` → `UI Store`.
 */
export function formatComponentName(name: string): string {
  if (!name) {
    return "";
  }

  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}
