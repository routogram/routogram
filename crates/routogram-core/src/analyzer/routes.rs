use std::collections::BTreeMap;
use std::path::Path;

use serde_json::json;

use crate::analyzer::matcher::JsxAnalysis;
use crate::model::{Edge, Node, Source};
use crate::workspace::Workspace;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MacroKind {
    Route,
    Layout,
}

#[derive(Debug, Clone)]
struct Descriptor {
    relative: String,
    kind: MacroKind,
    route_path: String,
    nesting_segments: Vec<String>,
    is_root_layout: bool,
    has_component: bool,
}

pub fn assemble_route_nodes(
    jsx_analyses: &BTreeMap<String, JsxAnalysis>,
    workspace: &Workspace,
) -> (Vec<Node>, Vec<Edge>) {
    let descriptors = jsx_analyses
        .iter()
        .filter_map(|(relative, analysis)| {
            classify_path(relative).map(
                |(kind, route_path, _directory_segments, is_root_layout)| Descriptor {
                    relative: relative.clone(),
                    kind,
                    route_path,
                    nesting_segments: filesystem_segments(relative),
                    is_root_layout,
                    has_component: analysis.has_jsx,
                },
            )
        })
        .collect::<Vec<_>>();

    if descriptors.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    for descriptor in &descriptors {
        nodes.push(route_node(
            descriptor,
            jsx_analyses.get(&descriptor.relative),
            workspace,
        ));

        if descriptor.has_component {
            edges.push(Edge {
                id: format!("edge:macro:renders:{}", descriptor.relative),
                kind: "renders".to_string(),
                source: macro_id(descriptor),
                target: format!("component:{}", descriptor.relative),
                label: None,
                metadata: Some(BTreeMap::from([(
                    "via".to_string(),
                    json!(match descriptor.kind {
                        MacroKind::Route => "page",
                        MacroKind::Layout => "layout",
                    }),
                )])),
            });
        }
    }

    let layouts = descriptors
        .iter()
        .filter(|descriptor| descriptor.kind == MacroKind::Layout)
        .collect::<Vec<_>>();
    let routes = descriptors
        .iter()
        .filter(|descriptor| descriptor.kind == MacroKind::Route)
        .collect::<Vec<_>>();

    for layout in &layouts {
        if layout.is_root_layout {
            continue;
        }

        if let Some(parent) = nearest_layout(&layouts, &layout.nesting_segments, true) {
            edges.push(Edge {
                id: format!("edge:macro:routes:{}:{}", parent.relative, layout.relative),
                kind: "routes_to".to_string(),
                source: macro_id(parent),
                target: macro_id(layout),
                label: None,
                metadata: Some(BTreeMap::from([("via".to_string(), json!("layout"))])),
            });
        }
    }

    for route in &routes {
        if let Some(parent) = nearest_layout(&layouts, &route.nesting_segments, false) {
            edges.push(Edge {
                id: format!("edge:macro:routes:{}:{}", parent.relative, route.relative),
                kind: "routes_to".to_string(),
                source: macro_id(parent),
                target: macro_id(route),
                label: None,
                metadata: Some(BTreeMap::from([("via".to_string(), json!("page"))])),
            });
        }
    }

    (nodes, edges)
}

fn route_node(
    descriptor: &Descriptor,
    analysis: Option<&JsxAnalysis>,
    workspace: &Workspace,
) -> Node {
    let name = match descriptor.kind {
        MacroKind::Route => descriptor.route_path.clone(),
        MacroKind::Layout => layout_display_name(&descriptor.relative),
    };

    Node {
        id: macro_id(descriptor),
        layer: "macro".to_string(),
        kind: match descriptor.kind {
            MacroKind::Route => "route".to_string(),
            MacroKind::Layout => "layout".to_string(),
        },
        name,
        file: descriptor.relative.clone(),
        package: workspace.package_for_file(&descriptor.relative),
        route: Some(descriptor.route_path.clone()),
        symbol: None,
        framework: Some("next".to_string()),
        runtime: None,
        source: Some(Source {
            file: descriptor.relative.clone(),
            line: analysis.map_or(1, |analysis| analysis.source_line),
            column: analysis.map_or(1, |analysis| analysis.source_column),
        }),
        meta: None,
        metadata: Some(BTreeMap::from([
            ("rootLayout".to_string(), json!(descriptor.is_root_layout)),
            (
                "fileRole".to_string(),
                json!(match descriptor.kind {
                    MacroKind::Route => "page",
                    MacroKind::Layout => "layout",
                }),
            ),
        ])),
    }
}

