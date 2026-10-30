mod ast_helpers;
mod cache;
pub(crate) mod extractors;
pub mod matcher;
mod network;
pub mod plugins;
mod routes;
pub mod sfc_extractor;

pub use cache::ScanCache;

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use ignore::WalkBuilder;
use serde_json::json;

use crate::model::{
    BlastRadiusWarning, Edge, GENERATOR_NAME, Generator, NetworkCall, Node, NodeDataFlowMeta,
    NodeMeta, SCHEMA_VERSION, Source, Stats, StyleMetrics, Topology, TopologyPatch,
};
use crate::routing::{FileRole, FrameworkAnalysis, analyze_markup_file, component_name};
use crate::style::{GlobalTokenRegistry, StyleSheetAnalysis, analyze_css_file};
use crate::workspace::Workspace;

use self::cache::{CachedBoundary, CachedCss, CachedFramework, CachedJsx, file_fingerprint};
use self::matcher::{JsxAnalysis, analyze_jsx_file};
use self::network::{ActionDefinition, analyze_boundary_file};
use self::routes::{assemble_route_nodes, layout_display_name};

const MAX_SOURCE_BYTES: u64 = 2 * 1024 * 1024;

struct SourceFile {
    relative: String,
    absolute: PathBuf,
}

struct RouteAccumulator {
    path: String,
    methods: BTreeSet<String>,
    file: String,
    line: u32,
    node_id: String,
}

struct RouteRecord {
    path: String,
    node_id: String,
}

struct PendingImport {
    source_id: String,
    source_relative: String,
    source_package: Option<String>,
    target_relative: String,
    target_package: Option<String>,
    via: String,
}

pub fn scan(root: &Path, generated_at: String) -> Result<Topology, String> {
    scan_paths(root, root, generated_at)
}

pub fn scan_paths(
    project_root: &Path,
    scan_root: &Path,
    generated_at: String,
) -> Result<Topology, String> {
    let mut cache = ScanCache::new();

    scan_internal(project_root, scan_root, generated_at, &mut cache, None)
        .map(|(topology, _)| topology)
}

pub fn scan_cached(
    root: &Path,
    generated_at: String,
    cache: &mut ScanCache,
) -> Result<Topology, String> {
    scan_internal(root, root, generated_at, cache, None).map(|(topology, _)| topology)
}

pub fn update_cached(
    root: &Path,
    generated_at: String,
    cache: &mut ScanCache,
    changed_paths: &BTreeSet<String>,
) -> Result<(Topology, TopologyPatch), String> {
    scan_internal(root, root, generated_at, cache, Some(changed_paths))
}

fn scan_internal(
    project_root: &Path,
    scan_root: &Path,
    generated_at: String,
    cache: &mut ScanCache,
    changed_paths: Option<&BTreeSet<String>>,
) -> Result<(Topology, TopologyPatch), String> {
    let started = Instant::now();
    let root = project_root;
    cache.prepare_roots(project_root, scan_root);
    let workspace = Workspace::resolve(project_root);

    let mut warnings = workspace.warnings.clone();
    let (css_files, jsx_files, boundary_files, framework_files) =
        discover_files(project_root, scan_root);
    let force_changed = |relative: &str| {
        changed_paths.is_some_and(|paths| {
            paths.contains(relative) || paths.contains(&relative.replace('/', "\\"))
        })
    };

    let mut old_css = std::mem::take(&mut cache.css);
    let mut css_analyses = BTreeMap::new();
    let mut next_css = BTreeMap::new();

    for path in &css_files {
        let Some(relative) = relative_path(project_root, path) else {
            continue;
        };
        let fingerprint = file_fingerprint(path);

        if !force_changed(&relative) {
            if let (Some(cached), Some(fingerprint)) = (old_css.remove(&relative), fingerprint) {
                if cached.fingerprint == fingerprint {
                    css_analyses.insert(relative.clone(), cached.analysis.clone());
                    next_css.insert(relative, cached);
                    continue;
                }
            }
        }

        let mut scratch = GlobalTokenRegistry::default();
        match analyze_css_file(path, &relative, &mut scratch) {
            Ok(analysis) => {
                let fingerprint = fingerprint.unwrap_or(cache::FileFingerprint {
                    modified_ns: 0,
                    size: 0,
                });
                next_css.insert(
                    relative.clone(),
                    CachedCss {
                        fingerprint,
                        analysis: analysis.clone(),
                    },
                );
                css_analyses.insert(relative, analysis);
            }
            Err(error) => warnings.push(error),
        }
    }

    cache.css = next_css;

    let mut old_boundary = std::mem::take(&mut cache.boundary);
    let mut boundary_analyses = BTreeMap::new();
    let mut next_boundary = BTreeMap::new();

    for file in &boundary_files {
        let fingerprint = file_fingerprint(&file.absolute);
        let force = force_changed(&file.relative);

        if !force {
            if let (Some(cached), Some(fingerprint)) =
                (old_boundary.remove(&file.relative), fingerprint)
            {
                if cached.fingerprint == fingerprint {
                    boundary_analyses.insert(file.relative.clone(), cached.analysis.clone());
                    next_boundary.insert(file.relative.clone(), cached);
                    continue;
                }
            }
        }

        let source = match fs::read_to_string(&file.absolute) {
            Ok(source) => source,
            Err(error) => {
                warnings.push(format!("{}: {error}", file.relative));
                continue;
            }
        };

        match analyze_boundary_file(&file.absolute, &file.relative, &source) {
            Ok(analysis) => {
                let fingerprint = fingerprint.unwrap_or(cache::FileFingerprint {
                    modified_ns: 0,
                    size: 0,
                });
                next_boundary.insert(
                    file.relative.clone(),
                    CachedBoundary {
                        fingerprint,
                        analysis: analysis.clone(),
                    },
                );
                boundary_analyses.insert(file.relative.clone(), analysis);
            }
            Err(error) => {
                if file.relative.contains("route.") || source.contains("use server") {
                    warnings.push(error);
                }
            }
        }
    }

    cache.boundary = next_boundary;

    let mut old_jsx = std::mem::take(&mut cache.jsx);
    let mut jsx_analyses = BTreeMap::new();
    let mut next_jsx = BTreeMap::new();

    for file in &jsx_files {
        let fingerprint = file_fingerprint(&file.absolute);
        let force = force_changed(&file.relative);

        if !force {
            if let (Some(cached), Some(fingerprint)) = (old_jsx.remove(&file.relative), fingerprint)
            {
                if cached.fingerprint == fingerprint {
                    jsx_analyses.insert(file.relative.clone(), cached.analysis.clone());
                    next_jsx.insert(file.relative.clone(), cached);
                    continue;
                }
            }
        }

        let source = match fs::read_to_string(&file.absolute) {
            Ok(source) => source,
            Err(error) => {
                warnings.push(format!("{}: {error}", file.relative));
                continue;
            }
        };

        match analyze_jsx_file(&file.absolute, &source) {
            Ok(analysis) => {
                let fingerprint = fingerprint.unwrap_or(cache::FileFingerprint {
                    modified_ns: 0,
                    size: 0,
                });
                next_jsx.insert(
                    file.relative.clone(),
                    CachedJsx {
                        fingerprint,
                        analysis: analysis.clone(),
                    },
                );
                jsx_analyses.insert(file.relative.clone(), analysis);
            }
            Err(error) => warnings.push(error),
        }
    }

    cache.jsx = next_jsx;

    let mut old_framework = std::mem::take(&mut cache.framework);
    let mut framework_analyses = BTreeMap::new();
    let mut next_framework = BTreeMap::new();

    for file in &framework_files {
        let fingerprint = file_fingerprint(&file.absolute);
        let force = force_changed(&file.relative);

        if !force {
            if let (Some(cached), Some(fingerprint)) =
                (old_framework.remove(&file.relative), fingerprint)
            {
                if cached.fingerprint == fingerprint {
                    framework_analyses.insert(file.relative.clone(), cached.analysis.clone());
                    next_framework.insert(file.relative.clone(), cached);
                    continue;
                }
            }
        }

        let source = match fs::read_to_string(&file.absolute) {
            Ok(source) => source,
            Err(error) => {
                warnings.push(format!("{}: {error}", file.relative));
                continue;
            }
        };

        if let Some(analysis) = analyze_markup_file(&file.relative, &source) {
            let fingerprint = fingerprint.unwrap_or(cache::FileFingerprint {
                modified_ns: 0,
                size: 0,
            });
            next_framework.insert(
                file.relative.clone(),
                CachedFramework {
                    fingerprint,
                    analysis: analysis.clone(),
                },
            );
            framework_analyses.insert(file.relative.clone(), analysis);
        }
    }

    cache.framework = next_framework;

    let mut registry = GlobalTokenRegistry::default();
    for analysis in css_analyses.values() {
        for token in &analysis.global_tokens {
            registry.insert(token.clone());
        }
    }

    let (boundary_nodes, route_records, action_index, boundary_edges) =
        assemble_boundaries(&boundary_analyses, &workspace);
    let (components, edges) = assemble_components(
        &jsx_analyses,
        &css_analyses,
        &registry,
        &route_records,
        &action_index,
        &workspace,
    );
    let style_nodes = assemble_styles(&css_analyses, &workspace);
    let (route_nodes, route_edges) = assemble_route_nodes(&jsx_analyses, &workspace);
    let existing_component_ids = components
        .iter()
        .map(|node| node.id.clone())
        .collect::<BTreeSet<_>>();
    let (framework_nodes, framework_edges) = assemble_framework_nodes(
        &framework_analyses,
        &boundary_analyses,
        &workspace,
        &existing_component_ids,
    );
    let (tanstack_nodes, tanstack_edges) =
        assemble_tanstack_nodes(&boundary_analyses, &workspace, &existing_component_ids);
    let existing_route_paths = route_nodes
        .iter()
        .chain(framework_nodes.iter())
        .filter(|node| node.kind == "route")
        .filter_map(|node| {
            Some((
                node.framework.clone().unwrap_or_default(),
                node.route.clone()?,
            ))
        })
        .collect::<BTreeSet<_>>();
    let (vue_router_nodes, vue_router_edges) =
        assemble_vue_router_nodes(&boundary_analyses, &workspace, &existing_route_paths);

    let mut nodes = components;
    nodes.extend(route_nodes);
    nodes.extend(framework_nodes);
    nodes.extend(tanstack_nodes);
    nodes.extend(vue_router_nodes);
    nodes.extend(style_nodes);
    nodes.extend(boundary_nodes);
    nodes.sort_by(|left, right| {
        layer_rank(&left.layer)
            .cmp(&layer_rank(&right.layer))
            .then_with(|| left.id.cmp(&right.id))
    });

    let mut edges = edges;
    edges.extend(boundary_edges);
    edges.extend(route_edges);
    edges.extend(framework_edges);
    edges.extend(tanstack_edges);
    edges.extend(vue_router_edges);
    edges.sort_by(|left, right| left.id.cmp(&right.id));

    attach_data_flow(&mut nodes, &edges, &jsx_analyses);
    attach_framework_metadata(&mut nodes);

    let mut scanned_files = BTreeSet::new();
    scanned_files.extend(css_analyses.keys().cloned());
    scanned_files.extend(jsx_analyses.keys().cloned());
    scanned_files.extend(boundary_analyses.keys().cloned());
    scanned_files.extend(framework_analyses.keys().cloned());

    let tokens = registry.values();
    let duration_ms = started.elapsed().as_millis() as u64;
    let topology = Topology {
        schema_version: SCHEMA_VERSION,
        generator: Generator {
            name: GENERATOR_NAME.to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        },
        root: root.display().to_string(),
        generated_at,
        stats: Stats {
            files_scanned: scanned_files.len(),
            duration_ms,
            warnings,
        },
        nodes,
        edges,
        tokens,
        workspace: workspace.info(),
    };
    let patch = make_patch(cache.topology.as_ref(), &topology);
    cache.topology = Some(topology.clone());

    Ok((topology, patch))
}

