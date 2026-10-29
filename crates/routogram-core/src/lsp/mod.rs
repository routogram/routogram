use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tower_lsp::jsonrpc::Result as LspResult;
use tower_lsp::lsp_types::{
    CodeAction, CodeActionKind, CodeActionOrCommand, CodeActionParams,
    CodeActionProviderCapability, CodeActionResponse, Command, Diagnostic, DiagnosticSeverity,
    DidOpenTextDocumentParams, DidSaveTextDocumentParams, Hover, HoverContents,
    HoverProviderCapability, InitializeParams, InitializeResult, InitializedParams, MarkupContent,
    MarkupKind, MessageType, NumberOrString, Position, Range, ServerCapabilities, ServerInfo,
    TextDocumentSyncCapability, TextDocumentSyncKind, Url,
};
use tower_lsp::{Client, LanguageServer, LspService, Server};

use crate::analyzer;
use crate::model::{Node, Topology};

#[derive(Clone)]
struct Backend {
    client: Client,
    root: Arc<PathBuf>,
}

impl Backend {
    async fn refresh(&self, target: Option<Url>) {
        let topology = match analyzer::scan(&self.root, "lsp".to_string()) {
            Ok(topology) => topology,
            Err(error) => {
                self.client
                    .log_message(
                        MessageType::ERROR,
                        format!("Routogram scan failed: {error}"),
                    )
                    .await;
                return;
            }
        };

        let diagnostics = diagnostics_for(&self.root, &topology);
        for (file, items) in diagnostics {
            let Ok(url) = Url::from_file_path(self.root.join(&file)) else {
                continue;
            };
            if target.as_ref() == Some(&url) || target.is_none() {
                self.client.publish_diagnostics(url, items, None).await;
            }
        }
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _params: InitializeParams) -> LspResult<InitializeResult> {
        Ok(InitializeResult {
            server_info: Some(ServerInfo {
                name: "routogram".to_string(),
                version: Some(env!("CARGO_PKG_VERSION").to_string()),
            }),
            capabilities: ServerCapabilities {
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                code_action_provider: Some(CodeActionProviderCapability::Simple(true)),
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                ..ServerCapabilities::default()
            },
        })
    }

    async fn initialized(&self, _params: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "Routogram LSP initialized")
            .await;
        self.refresh(None).await;
    }

    async fn shutdown(&self) -> LspResult<()> {
        Ok(())
    }

    async fn code_action(&self, params: CodeActionParams) -> LspResult<Option<CodeActionResponse>> {
        let actions = params
            .context
            .diagnostics
            .iter()
            .filter_map(|diagnostic| {
                let code = match &diagnostic.code {
                    Some(NumberOrString::String(code)) => code.as_str(),
                    _ => return None,
                };
                let recipe = match code {
                    "dead-css" => "prune-dead-css",
                    "circular-dependency" => "safe-server-client-split",
                    _ => return None,
                };
                Some(CodeActionOrCommand::CodeAction(CodeAction {
                    title: "Preview Routogram Auto-Fix".to_string(),
                    kind: Some(CodeActionKind::QUICKFIX),
                    command: Some(Command {
                        title: "Preview in Routogram".to_string(),
                        command: "routogram.previewRefactor".to_string(),
                        arguments: Some(vec![
                            serde_json::json!(recipe),
                            serde_json::json!(params.text_document.uri.to_string()),
                        ]),
                    }),
                    ..CodeAction::default()
                }))
            })
            .collect::<Vec<_>>();

        Ok(Some(actions))
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        self.refresh(Some(params.text_document.uri)).await;
    }

    async fn did_save(&self, params: DidSaveTextDocumentParams) {
        self.refresh(Some(params.text_document.uri)).await;
    }

    async fn hover(&self, params: tower_lsp::lsp_types::HoverParams) -> LspResult<Option<Hover>> {
        let Ok(path) = params
            .text_document_position_params
            .text_document
            .uri
            .to_file_path()
        else {
            return Ok(None);
        };
        let relative = path
            .strip_prefix(self.root.as_path())
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let line = params.text_document_position_params.position.line + 1;
        let Ok(topology) = analyzer::scan(&self.root, "lsp-hover".to_string()) else {
            return Ok(None);
        };
        let Some(node) = topology
            .nodes
            .iter()
            .filter(|node| node.file == relative)
            .filter(|node| {
                node.source
                    .as_ref()
                    .is_none_or(|source| source.line <= line)
            })
            .max_by_key(|node| node.source.as_ref().map_or(0, |source| source.line))
        else {
            return Ok(None);
        };

        let runtime = node.runtime.as_deref().unwrap_or("universal");
        let tokens = node
            .meta
            .as_ref()
            .and_then(|meta| meta.style_metrics.as_ref())
            .map(|metrics| metrics.consumed_tokens.join(", "))
            .filter(|tokens| !tokens.is_empty())
            .unwrap_or_else(|| "none".to_string());
        let children = topology
            .edges
            .iter()
            .filter(|edge| edge.source == node.id && edge.kind == "renders")
            .count();
        let dead = node
            .meta
            .as_ref()
            .and_then(|meta| meta.style_metrics.as_ref())
            .map(|metrics| metrics.unused_classes.len())
            .unwrap_or(0);
        let markdown = format!(
            "### Routogram · {}\n\n- **Kind:** {}\n- **Runtime:** {}\n- **Children:** {children}\n- **Tokens:** {tokens}\n- **Dead CSS:** {dead}\n- **File:** `{}`\n\n[Open canvas](http://127.0.0.1:6060)",
            node.name, node.kind, runtime, node.file
        );

        Ok(Some(Hover {
            contents: HoverContents::Markup(MarkupContent {
                kind: MarkupKind::Markdown,
                value: markdown,
            }),
            range: Some(Range {
                start: Position::new(
                    node.source
                        .as_ref()
                        .map_or(0, |source| source.line.saturating_sub(1)),
                    0,
                ),
                end: Position::new(node.source.as_ref().map_or(0, |source| source.line), 80),
            }),
        }))
    }
}

