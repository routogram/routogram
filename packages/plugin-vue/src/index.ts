import {
  createDiagnostic,
  type Diagnostic,
  type PluginContext,
  type PluginDefinition,
  parseSourceFile,
  walk,
} from "@routogram/plugin-core";
import * as ts from "typescript";

export const noUncleanedWatch: PluginDefinition = {
  id: "vue/no-uncleaned-watch",
  description: "Vue watchers using timers or subscriptions should expose an onCleanup callback.",
  severity: "warning",
  run(context: PluginContext): Diagnostic[] {
    if (!context.filePath.endsWith(".vue")) {
      return [];
    }

    const script = context.source.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? "";
    if (!script) {
      return [];
    }
    const sourceFile = parseSourceFile(`${context.filePath}.ts`, script);
    const diagnostics: Diagnostic[] = [];

    walk(sourceFile, (node) => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) {
        return;
      }
      if (node.expression.text !== "watch" && node.expression.text !== "watchEffect") {
        return;
      }
      const callback = node.arguments[0];
      if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
        return;
      }
      const hasCleanup = callback.parameters.some(
        (parameter) => parameter.name.getText() === "onCleanup",
      );
      if (!hasCleanup) {
        diagnostics.push(
          createDiagnostic(
            noUncleanedWatch,
            context.relativePath,
            sourceFile,
            callback,
            "Watcher does not accept an onCleanup callback for timers or subscriptions.",
          ),
        );
      }
    });

    return diagnostics;
  },
};

export const pluginsVue: PluginDefinition[] = [noUncleanedWatch];