fn assemble_framework_nodes(
    framework_analyses: &BTreeMap<String, FrameworkAnalysis>,
    boundary_analyses: &BTreeMap<String, network::BoundaryAnalysis>,
    workspace: &Workspace,
    existing_component_ids: &BTreeSet<String>,
) -> (Vec<Node>, Vec<Edge>) {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut layouts: Vec<(String, String, String)> = Vec::new();
    let mut routes: Vec<(String, String, String)> = Vec::new();
    let mut middleware_nodes: BTreeMap<String, String> = BTreeMap::new();
    let mut component_ids = existing_component_ids.clone();
    component_ids.extend(
        framework_analyses
            .iter()
            .filter(|(_, analysis)| analysis.role != FileRole::Middleware)
            .map(|(relative, _)| format!("component:{relative}")),
    );

    for relative in boundary_analyses.keys() {
        let normalized = relative.replace('\\', "/");
        if !normalized.contains("/middleware/") && !normalized.starts_with("middleware/") {
            continue;
        }

        let stem = Path::new(relative)
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("middleware");
        let framework = if workspace
            .frameworks_for_file(relative)
            .iter()
            .any(|framework| framework == "nuxt")
        {
            "nuxt"
        } else {
            "vue"
        };
        let middleware_id = format!("middleware:{relative}");
        nodes.push(Node {
            id: middleware_id.clone(),
            layer: "boundary".to_string(),
            kind: "middleware".to_string(),
            name: format!("{stem} Middleware"),
            file: relative.clone(),
            package: workspace.package_for_file(relative),
            route: None,
            symbol: Some(stem.to_string()),
            framework: Some(framework.to_string()),
            runtime: Some("server".to_string()),
            source: Some(Source {
                file: relative.clone(),
                line: 1,
                column: 1,
            }),
            meta: None,
            metadata: Some(BTreeMap::from([
                ("fileRole".to_string(), json!("middleware")),
                ("framework".to_string(), json!(framework)),
            ])),
        });
        middleware_nodes.insert(stem.to_string(), middleware_id);
    }

    for (relative, analysis) in framework_analyses {
        let framework = framework_name(analysis, workspace);
        let package = workspace.package_for_file(relative);
        let component_id = format!("component:{relative}");
        let role = match analysis.role {
            FileRole::Page => "page",
            FileRole::Layout => "layout",
            FileRole::Middleware => "middleware",
            FileRole::Component => "component",
        };

        if analysis.role != FileRole::Middleware {
            nodes.push(Node {
                id: component_id.clone(),
                layer: "meso".to_string(),
                kind: "ui_component".to_string(),
                name: analysis
                    .component_name
                    .clone()
                    .unwrap_or_else(|| component_name(relative)),
                file: relative.clone(),
                package: package.clone(),
                route: analysis.route_path.clone(),
                symbol: analysis.component_name.clone(),
                framework: Some(framework.clone()),
                runtime: Some(
                    if framework == "astro" {
                        "server"
                    } else {
                        "universal"
                    }
                    .to_string(),
                ),
                source: Some(Source {
                    file: relative.clone(),
                    line: 1,
                    column: 1,
                }),
                meta: Some(NodeMeta {
                    framework: None,
                    store_kind: None,
                    is_server_component: Some(framework == "astro"),
                    is_dynamic: None,
                    is_island: None,
                    hydration: None,
                    style_metrics: None,
                    network_calls: None,
                    data_flow: Some(NodeDataFlowMeta {
                        providers: Vec::new(),
                        data_role: "passive".to_string(),
                        fetch_signals: Vec::new(),
                        re_render_surface_count: 0,
                        side_effects: analysis.side_effects.clone(),
                        state_management: analysis.state_management.clone(),
                    }),
                    used_stores: (!analysis.used_stores.is_empty())
                        .then_some(analysis.used_stores.clone()),
                    props: (!analysis.props.is_empty()).then_some(analysis.props.clone()),
                }),
                metadata: Some(BTreeMap::from([
                    ("fileRole".to_string(), json!(role)),
                    ("framework".to_string(), json!(framework)),
                    ("unifiedKind".to_string(), json!("UiComponent")),
                    ("hasStyleBlock".to_string(), json!(analysis.has_style_block)),
                    ("scriptLine".to_string(), json!(analysis.script_line)),
                ])),
            });

            for import in &analysis.imports {
                if let Some(resolved) = workspace.resolve_import(relative, import) {
                    let target_id = format!("component:{}", resolved.relative);
                    if resolved.package != package
                        && resolved.package.is_some()
                        && existing_component_ids.contains(&target_id)
                    {
                        edges.push(Edge {
                            id: format!("edge:cross:framework:{}:{}", relative, resolved.relative),
                            kind: "cross_package".to_string(),
                            source: component_id.clone(),
                            target: target_id,
                            label: resolved.package.clone(),
                            metadata: Some(BTreeMap::from([
                                ("fromPackage".to_string(), json!(package)),
                                ("toPackage".to_string(), json!(resolved.package)),
                                ("resource".to_string(), json!("component")),
                            ])),
                        });
                    }
                }
            }
        }

        match analysis.role {
            FileRole::Page => {
                if let Some(route_path) = &analysis.route_path {
                    let route_id = format!("macro:route:{relative}");
                    nodes.push(Node {
                        id: route_id.clone(),
                        layer: "macro".to_string(),
                        kind: "route".to_string(),
                        name: route_path.clone(),
                        file: relative.clone(),
                        package: package.clone(),
                        route: Some(route_path.clone()),
                        symbol: None,
                        framework: Some(framework.clone()),
                        runtime: None,
                        source: Some(Source {
                            file: relative.clone(),
                            line: 1,
                            column: 1,
                        }),
                        meta: None,
                        metadata: Some(BTreeMap::from([
                            ("fileRole".to_string(), json!("page")),
                            ("framework".to_string(), json!(framework)),
                        ])),
                    });
                    edges.push(Edge {
                        id: format!("edge:framework:renders:{}", relative),
                        kind: "renders".to_string(),
                        source: route_id.clone(),
                        target: component_id.clone(),
                        label: None,
                        metadata: Some(BTreeMap::from([("via".to_string(), json!("page"))])),
                    });
                    routes.push((route_id, framework.clone(), relative.clone()));
                }

                for island in &analysis.islands {
                    let island_id = format!("island:{}:{}", relative, island.component);
                    nodes.push(Node {
                        id: island_id.clone(),
                        layer: "meso".to_string(),
                        kind: "island".to_string(),
                        name: format!("{} · {}", island.component, island.hydration),
                        file: relative.clone(),
                        package: package.clone(),
                        route: analysis.route_path.clone(),
                        symbol: Some(island.component.clone()),
                        framework: Some("astro".to_string()),
                        runtime: Some("client".to_string()),
                        source: Some(Source {
                            file: relative.clone(),
                            line: 1,
                            column: 1,
                        }),
                        meta: Some(NodeMeta {
                            framework: None,
                            store_kind: None,
                            is_server_component: Some(false),
                            is_dynamic: None,
                            is_island: Some(true),
                            hydration: Some(island.hydration.clone()),
                            style_metrics: None,
                            network_calls: None,
                            data_flow: None,
                            used_stores: None,
                            props: None,
                        }),
                        metadata: Some(BTreeMap::from([
                            ("island".to_string(), json!(true)),
                            ("hydration".to_string(), json!(island.hydration)),
                            ("source".to_string(), json!(island.source)),
                        ])),
                    });
                    edges.push(Edge {
                        id: format!("edge:island:{}:{}", relative, island.component),
                        kind: "dynamic_imports".to_string(),
                        source: component_id.clone(),
                        target: island_id.clone(),
                        label: Some(island.hydration.clone()),
                        metadata: Some(BTreeMap::from([("island".to_string(), json!(true))])),
                    });

                    if let Some(import_source) = &island.source {
                        if let Some(resolved) = workspace.resolve_import(relative, import_source) {
                            let target_id = format!("component:{}", resolved.relative);
                            if component_ids.contains(&target_id) {
                                edges.push(Edge {
                                    id: format!(
                                        "edge:island:component:{}:{}",
                                        relative, resolved.relative
                                    ),
                                    kind: "renders".to_string(),
                                    source: island_id,
                                    target: target_id,
                                    label: None,
                                    metadata: Some(BTreeMap::from([(
                                        "via".to_string(),
                                        json!("island"),
                                    )])),
                                });
                            }
                        }
                    }
                }
            }
            FileRole::Layout => {
                let layout_id = format!("macro:layout:{relative}");
                let layout_name = layout_display_name(relative);
                nodes.push(Node {
                    id: layout_id.clone(),
                    layer: "macro".to_string(),
                    kind: "layout".to_string(),
                    name: layout_name,
                    file: relative.clone(),
                    package: package.clone(),
                    route: analysis.route_path.clone(),
                    symbol: None,
                    framework: Some(framework.clone()),
                    runtime: None,
                    source: Some(Source {
                        file: relative.clone(),
                        line: 1,
                        column: 1,
                    }),
                    meta: None,
                    metadata: Some(BTreeMap::from([
                        ("fileRole".to_string(), json!("layout")),
                        ("rootLayout".to_string(), json!(analysis.is_root_layout)),
                        ("framework".to_string(), json!(framework)),
                    ])),
                });
                edges.push(Edge {
                    id: format!("edge:framework:renders:{}", relative),
                    kind: "renders".to_string(),
                    source: layout_id.clone(),
                    target: component_id,
                    label: None,
                    metadata: Some(BTreeMap::from([("via".to_string(), json!("layout"))])),
                });
                layouts.push((layout_id, framework.clone(), relative.clone()));
            }
            FileRole::Middleware => {
                let middleware_id = format!("middleware:{relative}");
                let stem = Path::new(relative)
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .unwrap_or("middleware");
                nodes.push(Node {
                    id: middleware_id.clone(),
                    layer: "boundary".to_string(),
                    kind: "middleware".to_string(),
                    name: format!("{} Middleware", component_name(relative)),
                    file: relative.clone(),
                    package: package.clone(),
                    route: None,
                    symbol: Some(stem.to_string()),
                    framework: Some(framework.clone()),
                    runtime: Some("server".to_string()),
                    source: Some(Source {
                        file: relative.clone(),
                        line: 1,
                        column: 1,
                    }),
                    meta: None,
                    metadata: Some(BTreeMap::from([
                        ("fileRole".to_string(), json!("middleware")),
                        ("framework".to_string(), json!(framework)),
                    ])),
                });
                middleware_nodes.insert(stem.to_string(), middleware_id);
            }
            FileRole::Component => {}
        }
    }

    for (route_id, framework, relative) in &routes {
        if let Some((layout_id, _, _)) =
            layouts
                .iter()
                .find(|(_, layout_framework, layout_relative)| {
                    layout_framework == framework
                        && framework_analyses
                            .get(layout_relative)
                            .is_some_and(|analysis| analysis.is_root_layout)
                })
        {
            edges.push(Edge {
                id: format!("edge:framework:routes:{}:{}", layout_id, relative),
                kind: "routes_to".to_string(),
                source: layout_id.clone(),
                target: route_id.clone(),
                label: None,
                metadata: Some(BTreeMap::from([("via".to_string(), json!("layout"))])),
            });
        }

        if let Some(analysis) = framework_analyses.get(relative) {
            for middleware in &analysis.middleware {
                if let Some(middleware_id) = middleware_nodes.get(middleware) {
                    edges.push(Edge {
                        id: format!("edge:middleware:{}:{}", route_id, middleware_id),
                        kind: "routes_to".to_string(),
                        source: route_id.clone(),
                        target: middleware_id.clone(),
                        label: Some(middleware.clone()),
                        metadata: Some(BTreeMap::from([("via".to_string(), json!("middleware"))])),
                    });
                }
            }
        }
    }

    (nodes, edges)
}

