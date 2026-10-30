export type SecurityCheckResult = {
  ruleId: string;
  severity: "warning" | "error";
  message: string;
  line?: number;
  suggestion?: string;
};

// Structural subset of RoutogramNode so plugin-core does not need a runtime
// dependency on the workspace contract package.
type SecurityNode = {
  id: string;
  kind: string;
  meta?: {
    props?: readonly unknown[];
  };
};

const SETTER_IN_BODY_REGEX = /\bset[A-Z]\w*\s*\(/;
const SAFE_GUARD_REGEX =
  /\b(useEffect|useLayoutEffect|useCallback|useMemo|watch|watchEffect|onMounted)\s*\(/;
const EVENT_ADD_REGEX = /\b(addEventListener|setInterval)\s*\(\s*["']?([^"',)]+)/;
const EVENT_REMOVE_REGEX = /\b(removeEventListener|clearInterval)\s*\(/;

export function runStandardSecurityRules(
  node: SecurityNode,
  sourceCode: string,
  propDepthMap?: ReadonlyMap<string, number>,
): SecurityCheckResult[] {
  const results: SecurityCheckResult[] = [];
  if (node.kind === "style" || node.kind === "token") return results;

  const lines = sourceCode.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (
      SETTER_IN_BODY_REGEX.test(line) &&
      !SAFE_GUARD_REGEX.test(line) &&
      !line.includes("=>") &&
      !line.includes("function") &&
      line.trim().startsWith("set")
    ) {
      results.push({
        ruleId: "security/no-infinite-render-loop",
        severity: "error",
        message:
          "Direct state mutation detected during component render phase, which may trigger an infinite render loop.",
        line: index + 1,
        suggestion: "Move state updates inside useEffect, watch, or an event handler.",
      });
    }
  }

  if (EVENT_ADD_REGEX.test(sourceCode) && !EVENT_REMOVE_REGEX.test(sourceCode)) {
    results.push({
      ruleId: "security/no-uncleaned-global-listeners",
      severity: "warning",
      message:
        "Global listener or timer (addEventListener / setInterval) registered without a matching cleanup call.",
      suggestion:
        "Return a cleanup function removing the listener or clearing the interval on unmount.",
    });
  }

  const depth = propDepthMap?.get(node.id) ?? 0;
  const propCount = node.meta?.props?.length ?? 0;
  if (depth >= 3 && propCount >= 5) {
    results.push({
      ruleId: "security/excessive-prop-drilling",
      severity: "warning",
      message: `Component sits at render depth ${depth} with ${propCount} props, indicating potential prop-drilling coupling.`,
      suggestion: "Consider extracting shared state into a dedicated store or scoped provider.",
    });
  }

  return results;
}
