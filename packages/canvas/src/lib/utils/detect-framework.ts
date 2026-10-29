export type UIFramework =
  | "react"
  | "vue"
  | "solid"
  | "preact"
  | "lit"
  | "astro"
  | "svelte"
  | "unknown";

const META_FRAMEWORK_ALIASES: Record<string, UIFramework> = {
  next: "react",
  nuxt: "vue",
  sveltekit: "svelte",
  tanstack: "react",
};

export function normalizeUIFramework(value: string | undefined | null): UIFramework {
  if (!value) {
    return "unknown";
  }

  const normalized = value.toLowerCase();
  if (normalized in META_FRAMEWORK_ALIASES) {
    return META_FRAMEWORK_ALIASES[normalized] ?? "unknown";
  }

  switch (normalized) {
    case "react":
    case "vue":
    case "solid":
    case "preact":
    case "lit":
    case "astro":
    case "svelte":
      return normalized;
    default:
      return "unknown";
  }
}

/**
 * Client-side fallback for content-level framework detection. The daemon
 * scanner is authoritative for topology nodes because it has the source and
 * AST imports available.
 */
export function detectComponentFramework(
  filePath: string,
  fileContent: string,
  packageJsonDeps: Record<string, string> = {},
): UIFramework {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();

  if (ext === ".vue") return "vue";
  if (ext === ".astro") return "astro";
  if (ext === ".svelte") return "svelte";

  if (
    fileContent.includes("from 'lit'") ||
    fileContent.includes('from "lit"') ||
    fileContent.includes("from 'lit-html'") ||
    fileContent.includes('from "lit-html"') ||
    fileContent.includes("extends LitElement") ||
    /@customElement\s*\(/.test(fileContent)
  ) {
    return "lit";
  }

  if (
    fileContent.includes("from 'solid-js'") ||
    fileContent.includes('from "solid-js"') ||
    /\b(createSignal|createMemo|createEffect)\b/.test(fileContent) ||
    /<(Show|For|Switch|Match)\b/.test(fileContent)
  ) {
    return "solid";
  }

  if (
    fileContent.includes("from 'preact'") ||
    fileContent.includes('from "preact"') ||
    fileContent.includes("@jsx h") ||
    fileContent.includes("@jsxFrag")
  ) {
    return "preact";
  }

  if (
    fileContent.includes("'use client'") ||
    fileContent.includes('"use client"') ||
    fileContent.includes("from 'react'") ||
    fileContent.includes('from "react"') ||
    /\b(useState|useEffect|useMemo|useCallback|createContext)\b/.test(fileContent)
  ) {
    return "react";
  }

  if (packageJsonDeps["solid-js"]) return "solid";
  if (packageJsonDeps.preact) return "preact";
  if (packageJsonDeps.lit || packageJsonDeps["lit-html"]) return "lit";
  if (packageJsonDeps.vue) return "vue";
  if (packageJsonDeps.react || packageJsonDeps.next) return "react";

  return "react";
}