pub(crate) fn layout_display_name(relative: &str) -> String {
    let normalized = relative.replace('\\', "/");
    let components = normalized.split('/').collect::<Vec<_>>();
    let directories = components
        .get(..components.len().saturating_sub(1))
        .unwrap_or_default();

    if let Some(app_index) = directories.iter().position(|segment| *segment == "app") {
        let layout_segments = directories[app_index + 1..]
            .iter()
            .filter(|segment| !segment.starts_with('@'))
            .copied()
            .collect::<Vec<_>>();

        if layout_segments.is_empty() {
            return "Root Layout".to_string();
        }

        return format!("/{} Layout", layout_segments.join("/"));
    }

    "Root Layout".to_string()
}

fn filesystem_segments(relative: &str) -> Vec<String> {
    let normalized = relative.replace('\\', "/");
    let mut components = normalized.split('/').collect::<Vec<_>>();
    components.pop();
    let directories = components;

    if let Some(app_index) = directories.iter().position(|segment| *segment == "app") {
        return directories[app_index + 1..]
            .iter()
            .map(|segment| (*segment).to_string())
            .collect();
    }

    if let Some(pages_index) = directories.iter().position(|segment| *segment == "pages") {
        return directories[pages_index + 1..]
            .iter()
            .map(|segment| (*segment).to_string())
            .collect();
    }

    Vec::new()
}

fn nearest_layout<'a>(
    layouts: &[&'a Descriptor],
    target: &[String],
    strict: bool,
) -> Option<&'a Descriptor> {
    layouts
        .iter()
        .filter(|layout| {
            if strict {
                layout.nesting_segments.len() < target.len()
            } else {
                layout.nesting_segments.len() <= target.len()
            }
        })
        .filter(|layout| {
            layout
                .nesting_segments
                .iter()
                .zip(target.iter())
                .all(|(left, right)| left == right)
        })
        .max_by_key(|layout| layout.nesting_segments.len())
        .copied()
}

fn macro_id(descriptor: &Descriptor) -> String {
    match descriptor.kind {
        MacroKind::Route => format!("macro:route:{}", descriptor.relative),
        MacroKind::Layout => format!("macro:layout:{}", descriptor.relative),
    }
}

fn classify_path(relative: &str) -> Option<(MacroKind, String, Vec<String>, bool)> {
    let path = Path::new(relative);
    let stem = path.file_stem()?.to_str()?;
    let components = relative.split('/').collect::<Vec<_>>();
    let directories = components
        .get(..components.len().saturating_sub(1))
        .unwrap_or_default();

    if let Some(app_index) = directories.iter().position(|segment| *segment == "app") {
        let kind = match stem {
            "page" => MacroKind::Route,
            "layout" => MacroKind::Layout,
            _ => return None,
        };
        let route_segments = visible_segments(&directories[app_index + 1..]);
        let route_path = route_path(&route_segments);
        let is_root_layout = kind == MacroKind::Layout
            && route_segments.is_empty()
            && app_index == directories.len() - 1;

        return Some((kind, route_path, route_segments, is_root_layout));
    }

    if let Some(pages_index) = directories.iter().position(|segment| *segment == "pages") {
        let route_directories = &directories[pages_index + 1..];

        if route_directories.contains(&"api") || stem == "_document" {
            return None;
        }

        if stem == "_app" {
            return Some((MacroKind::Layout, "/".to_string(), Vec::new(), true));
        }

        let mut route_segments = visible_segments(route_directories);
        if stem != "index" {
            route_segments.push(stem.to_string());
        }

        return Some((
            MacroKind::Route,
            route_path(&route_segments),
            route_segments,
            false,
        ));
    }

    None
}

fn visible_segments(segments: &[&str]) -> Vec<String> {
    segments
        .iter()
        .filter(|segment| {
            !(segment.starts_with('(') && segment.ends_with(')')) && !segment.starts_with('@')
        })
        .map(|segment| (*segment).to_string())
        .collect()
}

