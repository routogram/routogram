import {
  callName,
  createDiagnostic,
  type Diagnostic,
  isFunctionLike,
  type PluginContext,
  type PluginDefinition,
  walk,
} from "@routogram/plugin-core";
import * as ts from "typescript";

const CLEANUP_CALLS = new Set(["addEventListener", "setInterval", "setTimeout"]);

export const noUncleanedEffects: PluginDefinition = {
  id: "react/no-uncleaned-effects",
  description: "Effects registering listeners or timers must return a cleanup function.",
  severity: "danger",
  run(context: PluginContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    walk(context.sourceFile, (node) => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) {
        return;
      }
      if (node.expression.text !== "useEffect" && node.expression.text !== "useLayoutEffect") {
        return;
      }

      const effect = node.arguments[0];
      if (!effect || !isFunctionLike(effect)) {
        return;
      }

      let needsCleanup = false;
      let hasCleanup = false;
      walk(effect.body, (child) => {
        if (ts.isCallExpression(child)) {
          const name = callName(child.expression);
          if (name && CLEANUP_CALLS.has(name)) {
            needsCleanup = true;
          }
          if (
            name === "clearInterval" ||
            name === "clearTimeout" ||
            name === "removeEventListener"
          ) {
            hasCleanup = true;
          }
        }
        if (ts.isNewExpression(child) && ts.isIdentifier(child.expression)) {
          if (child.expression.text === "WebSocket") {
            needsCleanup = true;
          }
        }
        if (ts.isReturnStatement(child) && child.expression) {
          if (
            ts.isArrowFunction(child.expression) ||
            ts.isFunctionExpression(child.expression) ||
            ts.isIdentifier(child.expression)
          ) {
            hasCleanup = true;
          }
        }
      });

      if (needsCleanup && !hasCleanup) {
        diagnostics.push(
          createDiagnostic(
            noUncleanedEffects,
            context.relativePath,
            context.sourceFile,
            effect,
            "Effect registers a listener, timer, or socket but does not return a cleanup function.",
          ),
        );
      }
    });

    return diagnostics;
  },
};

export const pluginsReact: PluginDefinition[] = [noUncleanedEffects];
