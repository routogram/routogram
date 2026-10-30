import * as ts from "typescript";

export type HealthLevel = "safe" | "tidy" | "warning" | "danger";

export type DiagnosticSeverity = Exclude<HealthLevel, "safe">;

export type Diagnostic = {
  id: string;
  pluginId: string;
  severity: DiagnosticSeverity;
  message: string;
  file: string;
  line: number;
  column: number;
  nodeId?: string;
};

export type NodeHealthData = {
  health: HealthLevel;
  diagnostics: Diagnostic[];
};

export type PluginContext = {
  filePath: string;
  relativePath: string;
  source: string;
  sourceFile: ts.SourceFile;
  files: string[];
};

export type PluginDefinition = {
  id: string;
  description: string;
  severity: DiagnosticSeverity;
  run: (context: PluginContext) => Diagnostic[];
};

export function resolveNodeHealth(diagnostics: Diagnostic[]): HealthLevel {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "danger")) {
    return "danger";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "warning";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "tidy")) {
    return "tidy";
  }
  return "safe";
}

const STYLESHEET_EXTENSIONS = [".css", ".scss", ".sass", ".less", ".pcss"];

export function shouldCheckDiagnostics(filePath: string, nodeType?: string): boolean {
  const normalizedType = nodeType?.toLowerCase();
  if (normalizedType === "stylesheet" || normalizedType === "style") {
    return false;
  }

  const normalizedPath = filePath.toLowerCase();
  return !STYLESHEET_EXTENSIONS.some((extension) => normalizedPath.endsWith(extension));
}

export function parseSourceFile(filePath: string, source: string): ts.SourceFile {
  const scriptKind = filePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : filePath.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : filePath.endsWith(".js")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;

  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
}

export function walk(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, (child) => walk(child, visitor));
}

export function lineColumn(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): { line: number; column: number } {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: position.line + 1, column: position.character + 1 };
}

export function createDiagnostic(
  plugin: PluginDefinition,
  file: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  message: string,
): Diagnostic {
  const position = lineColumn(sourceFile, node);
  return {
    id: `${plugin.id}:${file}:${position.line}:${position.column}`,
    pluginId: plugin.id,
    severity: plugin.severity,
    message,
    file,
    line: position.line,
    column: position.column,
  };
}

export function callName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return null;
}

export function isFunctionLike(
  node: ts.Node,
): node is ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction {
  return (
    ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
  );
}

export {
  runStandardSecurityRules,
  type SecurityCheckResult,
} from "./rules/security-rules.js";