fn assemble_tanstack_nodes(
    boundary_analyses: &BTreeMap<String, network::BoundaryAnalysis>,
    workspace: &Workspace,
    existing_component_ids: &BTreeSet<String>,
) -> (Vec<Node>, Vec<Edge>) {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    for (relative, analysis) in boundary_analyses {
        for route_path in &analysis.route_definitions {
            let slug = route_path
                .trim_matches('/')
                .replace('/', "_")
                .replace('$', "");
            let route_id = format!(
                "macro:route:tanstack:{}:{}",
                relative,
                if slug.is_empty() { "root" } else { &slug }
            );
            let package = workspace.package_for_file(relative);
            nodes.push(Node {
                id: route_id.clone(),
                layer: "macro".to_string(),
                kind: "route".to_string(),
                name: route_path.clone(),
                file: relative.clone(),
                package: package.clone(),
                route: Some(route_path.clone()),
                symbol: None,
                framework: Some("tanstack".to_string()),
                runtime: None,
                source: Some(Source {
                    file: relative.clone(),
                    line: 1,
                    column: 1,
                }),
                meta: None,
                metadata: Some(BTreeMap::from([
                    ("fileRole".to_string(), json!("route")),
                    ("framework".to_string(), json!("tanstack")),
                ])),
            });

            let component_id = format!("component:{relative}");
            if existing_component_ids.contains(&component_id) {
                edges.push(Edge {
                    id: format!("edge:tanstack:renders:{}:{}", relative, route_id),
                    kind: "renders".to_string(),
                    source: route_id,
                    target: component_id,
                    label: None,
                    metadata: Some(BTreeMap::from([("via".to_string(), json!("tanstack"))])),
                });
            }
        }
    }

    (nodes, edges)
}