fn route_path(segments: &[String]) -> String {
    if segments.is_empty() {
        "/".to_string()
    } else {
        format!("/{}", segments.join("/"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_app_router_routes_and_layouts() {
        assert_eq!(
            classify_path("src/app/page.tsx"),
            Some((MacroKind::Route, "/".to_string(), Vec::new(), false))
        );
        assert_eq!(
            classify_path("src/app/layout.tsx"),
            Some((MacroKind::Layout, "/".to_string(), Vec::new(), true))
        );
        assert_eq!(
            classify_path("src/app/orders/[id]/page.tsx"),
            Some((
                MacroKind::Route,
                "/orders/[id]".to_string(),
                vec!["orders".to_string(), "[id]".to_string()],
                false,
            ))
        );
    }

    #[test]
    fn resolves_nested_layout_parents_by_filesystem_depth() {
        fn descriptor(relative: &str) -> Descriptor {
            let (kind, route_path, _directory_segments, is_root_layout) =
                classify_path(relative).expect("route path");
            Descriptor {
                relative: relative.to_string(),
                kind,
                route_path,
                nesting_segments: filesystem_segments(relative),
                is_root_layout,
                has_component: true,
            }
        }

        let root = descriptor("src/app/layout.tsx");
        let locale = descriptor("src/app/[locale]/layout.tsx");
        let site = descriptor("src/app/[locale]/(site)/layout.tsx");
        let auth = descriptor("src/app/[locale]/(auth)/layout.tsx");
        let login = descriptor("src/app/[locale]/(auth)/login/page.tsx");
        let layouts = vec![&root, &locale, &site, &auth];

        assert_eq!(
            nearest_layout(&layouts, &site.nesting_segments, true)
                .map(|layout| layout.relative.as_str()),
            Some("src/app/[locale]/layout.tsx")
        );
        assert_eq!(
            nearest_layout(&layouts, &auth.nesting_segments, true)
                .map(|layout| layout.relative.as_str()),
            Some("src/app/[locale]/layout.tsx")
        );
        assert_eq!(
            nearest_layout(&layouts, &login.nesting_segments, false)
                .map(|layout| layout.relative.as_str()),
            Some("src/app/[locale]/(auth)/layout.tsx")
        );
    }

    #[test]
    fn preserves_route_groups_in_layout_names() {
        assert_eq!(layout_display_name("src/app/layout.tsx"), "Root Layout");
        assert_eq!(
            layout_display_name("src/app/[locale]/layout.tsx"),
            "/[locale] Layout"
        );
        assert_eq!(
            layout_display_name("src/app/[locale]/(console)/layout.tsx"),
            "/[locale]/(console) Layout"
        );
        assert_eq!(
            layout_display_name("src/app/[locale]/(auth)/layout.tsx"),
            "/[locale]/(auth) Layout"
        );
        assert_eq!(
            layout_display_name("src/app/(shop)/layout.tsx"),
            "/(shop) Layout"
        );
    }

    #[test]
    fn classifies_pages_router_routes() {
        assert_eq!(
            classify_path("pages/index.tsx"),
            Some((MacroKind::Route, "/".to_string(), Vec::new(), false))
        );
        assert_eq!(
            classify_path("pages/orders/index.tsx"),
            Some((
                MacroKind::Route,
                "/orders".to_string(),
                vec!["orders".to_string()],
                false,
            ))
        );
        assert_eq!(classify_path("pages/api/health.ts"), None);
        assert_eq!(classify_path("src/components/Button.tsx"), None);
    }

    #[test]
    fn strips_route_groups_and_keeps_locale_segment() {
        assert_eq!(
            classify_path("src/app/[locale]/(site)/page.tsx"),
            Some((
                MacroKind::Route,
                "/[locale]".to_string(),
                vec!["[locale]".to_string()],
                false,
            ))
        );
        assert_eq!(
            classify_path("src/app/[locale]/(console)/console/products/page.tsx"),
            Some((
                MacroKind::Route,
                "/[locale]/console/products".to_string(),
                vec![
                    "[locale]".to_string(),
                    "console".to_string(),
                    "products".to_string()
                ],
                false,
            ))
        );
    }
}
