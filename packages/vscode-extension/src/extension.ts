import path from "node:path";

import * as vscode from "vscode";

type TopologyNode = {
  id: string;
  name: string;
  file: string;
  kind: string;
  source?: { line?: number; column?: number };
  meta?: {
    styleMetrics?: {
      consumedTokens?: unknown[];
      unusedClasses?: unknown[];
      stylesheets?: string[];
    };
  };
};

type TopologyEdge = {
  source: string;
  target: string;
  kind: string;
};

type Topology = {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
};

const VIEW_ID = "routogram.topology";
const CACHE_MS = 4_000;
let cachedTopology: { topology: Topology; fetchedAt: number } | null = null;

function daemonUrl(): string {
  return (
    vscode.workspace.getConfiguration("routogram").get<string>("daemonUrl") ??
    "http://127.0.0.1:4040"
  ).replace(/\/$/, "");
}

function canvasUrl(): string {
  return (
    vscode.workspace.getConfiguration("routogram").get<string>("canvasUrl") ??
    "http://127.0.0.1:6060"
  ).replace(/\/$/, "");
}

async function getTopology(force = false): Promise<Topology | null> {
  if (!force && cachedTopology && Date.now() - cachedTopology.fetchedAt < CACHE_MS) {
    return cachedTopology.topology;
  }

  try {
    const response = await fetch(`${daemonUrl()}/api/topology`, {
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) {
      return null;
    }
    const topology = (await response.json()) as Topology;
    if (!Array.isArray(topology.nodes) || !Array.isArray(topology.edges)) {
      return null;
    }
    cachedTopology = { topology, fetchedAt: Date.now() };
    return topology;
  } catch {
    return null;
  }
}

function workspaceRelative(uri: vscode.Uri): string | null {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    return null;
  }

  return path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join("/");
}

function normalizeFile(file: string): string {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

async function focusFile(file: string): Promise<void> {
  try {
    await fetch(`${daemonUrl()}/api/ide/focus`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filePath: file }),
      signal: AbortSignal.timeout(1_500),
    });
  } catch {
    // The canvas is optional; active sync fails silently when the daemon is offline.
  }
}

class TopologyViewProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: false };
    view.webview.html = this.html();
  }

  private html(): string {
    const src = canvasUrl();
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; frame-src ${src};" />
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #080c18; overflow: hidden; }
  iframe { border: 0; width: 100%; height: 100%; display: block; }
</style>
</head>
<body>
  <iframe src="${src}" title="Routogram topology canvas"></iframe>
</body>
</html>`;
  }
}

class RoutogramCodeLensProvider implements vscode.CodeLensProvider {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;

  refresh(): void {
    cachedTopology = null;
    this.emitter.fire();
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const file = workspaceRelative(document.uri);
    if (!file) {
      return [];
    }

    const topology = await getTopology();
    if (!topology) {
      return [];
    }

    const normalized = normalizeFile(file);
    const lenses: vscode.CodeLens[] = [];

    for (const node of topology.nodes) {
      if (!["component", "route", "layout"].includes(node.kind)) {
        continue;
      }
      if (normalizeFile(node.file) !== normalized) {
        continue;
      }

      const line = Math.max((node.source?.line ?? 1) - 1, 0);
      const children = topology.edges.filter(
        (edge) => edge.source === node.id && edge.kind === "renders",
      ).length;
      const tokens = node.meta?.styleMetrics?.consumedTokens?.length ?? 0;
      const deadCss = node.meta?.styleMetrics?.unusedClasses?.length ?? 0;
      const range = new vscode.Range(line, 0, line, 0);

      lenses.push(
        new vscode.CodeLens(range, {
          title: `Routogram: ${children} Child Components | ${tokens} Consumed Tokens | ${deadCss} Dead CSS`,
          command: "routogram.focusNode",
          arguments: [normalizeFile(node.file)],
        }),
      );
    }

    return lenses;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new TopologyViewProvider();
  const codeLens = new RoutogramCodeLensProvider();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.languages.registerCodeLensProvider(
      [
        { scheme: "file", language: "typescriptreact" },
        { scheme: "file", language: "javascriptreact" },
      ],
      codeLens,
    ),
    vscode.commands.registerCommand("routogram.openCanvas", async () => {
      await vscode.env.openExternal(vscode.Uri.parse(canvasUrl()));
    }),
    vscode.commands.registerCommand("routogram.focusNode", async (file: string) => {
      await focusFile(file);
      await vscode.commands.executeCommand("workbench.view.extension.routogram");
    }),
    vscode.commands.registerCommand("routogram.showBlastRadius", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("Open a component file first.");
        return;
      }

      const file = workspaceRelative(editor.document.uri);
      const topology = await getTopology(true);
      if (!file || !topology) {
        vscode.window.showWarningMessage(
          "Routogram is unavailable. Start the daemon on :4040 and retry.",
        );
        return;
      }

      const normalized = normalizeFile(file);
      const nodes = topology.nodes.filter((node) => normalizeFile(node.file) === normalized);
      if (nodes.length === 0) {
        vscode.window.showInformationMessage("No Routogram node is associated with this file.");
        return;
      }

      const node = nodes.find((candidate) => candidate.kind === "component") ?? nodes[0];
      const inbound = topology.edges.filter((edge) => edge.target === node.id);
      const outbound = topology.edges.filter((edge) => edge.source === node.id);
      const deadCss = node.meta?.styleMetrics?.unusedClasses?.length ?? 0;
      const tokens = node.meta?.styleMetrics?.consumedTokens?.length ?? 0;

      await focusFile(file);
      void vscode.window.showInformationMessage(
        `${node.name}: ${inbound.length} inbound / ${outbound.length} outbound edges · ${tokens} tokens · ${deadCss} dead CSS.`,
      );
    }),
    vscode.workspace.onDidSaveTextDocument(() => codeLens.refresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => codeLens.refresh()),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        return;
      }
      const file = workspaceRelative(editor.document.uri);
      if (file) {
        void focusFile(file);
      }
    }),
  );

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const file = workspaceRelative(activeEditor.document.uri);
    if (file) {
      void focusFile(file);
    }
  }
}

export function deactivate(): void {
  cachedTopology = null;
}