fn assemble_vue_router_nodes(
    boundary_analyses: &BTreeMap<String, network::BoundaryAnalysis>,
    workspace: &Workspace,
    existing_route_paths: &BTreeSet<(String, String)>,
) -> (Vec<Node>, Vec<Edge>) {
    let mut nodes = Vec::new();

    for (relative, analysis) in boundary_analyses {
        if analysis.vue_routes.is_empty() {
            continue;
        }

        let frameworks = workspace.frameworks_for_file(relative);
        let framework = if frameworks.iter().any(|framework| framework == "nuxt") {
            "nuxt"
        } else {
            "vue"
        };

        for route_path in &analysis.vue_routes {
            if existing_route_paths.contains(&(framework.to_string(), route_path.clone())) {
                continue;
            }

            let slug = route_path
                .trim_matches('/')
                .replace('/', "_")
                .replace(['[', ']', '*', '?', ':'], "");
            nodes.push(Node {
                id: format!(
                    "macro:route:vue-router:{}:{}",
                    relative,
                    if slug.is_empty() { "root" } else { &slug }
                ),
                layer: "macro".to_string(),
                kind: "route".to_string(),
                name: route_path.clone(),
                file: relative.clone(),
                package: workspace.package_for_file(relative),
                route: Some(route_path.clone()),
                symbol: None,
                framework: Some(framework.to_string()),
                runtime: None,
                source: Some(Source {
                    file: relative.clone(),
                    line: 1,
                    column: 1,
                }),
                meta: None,
                metadata: Some(BTreeMap::from([
                    ("fileRole".to_string(), json!("route")),
                    ("framework".to_string(), json!(framework)),
                    ("router".to_string(), json!("vue-router")),
                ])),
            });
        }
    }

    (nodes, Vec::new())
}

fn attach_data_flow(nodes: &mut [Node], edges: &[Edge], analyses: &BTreeMap<String, JsxAnalysis>) {
    let component_ids = nodes
        .iter()
        .filter(|node| node.kind == "component" || node.kind == "ui_component")
        .map(|node| node.id.clone())
        .collect::<BTreeSet<_>>();
    let mut adjacency: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for edge in edges {
        adjacency
            .entry(edge.source.clone())
            .or_default()
            .push(edge.target.clone());
    }

    for node in nodes {
        let Some(analysis) = analyses.get(&node.file) else {
            continue;
        };

        let data_role = if analysis.fetch_signals.is_empty() {
            "passive"
        } else {
            "fetcher"
        };

        let meta = node.meta.get_or_insert_with(NodeMeta::default);
        meta.data_flow = Some(NodeDataFlowMeta {
            providers: analysis.providers.clone(),
            data_role: data_role.to_string(),
            fetch_signals: analysis.fetch_signals.clone(),
            re_render_surface_count: downstream_component_count(
                &node.id,
                &adjacency,
                &component_ids,
            ),
            side_effects: analysis.side_effects.clone(),
            state_management: analysis.state_management.clone(),
        });
        if !analysis.used_stores.is_empty() {
            meta.used_stores = Some(analysis.used_stores.clone());
        }
        if !analysis.props.is_empty() {
            meta.props = Some(analysis.props.clone());
        }
    }
}

fn attach_framework_metadata(nodes: &mut [Node]) {
    for node in nodes {
        let meta = node.meta.get_or_insert_with(NodeMeta::default);
        let framework = normalize_node_framework(node.framework.as_deref(), &node.file);
        meta.framework = Some(framework.to_string());

        let state = meta
            .data_flow
            .as_ref()
            .map(|flow| flow.state_management.clone())
            .unwrap_or_default();
        meta.store_kind = if state.iter().any(|value| value == "Pinia") {
            Some("pinia".to_string())
        } else if state.iter().any(|value| value == "Zustand") {
            Some("zustand".to_string())
        } else if state.iter().any(|value| value == "Nano Stores") {
            Some("nanostores".to_string())
        } else if meta
            .used_stores
            .as_ref()
            .is_some_and(|stores| !stores.is_empty())
        {
            Some("custom".to_string())
        } else {
            None
        };
    }
}

fn normalize_node_framework(framework: Option<&str>, file: &str) -> &'static str {
    match framework.unwrap_or_default().to_lowercase().as_str() {
        "next" | "nextjs" => "next",
        "react" | "tanstack" => "react",
        "vue" => "vue",
        "nuxt" => "nuxt",
        "astro" => "astro",
        "svelte" | "sveltekit" => "svelte",
        "hono" => "hono",
        "nest" | "nestjs" | "express" => "nestjs",
        _ if file.ends_with(".vue") => "vue",
        _ if file.ends_with(".astro") => "astro",
        _ if file.ends_with(".svelte") => "svelte",
        _ => "ts",
    }
}

fn downstream_component_count(
    start: &str,
    adjacency: &BTreeMap<String, Vec<String>>,
    component_ids: &BTreeSet<String>,
) -> u32 {
    let mut visited = BTreeSet::from([start.to_string()]);
    let mut queue = vec![start.to_string()];
    let mut count = 0;

    while let Some(current) = queue.pop() {
        for target in adjacency.get(&current).into_iter().flatten() {
            if !visited.insert(target.clone()) {
                continue;
            }
            if component_ids.contains(target) {
                count += 1;
            }
            queue.push(target.clone());
        }
    }

    count
}

fn detect_component_framework(
    relative: &str,
    analysis: &JsxAnalysis,
    workspace: &Workspace,
) -> String {
    let extension = Path::new(relative)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "vue" => return "vue".to_string(),
        "astro" => return "astro".to_string(),
        "svelte" => return "svelte".to_string(),
        _ => {}
    }

    let imported = |prefix: &str| {
        analysis.local_imports.iter().any(|import| {
            import.source == prefix || import.source.starts_with(&format!("{prefix}/"))
        })
    };

    if imported("lit") || imported("lit-html") || imported("lit-element") {
        return "lit".to_string();
    }
    if imported("solid-js") {
        return "solid".to_string();
    }
    if imported("preact") {
        return "preact".to_string();
    }
    if imported("react") || imported("next") {
        return "react".to_string();
    }

    for framework in workspace.frameworks_for_file(relative) {
        match framework.as_str() {
            "solid" => return "solid".to_string(),
            "preact" => return "preact".to_string(),
            "lit" => return "lit".to_string(),
            "vue" | "nuxt" => return "vue".to_string(),
            "svelte" | "sveltekit" => return "svelte".to_string(),
            "astro" => return "astro".to_string(),
            "react" | "next" | "tanstack" => return "react".to_string(),
            _ => {}
        }
    }

    "react".to_string()
}