pub async fn run_stdio(root: PathBuf) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let root = root.canonicalize().unwrap_or(root);
    let (service, socket) = LspService::new(|client| Backend {
        client,
        root: Arc::new(root),
    });
    Server::new(tokio::io::stdin(), tokio::io::stdout(), socket)
        .serve(service)
        .await;
    Ok(())
}

fn diagnostics_for(root: &Path, topology: &Topology) -> BTreeMap<String, Vec<Diagnostic>> {
    let mut diagnostics: BTreeMap<String, Vec<Diagnostic>> = BTreeMap::new();
    let mut by_file: BTreeMap<&str, Vec<&Node>> = BTreeMap::new();
    for node in &topology.nodes {
        by_file.entry(node.file.as_str()).or_default().push(node);
    }

    for (file, nodes) in by_file {
        let _ = root;
        let mut items = Vec::new();
        for node in nodes {
            let line = node
                .source
                .as_ref()
                .map_or(0, |source| source.line.saturating_sub(1));
            if let Some(metrics) = node
                .meta
                .as_ref()
                .and_then(|meta| meta.style_metrics.as_ref())
            {
                if !metrics.unused_classes.is_empty() {
                    items.push(Diagnostic {
                        range: Range::new(Position::new(line, 0), Position::new(line, 120)),
                        severity: Some(DiagnosticSeverity::WARNING),
                        source: Some("routogram".to_string()),
                        code: Some(NumberOrString::String("dead-css".to_string())),
                        message: format!("Dead CSS classes: {}", metrics.unused_classes.join(", ")),
                        ..Diagnostic::default()
                    });
                }
            }
        }
        if !items.is_empty() {
            diagnostics
                .entry(file.to_string())
                .or_default()
                .extend(items);
        }
    }

    for cycle in cycles(topology) {
        let file = topology
            .nodes
            .iter()
            .find(|node| cycle.contains(&node.id))
            .map(|node| node.file.clone());
        if let Some(file) = file {
            diagnostics.entry(file).or_default().push(Diagnostic {
                range: Range::new(Position::new(0, 0), Position::new(0, 120)),
                severity: Some(DiagnosticSeverity::ERROR),
                source: Some("routogram".to_string()),
                code: Some(NumberOrString::String("circular-dependency".to_string())),
                message: format!("Circular architecture dependency: {}", cycle.join(" → ")),
                ..Diagnostic::default()
            });
        }
    }

    let _ = diagnostics;
    diagnostics
}

fn cycles(topology: &Topology) -> Vec<Vec<String>> {
    let adjacency = topology
        .edges
        .iter()
        .filter(|edge| {
            matches!(
                edge.kind.as_str(),
                "renders" | "dynamic_imports" | "cross_package"
            )
        })
        .fold(BTreeMap::<&str, Vec<&str>>::new(), |mut map, edge| {
            map.entry(edge.source.as_str())
                .or_default()
                .push(edge.target.as_str());
            map
        });
    let mut found = Vec::new();
    let mut seen = BTreeSet::new();
    fn visit(
        node: &str,
        stack: &mut Vec<String>,
        visiting: &mut BTreeSet<String>,
        adjacency: &BTreeMap<&str, Vec<&str>>,
        found: &mut Vec<Vec<String>>,
        seen: &mut BTreeSet<String>,
    ) {
        if let Some(position) = stack.iter().position(|item| item == node) {
            let cycle = stack[position..].to_vec();
            let key = {
                let mut ids = cycle.clone();
                ids.sort();
                ids.join(">")
            };
            if seen.insert(key) {
                found.push(cycle);
            }
            return;
        }
        if visiting.contains(node) || stack.len() > 16 {
            return;
        }
        visiting.insert(node.to_string());
        stack.push(node.to_string());
        for next in adjacency.get(node).into_iter().flatten() {
            visit(next, stack, visiting, adjacency, found, seen);
        }
        stack.pop();
        visiting.remove(node);
    }
    for node in adjacency.keys() {
        visit(
            node,
            &mut Vec::new(),
            &mut BTreeSet::new(),
            &adjacency,
            &mut found,
            &mut seen,
        );
    }
    found
}