fn framework_name(analysis: &FrameworkAnalysis, workspace: &Workspace) -> String {
    let frameworks = workspace.frameworks_for_file(&analysis.relative);

    match analysis.framework.as_str() {
        "vue" if frameworks.iter().any(|framework| framework == "nuxt") => "nuxt".to_string(),
        "svelte" if frameworks.iter().any(|framework| framework == "sveltekit") => {
            "sveltekit".to_string()
        }
        framework => framework.to_string(),
    }
}

fn assemble_boundaries(
    boundary_analyses: &BTreeMap<String, network::BoundaryAnalysis>,
    workspace: &Workspace,
) -> (
    Vec<Node>,
    Vec<RouteRecord>,
    BTreeMap<String, Vec<String>>,
    Vec<Edge>,
) {
    let mut boundary_nodes = Vec::new();
    let mut boundary_edges = Vec::new();
    let mut route_map: BTreeMap<String, RouteAccumulator> = BTreeMap::new();
    let mut action_index: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut backend_node_ids = BTreeSet::new();

    for (relative, analysis) in boundary_analyses {
        for route in &analysis.backend_routes {
            let route_id = format!(
                "backend:{}:{}:{}:{}",
                relative, route.method, route.path, route.line
            );
            if !backend_node_ids.insert(route_id.clone()) {
                continue;
            }

            boundary_nodes.push(Node {
                id: route_id.clone(),
                layer: "boundary".to_string(),
                kind: "backend_route".to_string(),
                name: format!("{} {}", route.method, route.path),
                file: relative.clone(),
                package: workspace.package_for_file(relative),
                route: Some(route.path.clone()),
                symbol: None,
                framework: Some(route.framework.clone()),
                runtime: Some("server".to_string()),
                source: Some(Source {
                    file: relative.clone(),
                    line: route.line,
                    column: 1,
                }),
                meta: None,
                metadata: Some(BTreeMap::from([
                    ("unifiedKind".to_string(), json!("BackendRoute")),
                    ("method".to_string(), json!(route.method)),
                    ("framework".to_string(), json!(route.framework)),
                ])),
            });

            if let Some(controller) = &route.controller {
                let controller_id = format!("controller:{}:{}", relative, controller);
                if backend_node_ids.insert(controller_id.clone()) {
                    boundary_nodes.push(Node {
                        id: controller_id.clone(),
                        layer: "boundary".to_string(),
                        kind: "controller".to_string(),
                        name: controller.clone(),
                        file: relative.clone(),
                        package: workspace.package_for_file(relative),
                        route: None,
                        symbol: Some(controller.clone()),
                        framework: Some("nest".to_string()),
                        runtime: Some("server".to_string()),
                        source: Some(Source {
                            file: relative.clone(),
                            line: 1,
                            column: 1,
                        }),
                        meta: None,
                        metadata: Some(BTreeMap::from([(
                            "unifiedKind".to_string(),
                            json!("Controller"),
                        )])),
                    });
                }

                boundary_edges.push(Edge {
                    id: format!("exposes:{}:{}", controller_id, route_id),
                    kind: "exposes".to_string(),
                    source: controller_id,
                    target: route_id,
                    label: None,
                    metadata: None,
                });
            }
        }

        if let Some(route) = &analysis.route {
            let entry = route_map
                .entry(route.path.clone())
                .or_insert_with(|| RouteAccumulator {
                    node_id: format!("api:{}", route.path),
                    path: route.path.clone(),
                    methods: BTreeSet::new(),
                    file: relative.clone(),
                    line: route.line,
                });

            entry.methods.extend(route.methods.iter().cloned());
            entry.line = entry.line.min(route.line);
        }

        for action in &analysis.actions {
            let node = action_node(relative, action, workspace);
            action_index
                .entry(action.name.clone())
                .or_default()
                .push(node.id.clone());
            boundary_nodes.push(node);
        }
    }

    let mut route_records = Vec::new();

    for route in route_map.values() {
        let methods = route.methods.iter().cloned().collect::<Vec<_>>();
        let name = if methods.len() == 1 && methods[0] != "ANY" {
            format!("{} {}", methods[0], route.path)
        } else {
            route.path.clone()
        };

        boundary_nodes.push(Node {
            id: route.node_id.clone(),
            layer: "boundary".to_string(),
            kind: "api_endpoint".to_string(),
            name,
            file: route.file.clone(),
            package: workspace.package_for_file(&route.file),
            route: Some(route.path.clone()),
            symbol: None,
            framework: Some("next".to_string()),
            runtime: Some("server".to_string()),
            source: Some(Source {
                file: route.file.clone(),
                line: route.line,
                column: 1,
            }),
            meta: None,
            metadata: Some(BTreeMap::from([(
                "methods".to_string(),
                json!(methods.join(", ")),
            )])),
        });

        route_records.push(RouteRecord {
            path: route.path.clone(),
            node_id: route.node_id.clone(),
        });
    }

    (boundary_nodes, route_records, action_index, boundary_edges)
}

fn component_file_type(relative: &str) -> &'static str {
    let file = Path::new(relative)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();

    match file {
        "server.tsx" | "server.jsx" => "server",
        "client.tsx" | "client.jsx" => "client",
        "template.tsx" | "template.jsx" => "template",
        "skeleton.tsx" | "skeleton.jsx" => "skeleton",
        _ => "component",
    }
}

fn component_folder_name(relative: &str) -> Option<String> {
    let path = Path::new(relative);
    let file = path.file_name().and_then(|name| name.to_str())?;
    if !matches!(
        file,
        "server.tsx" | "server.jsx" | "client.tsx" | "client.jsx"
    ) {
        return None;
    }

    let parent = path.parent()?.file_name().and_then(|name| name.to_str())?;
    Some(component_name(&format!("{parent}/index.tsx")))
}

fn is_template_file(relative: &str) -> bool {
    Path::new(relative)
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with("template."))
}

fn imports_graphql_api(analysis: &JsxAnalysis) -> bool {
    analysis.local_imports.iter().any(|import| {
        if import.type_only {
            return false;
        }
        let source = import.source.replace('\\', "/");
        source.contains("lib/apis/graphql") || source.contains("_handlers")
    })
}

fn assemble_components(
    jsx_analyses: &BTreeMap<String, JsxAnalysis>,
    css_analyses: &BTreeMap<String, StyleSheetAnalysis>,
    registry: &GlobalTokenRegistry,
    route_records: &[RouteRecord],
    action_index: &BTreeMap<String, Vec<String>>,
    workspace: &Workspace,
) -> (Vec<Node>, Vec<Edge>) {
    let mut components = Vec::new();
    let mut edges = Vec::new();
    let mut pending_render_edges: Vec<PendingImport> = Vec::new();

    for (relative, analysis) in jsx_analyses {
        // Entry files (server.tsx / client.tsx) often contain no visual markup.
        // Merge the imported template analysis so JSX classes and stylesheet
        // imports still belong to the widget entry node.
        // File entry thường không chứa JSX; gộp template để giữ class/CSS.
        let mut effective = analysis.clone();
        for import in &analysis.local_imports {
            if import.type_only {
                continue;
            }
            if let Some(resolved) = workspace.resolve_import(relative, &import.source) {
                if is_template_file(&resolved.relative) {
                    if let Some(template) = jsx_analyses.get(&resolved.relative) {
                        effective.has_jsx |= template.has_jsx;
                        effective.has_dynamic_import |= template.has_dynamic_import;
                        effective
                            .used_classes
                            .extend(template.used_classes.iter().cloned());
                        effective
                            .consumed_tokens
                            .extend(template.consumed_tokens.iter().cloned());
                        effective
                            .inline_tokens
                            .extend(template.inline_tokens.iter().cloned());
                        effective.imports.extend(template.imports.iter().cloned());
                        effective
                            .network_calls
                            .extend(template.network_calls.iter().cloned());
                        effective
                            .providers
                            .extend(template.providers.iter().cloned());
                        effective
                            .fetch_signals
                            .extend(template.fetch_signals.iter().cloned());
                        effective
                            .used_stores
                            .extend(template.used_stores.iter().cloned());
                    }
                }
            }
        }

        let is_lit_component = effective.local_imports.iter().any(|import| {
            import.source == "lit"
                || import.source.starts_with("lit/")
                || import.source == "lit-html"
                || import.source.starts_with("lit-html/")
                || import.source == "lit-element"
        });

        if !effective.has_jsx && !is_lit_component {
            continue;
        }

        let component_type = component_file_type(relative);
        let name = component_folder_name(relative)
            .or_else(|| {
                effective
                    .component_name
                    .clone()
                    .filter(|name| !name.eq_ignore_ascii_case("index"))
            })
            .unwrap_or_else(|| component_name(relative));
        let (style_metrics, stylesheets) =
            build_style_metrics(&effective, relative, css_analyses, registry, workspace);
        let component_id = format!("component:{relative}");
        let mut network_calls = effective.network_calls.clone();

        // Components that import the GraphQL API module or a route handler
        // proxy are clients of the app/api/graphql boundary.
        // Component dùng GraphQL/handler được nối tới boundary /api/graphql.
        if imports_graphql_api(&effective)
            && !network_calls
                .iter()
                .any(|call| call.endpoint == "/api/graphql")
        {
            network_calls.push(NetworkCall {
                endpoint: "/api/graphql".to_string(),
                method: "POST".to_string(),
                call_type: "graphql".to_string(),
            });
        }

        let mut matched_actions = BTreeSet::new();

        for import in &analysis.local_imports {
            if import.type_only {
                continue;
            }
            if let Some(resolved) = workspace.resolve_import(relative, &import.source) {
                pending_render_edges.push(PendingImport {
                    source_id: component_id.clone(),
                    source_relative: relative.clone(),
                    source_package: workspace.package_for_file(relative),
                    target_relative: resolved.relative,
                    target_package: resolved.package,
                    via: import.source.clone(),
                });
            }
        }

        for call in &network_calls {
            let Some(route) = route_records
                .iter()
                .find(|route| route_matches(&route.path, &call.endpoint, &call.call_type))
            else {
                continue;
            };

            edges.push(Edge {
                id: format!("edge:calls:{}:{}:{}", relative, route.node_id, call.method),
                kind: "calls_api".to_string(),
                source: component_id.clone(),
                target: route.node_id.clone(),
                label: Some(call.method.clone()),
                metadata: Some(BTreeMap::from([("via".to_string(), json!(call.call_type))])),
            });
        }

        for function_name in &analysis.called_functions {
            let Some(action_ids) = action_index.get(function_name) else {
                continue;
            };

            matched_actions.insert(function_name.clone());

            for action_id in action_ids {
                edges.push(Edge {
                    id: format!("edge:action:{}:{}", relative, action_id),
                    kind: "invokes_action".to_string(),
                    source: component_id.clone(),
                    target: action_id.clone(),
                    label: None,
                    metadata: Some(BTreeMap::from([("via".to_string(), json!("action"))])),
                });
            }
        }

        for action_name in matched_actions {
            network_calls.push(NetworkCall {
                endpoint: action_name,
                method: "ACTION".to_string(),
                call_type: "action".to_string(),
            });
        }

        let mut seen_calls = BTreeSet::new();
        network_calls.retain(|call| {
            seen_calls.insert((
                call.endpoint.clone(),
                call.method.clone(),
                call.call_type.clone(),
            ))
        });

        let runtime = match component_type {
            "server" => "server",
            "client" => "client",
            _ => effective.runtime,
        };

        components.push(Node {
            id: component_id.clone(),
            layer: "meso".to_string(),
            kind: "component".to_string(),
            name: name.clone(),
            file: relative.clone(),
            package: workspace.package_for_file(relative),
            route: None,
            symbol: Some(name),
            framework: Some(detect_component_framework(relative, &effective, workspace)),
            runtime: Some(runtime.to_string()),
            source: Some(Source {
                file: relative.clone(),
                line: analysis.source_line,
                column: analysis.source_column,
            }),
            meta: Some(NodeMeta {
                framework: None,
                store_kind: None,
                is_server_component: match component_type {
                    "server" => Some(true),
                    "client" => Some(false),
                    _ => None,
                },
                is_dynamic: Some(effective.has_dynamic_import),
                is_island: None,
                hydration: None,
                style_metrics: Some(style_metrics),
                network_calls: (!network_calls.is_empty()).then_some(network_calls),
                data_flow: None,
                used_stores: None,
                props: None,
            }),
            metadata: Some(BTreeMap::from([
                (
                    "usedClasses".to_string(),
                    json!(effective.used_classes.len()),
                ),
                ("importedStylesheets".to_string(), json!(stylesheets.len())),
                ("componentType".to_string(), json!(component_type)),
                (
                    "isServerComponent".to_string(),
                    json!(component_type == "server"),
                ),
                (
                    "isClientComponent".to_string(),
                    json!(component_type == "client"),
                ),
            ])),
        });

        for stylesheet in stylesheets {
            let imported = effective.imports.iter().any(|import| {
                workspace
                    .resolve_import(relative, &import.source)
                    .is_some_and(|resolved| resolved.relative == stylesheet)
            });
            let is_module = stylesheet.ends_with(".module.css");
            let source_package = workspace.package_for_file(relative);
            let target_package = workspace.package_for_file(&stylesheet);

            edges.push(Edge {
                id: format!("edge:styles:{}:{}", relative, stylesheet),
                kind: "styles_with".to_string(),
                source: component_id.clone(),
                target: format!("style:{stylesheet}"),
                label: (imported && is_module).then(|| "module".to_string()),
                metadata: Some(BTreeMap::from([(
                    "via".to_string(),
                    json!(if imported { "import" } else { "tokens" }),
                )])),
            });

            if source_package != target_package && target_package.is_some() {
                edges.push(Edge {
                    id: format!("edge:cross:style:{}:{}", relative, stylesheet),
                    kind: "cross_package".to_string(),
                    source: component_id.clone(),
                    target: format!("style:{stylesheet}"),
                    label: target_package.clone(),
                    metadata: Some(BTreeMap::from([
                        ("fromPackage".to_string(), json!(source_package)),
                        ("toPackage".to_string(), json!(target_package)),
                        ("resource".to_string(), json!("stylesheet")),
                    ])),
                });
            }
        }
    }

    let component_ids = components
        .iter()
        .map(|node| node.id.clone())
        .collect::<BTreeSet<_>>();
    let mut render_edge_ids = BTreeSet::new();

    for pending in pending_render_edges {
        let target_id = format!("component:{}", pending.target_relative);

        if target_id == pending.source_id || !component_ids.contains(&target_id) {
            continue;
        }

        let cross_package =
            pending.source_package != pending.target_package && pending.target_package.is_some();
        let edge_id = if cross_package {
            format!(
                "edge:cross:component:{}:{}",
                pending.source_relative, pending.target_relative
            )
        } else {
            format!(
                "edge:renders:{}:{}",
                pending.source_relative, pending.target_relative
            )
        };

        if render_edge_ids.insert(edge_id.clone()) {
            edges.push(Edge {
                id: edge_id,
                kind: if cross_package {
                    "cross_package".to_string()
                } else {
                    "renders".to_string()
                },
                source: pending.source_id,
                target: target_id,
                label: cross_package
                    .then(|| pending.target_package.clone())
                    .flatten(),
                metadata: Some(BTreeMap::from([
                    ("via".to_string(), json!(pending.via)),
                    ("fromPackage".to_string(), json!(pending.source_package)),
                    ("toPackage".to_string(), json!(pending.target_package)),
                ])),
            });
        }
    }

    (components, edges)
}

fn assemble_styles(
    css_analyses: &BTreeMap<String, StyleSheetAnalysis>,
    workspace: &Workspace,
) -> Vec<Node> {
    css_analyses
        .iter()
        .map(|(relative, analysis)| Node {
            id: format!("style:{relative}"),
            layer: "micro".to_string(),
            kind: "style".to_string(),
            name: Path::new(relative)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(relative)
                .to_string(),
            file: relative.clone(),
            package: workspace.package_for_file(relative),
            route: None,
            symbol: None,
            framework: Some("lightningcss".to_string()),
            runtime: None,
            source: Some(Source {
                file: relative.clone(),
                line: 1,
                column: 1,
            }),
            meta: None,
            metadata: Some(BTreeMap::from([
                ("isModule".to_string(), json!(analysis.is_module)),
                (
                    "definedClasses".to_string(),
                    json!(analysis.defined_classes.len()),
                ),
                (
                    "definedTokens".to_string(),
                    json!(analysis.defined_tokens.len()),
                ),
                (
                    "blastRadiusWarnings".to_string(),
                    json!(analysis.warnings.len()),
                ),
            ])),
        })
        .collect()
}

fn make_patch(previous: Option<&Topology>, next: &Topology) -> TopologyPatch {
    let old_nodes = previous
        .map(|topology| {
            topology
                .nodes
                .iter()
                .map(|node| (node.id.as_str(), node))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();
    let new_node_ids = next
        .nodes
        .iter()
        .map(|node| node.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut updated_nodes = Vec::new();

    for node in &next.nodes {
        let changed = old_nodes
            .get(node.id.as_str())
            .is_none_or(|old| serde_json::to_value(old).ok() != serde_json::to_value(node).ok());
        if changed {
            updated_nodes.push(node.clone());
        }
    }

    let removed_node_ids = old_nodes
        .keys()
        .filter(|id| !new_node_ids.contains(**id))
        .map(|id| (*id).to_string())
        .collect::<Vec<_>>();

    let old_edges = previous
        .map(|topology| {
            topology
                .edges
                .iter()
                .map(|edge| (edge.id.as_str(), edge))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();
    let new_edge_ids = next
        .edges
        .iter()
        .map(|edge| edge.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut updated_edges = Vec::new();

    for edge in &next.edges {
        let changed = old_edges
            .get(edge.id.as_str())
            .is_none_or(|old| serde_json::to_value(old).ok() != serde_json::to_value(edge).ok());
        if changed {
            updated_edges.push(edge.clone());
        }
    }

    let removed_edge_ids = old_edges
        .keys()
        .filter(|id| !new_edge_ids.contains(**id))
        .map(|id| (*id).to_string())
        .collect::<Vec<_>>();

    TopologyPatch {
        updated_nodes,
        removed_node_ids,
        updated_edges,
        removed_edge_ids,
        tokens: next.tokens.clone(),
        generated_at: next.generated_at.clone(),
        stats: next.stats.clone(),
        workspace: next.workspace.clone(),
    }
}

fn action_node(relative: &str, action: &ActionDefinition, workspace: &Workspace) -> Node {
    Node {
        id: format!("action:{relative}:{}:{}", action.name, action.line),
        layer: "boundary".to_string(),
        kind: "server_action".to_string(),
        name: format!("{}()", action.name),
        file: relative.to_string(),
        package: workspace.package_for_file(relative),
        route: None,
        symbol: Some(action.name.clone()),
        framework: Some("server-action".to_string()),
        runtime: Some("server".to_string()),
        source: Some(Source {
            file: relative.to_string(),
            line: action.line,
            column: 1,
        }),
        meta: None,
        metadata: Some(BTreeMap::from([(
            "actionName".to_string(),
            json!(action.name),
        )])),
    }
}

fn layer_rank(layer: &str) -> u8 {
    match layer {
        "macro" => 0,
        "meso" => 1,
        "micro" => 2,
        _ => 3,
    }
}

fn route_matches(route_path: &str, endpoint: &str, call_type: &str) -> bool {
    let endpoint = normalize_endpoint(endpoint);

    if paths_match(route_path, &endpoint) {
        return true;
    }

    call_type == "rpc" && route_path.contains("trpc")
}

fn normalize_endpoint(endpoint: &str) -> String {
    let mut path = endpoint.split(['?', '#']).next().unwrap_or(endpoint).trim();

    if let Some(scheme_index) = path.find("://") {
        let rest = &path[scheme_index + 3..];
        path = rest.find('/').map_or("/", |slash| &rest[slash..]);
    }

    let mut normalized = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };

    if normalized.len() > 1 {
        normalized = normalized.trim_end_matches('/').to_string();
    }

    normalized
}

fn paths_match(route_path: &str, endpoint: &str) -> bool {
    if route_path == endpoint {
        return true;
    }

    let route_segments = route_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    let endpoint_segments = endpoint
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();

    let catch_all = route_segments
        .last()
        .is_some_and(|segment| segment.starts_with("[...") && segment.ends_with(']'));

    if catch_all {
        if endpoint_segments.len() < route_segments.len() - 1 {
            return false;
        }
    } else if route_segments.len() != endpoint_segments.len() {
        return false;
    }

    route_segments
        .iter()
        .zip(endpoint_segments.iter())
        .enumerate()
        .all(|(index, (route, endpoint))| {
            if index + 1 == route_segments.len() && catch_all {
                return true;
            }
            (route.starts_with('[') && route.ends_with(']')) || route == endpoint
        })
}

fn build_style_metrics(
    analysis: &JsxAnalysis,
    jsx_relative: &str,
    css_analyses: &BTreeMap<String, StyleSheetAnalysis>,
    registry: &GlobalTokenRegistry,
    workspace: &Workspace,
) -> (StyleMetrics, Vec<String>) {
    let mut consumed_tokens = analysis.consumed_tokens.clone();
    consumed_tokens.extend(analysis.inline_tokens.iter().cloned());
    let mut defined_classes = BTreeSet::new();
    let mut defined_tokens = analysis.inline_tokens.clone();
    let mut unused_classes = BTreeSet::new();
    let mut warnings: Vec<BlastRadiusWarning> = Vec::new();
    let mut seen_warnings = BTreeSet::new();
    let mut stylesheets = BTreeSet::new();

    for import in &analysis.imports {
        let Some(resolved) = workspace.resolve_import(jsx_relative, &import.source) else {
            continue;
        };
        if !resolved.relative.ends_with(".css") {
            continue;
        }
        let relative = resolved.relative;
        let Some(css) = css_analyses.get(&relative) else {
            continue;
        };

        stylesheets.insert(relative);
        consumed_tokens.extend(css.consumed_tokens.iter().cloned());
        defined_tokens.extend(css.defined_tokens.iter().cloned());
        defined_classes.extend(css.defined_classes.iter().cloned());

        if css.is_module {
            for class_name in &css.defined_classes {
                if !analysis.used_classes.contains(class_name) {
                    unused_classes.insert(class_name.clone());
                }
            }
        }

        for warning in &css.warnings {
            if seen_warnings.insert(warning.selector.clone()) {
                warnings.push(warning.clone());
            }
        }
    }

    for token in &consumed_tokens {
        if let Some(definition) = registry.get(token) {
            if css_analyses.contains_key(&definition.file) {
                stylesheets.insert(definition.file.clone());
            }
        }
    }

    warnings.sort_by(|left, right| {
        right
            .specificity_score
            .cmp(&left.specificity_score)
            .then_with(|| left.selector.cmp(&right.selector))
    });

    let unknown_tokens = consumed_tokens
        .iter()
        .filter(|token| !registry.contains(token) && !defined_tokens.contains(*token))
        .cloned()
        .collect::<Vec<_>>();

    let metrics = StyleMetrics {
        consumed_tokens: consumed_tokens.into_iter().collect(),
        defined_classes_count: defined_classes.len(),
        unused_classes: unused_classes.into_iter().collect(),
        unknown_tokens: (!unknown_tokens.is_empty()).then_some(unknown_tokens),
        blast_radius_warnings: warnings,
        stylesheets: (!stylesheets.is_empty()).then(|| stylesheets.into_iter().collect()),
    };
    let stylesheet_list = metrics.stylesheets.clone().unwrap_or_default();

    (metrics, stylesheet_list)
}

fn discover_files(
    project_root: &Path,
    scan_root: &Path,
) -> (
    Vec<PathBuf>,
    Vec<SourceFile>,
    Vec<SourceFile>,
    Vec<SourceFile>,
) {
    let mut css_files = Vec::new();
    let mut jsx_files = Vec::new();
    let mut boundary_files = Vec::new();
    let mut framework_files = Vec::new();

    let walker = WalkBuilder::new(scan_root)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .filter_entry(|entry| !is_ignored_path(entry.path()))
        .build();

    for entry in walker.flatten() {
        let path = entry.path();

        if !entry
            .file_type()
            .is_some_and(|file_type| file_type.is_file())
        {
            continue;
        }

        if entry
            .metadata()
            .ok()
            .is_some_and(|metadata| metadata.len() > MAX_SOURCE_BYTES)
        {
            continue;
        }

        let Some(relative) = relative_path(project_root, path) else {
            continue;
        };

        if relative.ends_with(".d.ts") || is_test_or_mock_source(&relative) {
            continue;
        }

        match path.extension().and_then(|extension| extension.to_str()) {
            Some("css") => css_files.push(path.to_path_buf()),
            Some("astro" | "vue" | "svelte") => {
                framework_files.push(SourceFile {
                    relative,
                    absolute: path.to_path_buf(),
                });
            }
            Some("tsx" | "jsx") => {
                let file = SourceFile {
                    relative: relative.clone(),
                    absolute: path.to_path_buf(),
                };
                jsx_files.push(SourceFile {
                    relative: relative.clone(),
                    absolute: path.to_path_buf(),
                });
                boundary_files.push(file);
            }
            Some("ts" | "js" | "mts" | "cts" | "mjs" | "cjs") => {
                let file = SourceFile {
                    relative: relative.clone(),
                    absolute: path.to_path_buf(),
                };
                let is_lit_module = fs::read_to_string(path).ok().is_some_and(|source| {
                    source.contains("from \"lit")
                        || source.contains("from 'lit")
                        || source.contains("LitElement")
                        || source.contains("@customElement")
                });
                if is_lit_module {
                    jsx_files.push(SourceFile {
                        relative: relative.clone(),
                        absolute: path.to_path_buf(),
                    });
                }
                boundary_files.push(file);
            }
            _ => {}
        }
    }

    css_files.sort();
    jsx_files.sort_by(|left, right| left.relative.cmp(&right.relative));
    boundary_files.sort_by(|left, right| left.relative.cmp(&right.relative));
    framework_files.sort_by(|left, right| left.relative.cmp(&right.relative));

    (css_files, jsx_files, boundary_files, framework_files)
}

fn is_test_or_mock_source(relative: &str) -> bool {
    relative.contains("/__tests__/")
        || relative.contains("/__mocks__/")
        || [
            ".test.ts",
            ".test.tsx",
            ".spec.ts",
            ".spec.tsx",
            ".test.js",
            ".test.jsx",
            ".spec.js",
            ".spec.jsx",
        ]
        .iter()
        .any(|suffix| relative.ends_with(suffix))
}

fn is_ignored_path(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };

    matches!(
        name,
        ".git"
            | ".next"
            | ".turbo"
            | ".vite"
            | "coverage"
            | "dist"
            | "routogram-report"
            | "node_modules"
            | "target"
    )
}

fn relative_path(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let parts = relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>();

    Some(parts.join("/"))
}

#[cfg(test)]
mod analyzer_tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn names_widget_entries_from_their_parent_folder() {
        assert_eq!(
            component_folder_name("src/app/[locale]/(site)/_components/hero-banner/server.tsx")
                .as_deref(),
            Some("HeroBanner")
        );
        assert_eq!(
            component_folder_name("src/app/[locale]/_shared/locale-switcher/client.tsx").as_deref(),
            Some("LocaleSwitcher")
        );
        assert_eq!(
            component_folder_name("src/components/feature-shell/index.tsx"),
            None
        );
    }

    #[test]
    fn classifies_component_contract_files() {
        assert_eq!(
            component_file_type("src/app/[locale]/_components/hero-banner/server.tsx"),
            "server"
        );
        assert_eq!(
            component_file_type("src/app/[locale]/_components/hero-banner/client.tsx"),
            "client"
        );
        assert_eq!(
            component_file_type("src/app/[locale]/_components/hero-banner/template.tsx"),
            "template"
        );
        assert_eq!(
            component_file_type("src/app/[locale]/_components/hero-banner/skeleton.tsx"),
            "skeleton"
        );
    }

    #[test]
    fn extracts_vue_lifecycle_and_state_signals() {
        use std::fs;
        use std::time::{SystemTime, UNIX_EPOCH};

        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let root = std::env::temp_dir().join(format!("routogram-vue-{suffix}"));
        let source_dir = root.join("src/components");
        fs::create_dir_all(&source_dir).unwrap();
        fs::write(
            root.join("package.json"),
            r#"{"name":"vue-fixture","dependencies":{"vue":"^3"}}"#,
        )
        .unwrap();
        fs::write(
            source_dir.join("Counter.vue"),
            r#"<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
const props = defineProps<{ title: string; count?: number }>();
const count = ref(0);
watch(count, () => {});
onMounted(() => {});
</script>
<template><div>{{ count }}</div></template>
"#,
        )
        .unwrap();

        let topology = scan_paths(&root, &root, "test".to_string()).unwrap();
        let component = topology
            .nodes
            .iter()
            .find(|node| node.framework.as_deref() == Some("vue"))
            .expect("Vue component node");
        assert_eq!(component.kind, "ui_component");
        let data_flow = component
            .meta
            .as_ref()
            .and_then(|meta| meta.data_flow.as_ref())
            .unwrap();
        assert!(data_flow.side_effects.contains(&"watch".to_string()));
        assert!(data_flow.side_effects.contains(&"onMounted".to_string()));
        assert!(data_flow.state_management.contains(&"ref".to_string()));

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn extracts_hono_backend_routes() {
        use std::fs;
        use std::time::{SystemTime, UNIX_EPOCH};

        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let root = std::env::temp_dir().join(format!("routogram-hono-{suffix}"));
        let source_dir = root.join("src");
        fs::create_dir_all(&source_dir).unwrap();
        fs::write(
            root.join("package.json"),
            r#"{"name":"hono-fixture","dependencies":{"hono":"^4"}}"#,
        )
        .unwrap();
        fs::write(
            source_dir.join("server.ts"),
            r#"import { Hono } from "hono";
const app = new Hono();
app.get('/api/health', (c) => c.json({ ok: true }));
app.post('/api/users', (c) => c.json({ ok: true }));
"#,
        )
        .unwrap();

        let topology = scan_paths(&root, &root, "test".to_string()).unwrap();
        let routes = topology
            .nodes
            .iter()
            .filter(|node| node.kind == "backend_route")
            .collect::<Vec<_>>();
        assert_eq!(routes.len(), 2);
        assert!(routes.iter().any(|node| node.name == "GET /api/health"));
        assert!(
            routes
                .iter()
                .all(|node| node.framework.as_deref() == Some("hono"))
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn scan_paths_writes_nothing_into_project() {
        use std::fs;
        use std::time::{SystemTime, UNIX_EPOCH};

        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let root = std::env::temp_dir().join(format!("routogram-scan-paths-{suffix}"));
        let scan_root = root.join("src");
        fs::create_dir_all(&scan_root).unwrap();
        fs::write(root.join("package.json"), r#"{"name":"fixture"}"#).unwrap();
        fs::write(
            scan_root.join("Widget.tsx"),
            "export function Widget() { return <div>Widget</div>; }",
        )
        .unwrap();

        let topology = scan_paths(&root, &scan_root, "test".to_string()).unwrap();
        assert!(topology.nodes.iter().any(|node| node.name == "Widget"));
        assert!(!root.join(".routogram").exists());
        assert!(!root.join(".cache").exists());
        assert!(!scan_root.join(".routogram").exists());

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn ignores_type_only_handler_imports() {
        let source = "import type { FeaturedBuildView } from './_handlers'; export function Widget() { return null; }";
        let analysis = analyze_jsx_file(Path::new("Widget.tsx"), source).unwrap();
        assert!(!imports_graphql_api(&analysis));

        let source = "import { getHomePageView } from './_handlers'; export function Widget() { return null; }";
        let analysis = analyze_jsx_file(Path::new("Widget.tsx"), source).unwrap();
        assert!(imports_graphql_api(&analysis));
    }
}
