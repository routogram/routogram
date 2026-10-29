use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::model::{Edge, Node, Topology};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SimulationOperation {
    #[serde(rename = "delete-node")]
    DeleteNode { node_ids: Vec<String> },
    #[serde(rename = "flip-boundary")]
    FlipBoundary {
        node_ids: Vec<String>,
        target: String,
    },
    #[serde(rename = "migrate-router")]
    MigrateRouter { from: String, to: String },
    #[serde(rename = "prune-orphans")]
    PruneOrphans,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationStats {
    pub nodes: usize,
    pub edges: usize,
    pub client_components: usize,
    pub route_count: usize,
    pub orphan_components: usize,
    pub bundle_bytes: u64,
    pub token_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationBreakpoint {
    pub kind: String,
    pub severity: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationResult {
    pub baseline: SimulationStats,
    pub projected: SimulationStats,
    pub operations: Vec<SimulationOperation>,
    pub affected_node_ids: Vec<String>,
    pub removed_node_ids: Vec<String>,
    pub removed_edge_ids: Vec<String>,
    pub orphan_node_ids: Vec<String>,
    pub broken_edge_ids: Vec<String>,
    pub lost_tokens: Vec<String>,
    pub bundle_delta_bytes: i64,
    pub breakpoints: Vec<SimulationBreakpoint>,
    pub projected_topology: Topology,
}

pub fn simulate(
    root: &Path,
    topology: &Topology,
    operations: Vec<SimulationOperation>,
) -> SimulationResult {
    let baseline = stats(root, topology);
    let baseline_client_files = client_files(topology);
    let mut projected = topology.clone();
    let mut affected = BTreeSet::new();
    let mut removed_nodes = BTreeSet::new();
    let mut broken_edges = BTreeSet::new();
    let mut breakpoints = Vec::new();
    let mut bundle_delta = 0i64;

    for operation in &operations {
        match operation {
            SimulationOperation::DeleteNode { node_ids } => {
                for node_id in node_ids {
                    let Some(node) = projected.nodes.iter().find(|node| &node.id == node_id) else {
                        breakpoints.push(SimulationBreakpoint {
                            kind: "missing-node".to_string(),
                            severity: "warning".to_string(),
                            message: format!(
                                "Node {node_id} no longer exists in the shadow graph."
                            ),
                            node_id: Some(node_id.clone()),
                            file: None,
                        });
                        continue;
                    };
                    let descendants = descendants(&projected, node_id);
                    affected.extend(descendants);
                    affected.insert(node_id.clone());
                    removed_nodes.insert(node_id.clone());

                    if node.kind == "layout" {
                        breakpoints.push(SimulationBreakpoint {
                            kind: "layout-break".to_string(),
                            severity: "high".to_string(),
                            message: format!(
                                "Deleting layout {} may break its route subtree.",
                                node.name
                            ),
                            node_id: Some(node_id.clone()),
                            file: Some(node.file.clone()),
                        });
                    }
                    if node.kind == "route" {
                        breakpoints.push(SimulationBreakpoint {
                            kind: "route-break".to_string(),
                            severity: "critical".to_string(),
                            message: format!(
                                "Deleting route {} removes a navigation entry.",
                                node.name
                            ),
                            node_id: Some(node_id.clone()),
                            file: Some(node.file.clone()),
                        });
                    }
                }

                let removed = removed_nodes.clone();
                for edge in &projected.edges {
                    if removed.contains(&edge.source) || removed.contains(&edge.target) {
                        broken_edges.insert(edge.id.clone());
                    }
                }
                projected.nodes.retain(|node| !removed.contains(&node.id));
                projected.edges.retain(|edge| {
                    !broken_edges.contains(&edge.id)
                        && !removed.contains(&edge.source)
                        && !removed.contains(&edge.target)
                });
                bundle_delta -= file_bytes(root, &projected.nodes) as i64;
            }
            SimulationOperation::FlipBoundary { node_ids, target } => {
                let client = target == "client";
                for node_id in node_ids {
                    let affected_ids = descendants(&projected, node_id);
                    let bytes = affected_ids
                        .iter()
                        .chain(std::iter::once(node_id))
                        .filter_map(|id| projected.nodes.iter().find(|node| &node.id == id))
                        .map(|node| file_bytes(root, std::slice::from_ref(node)))
                        .sum::<u64>();
                    affected.extend(affected_ids);
                    affected.insert(node_id.clone());

                    for id in affected.iter() {
                        if let Some(node) = projected.nodes.iter_mut().find(|node| &node.id == id) {
                            node.runtime = Some(if client {
                                "client".to_string()
                            } else {
                                "server".to_string()
                            });
                            if let Some(meta) = &mut node.meta {
                                meta.is_server_component = Some(!client);
                            }
                        }
                    }
                    if client {
                        bundle_delta += bytes as i64;
                    } else {
                        bundle_delta -= bytes as i64;
                    }
                    breakpoints.push(SimulationBreakpoint {
                        kind: "boundary-flip".to_string(),
                        severity: "medium".to_string(),
                        message: format!(
                            "Changing {} to {} moves its subtree across the hydration boundary.",
                            node_id,
                            if client { "client" } else { "server" }
                        ),
                        node_id: Some(node_id.clone()),
                        file: projected
                            .nodes
                            .iter()
                            .find(|node| &node.id == node_id)
                            .map(|node| node.file.clone()),
                    });
                }
            }
            SimulationOperation::MigrateRouter { from, to } => {
                for node in projected.nodes.iter_mut() {
                    if node.kind != "route" {
                        continue;
                    }
                    let old_path = node.route.clone().unwrap_or_else(|| node.name.clone());
                    let next_path = migrate_route_path(&old_path, from, to);
                    if next_path != old_path {
                        node.route = Some(next_path.clone());
                        affected.insert(node.id.clone());
                    }
                    if let Some(metadata) = &mut node.metadata {
                        metadata
                            .insert("router".to_string(), serde_json::Value::String(to.clone()));
                        metadata.insert(
                            "routerMigration".to_string(),
                            serde_json::Value::String(format!("{from}->{to}")),
                        );
                    } else {
                        node.metadata = Some(BTreeMap::from([
                            ("router".to_string(), serde_json::Value::String(to.clone())),
                            (
                                "routerMigration".to_string(),
                                serde_json::Value::String(format!("{from}->{to}")),
                            ),
                        ]));
                    }
                    affected.insert(node.id.clone());
                    breakpoints.push(SimulationBreakpoint {
                        kind: "router-migration".to_string(),
                        severity: if !node.file.contains("/app/") && to.contains("app") {
                            "medium".to_string()
                        } else {
                            "info".to_string()
                        },
                        message: format!("Route {old_path} will be remapped from {from} to {to}."),
                        node_id: Some(node.id.clone()),
                        file: Some(node.file.clone()),
                    });
                }
            }
            SimulationOperation::PruneOrphans => {
                let orphans = orphan_components(&projected);
                removed_nodes.extend(orphans.iter().cloned());
                affected.extend(orphans.iter().cloned());
                projected
                    .nodes
                    .retain(|node| !removed_nodes.contains(&node.id));
                projected.edges.retain(|edge| {
                    !removed_nodes.contains(&edge.source) && !removed_nodes.contains(&edge.target)
                });
                for orphan in &orphans {
                    breakpoints.push(SimulationBreakpoint {
                        kind: "orphan-prune".to_string(),
                        severity: "info".to_string(),
                        message: format!("Orphan component {orphan} would be removed."),
                        node_id: Some(orphan.clone()),
                        file: None,
                    });
                }
            }
        }
    }

    let projected_stats = stats(root, &projected);
    let lost_tokens = lost_tokens(topology, &projected, &affected);
    let orphan_nodes = orphan_components(&projected);
    let projected_client_files = client_files(&projected);
    let _ = bundle_delta;
    let bundle_delta = projected_stats.bundle_bytes as i64 - baseline.bundle_bytes as i64;
    let _ = baseline_client_files;
    let _ = projected_client_files;

    SimulationResult {
        baseline,
        projected: projected_stats,
        operations,
        affected_node_ids: affected.into_iter().collect(),
        removed_node_ids: removed_nodes.into_iter().collect(),
        removed_edge_ids: projected
            .edges
            .iter()
            .map(|edge| edge.id.clone())
            .filter(|id| !topology.edges.iter().any(|edge| &edge.id == id))
            .collect::<Vec<_>>()
            .into_iter()
            .chain(broken_edges.iter().cloned())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect(),
        orphan_node_ids: orphan_nodes,
        broken_edge_ids: broken_edges.into_iter().collect(),
        lost_tokens,
        bundle_delta_bytes: bundle_delta,
        breakpoints,
        projected_topology: projected,
    }
}

fn migrate_route_path(path: &str, from: &str, to: &str) -> String {
    if to.contains("tanstack") || to.contains("react-router") {
        return path
            .split('/')
            .map(|segment| {
                segment
                    .strip_prefix(':')
                    .map(|name| format!("${name}"))
                    .unwrap_or_else(|| segment.to_string())
            })
            .collect::<Vec<_>>()
            .join("/");
    }
    if from.contains("pages") && to.contains("app") {
        return path.to_string();
    }
    path.to_string()
}

fn stats(root: &Path, topology: &Topology) -> SimulationStats {
    let clients = client_files(topology);
    SimulationStats {
        nodes: topology.nodes.len(),
        edges: topology.edges.len(),
        client_components: clients.len(),
        route_count: topology
            .nodes
            .iter()
            .filter(|node| node.kind == "route")
            .count(),
        orphan_components: orphan_components(topology).len(),
        bundle_bytes: clients
            .iter()
            .map(|file| {
                fs::metadata(root.join(file))
                    .map(|meta| meta.len())
                    .unwrap_or(0)
            })
            .sum(),
        token_count: topology.tokens.len(),
    }
}

fn client_files(topology: &Topology) -> BTreeSet<String> {
    topology
        .nodes
        .iter()
        .filter(|node| node.kind == "component")
        .filter(|node| {
            node.runtime.as_deref() == Some("client")
                || node.meta.as_ref().and_then(|meta| meta.is_server_component) == Some(false)
        })
        .map(|node| node.file.clone())
        .collect()
}

fn file_bytes(root: &Path, nodes: &[Node]) -> u64 {
    nodes
        .iter()
        .map(|node| {
            fs::metadata(root.join(&node.file))
                .map(|meta| meta.len())
                .unwrap_or(0)
        })
        .sum()
}

fn descendants(topology: &Topology, node_id: &str) -> BTreeSet<String> {
    let mut adjacency: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for edge in &topology.edges {
        adjacency
            .entry(edge.source.as_str())
            .or_default()
            .push(edge.target.as_str());
    }
    let mut queue = VecDeque::from([node_id.to_string()]);
    let mut seen = BTreeSet::new();
    while let Some(current) = queue.pop_front() {
        for next in adjacency.get(current.as_str()).into_iter().flatten() {
            if seen.insert((*next).to_string()) {
                queue.push_back((*next).to_string());
            }
        }
    }
    seen.remove(node_id);
    seen
}

fn orphan_components(topology: &Topology) -> Vec<String> {
    let components = topology
        .nodes
        .iter()
        .filter(|node| node.kind == "component")
        .map(|node| node.id.clone())
        .collect::<BTreeSet<_>>();
    let mut referenced = BTreeSet::new();
    for edge in &topology.edges {
        if edge.kind == "renders" || edge.kind == "dynamic_imports" || edge.kind == "cross_package"
        {
            referenced.insert(edge.target.clone());
        }
    }
    let mut origins = topology
        .nodes
        .iter()
        .filter(|node| node.kind == "route" || node.kind == "layout")
        .map(|node| node.id.clone())
        .collect::<Vec<_>>();
    let mut reachable = BTreeSet::new();
    while let Some(current) = origins.pop() {
        if !reachable.insert(current.clone()) {
            continue;
        }
        for edge in &topology.edges {
            if edge.source == current && (edge.kind == "renders" || edge.kind == "routes_to") {
                origins.push(edge.target.clone());
            }
        }
    }
    components
        .into_iter()
        .filter(|id| !reachable.contains(id) && !referenced.contains(id))
        .collect()
}

fn lost_tokens(
    original: &Topology,
    projected: &Topology,
    affected: &BTreeSet<String>,
) -> Vec<String> {
    let mut original_consumers = BTreeMap::<String, BTreeSet<String>>::new();
    let mut projected_consumers = BTreeMap::<String, BTreeSet<String>>::new();
    for node in &original.nodes {
        for token in node
            .meta
            .as_ref()
            .and_then(|meta| meta.style_metrics.as_ref())
            .map(|metrics| metrics.consumed_tokens.clone())
            .unwrap_or_default()
        {
            original_consumers
                .entry(token)
                .or_default()
                .insert(node.id.clone());
        }
    }
    for node in &projected.nodes {
        for token in node
            .meta
            .as_ref()
            .and_then(|meta| meta.style_metrics.as_ref())
            .map(|metrics| metrics.consumed_tokens.clone())
            .unwrap_or_default()
        {
            projected_consumers
                .entry(token)
                .or_default()
                .insert(node.id.clone());
        }
    }
    original_consumers
        .into_iter()
        .filter(|(_, consumers)| consumers.iter().all(|id| affected.contains(id)))
        .filter(|(token, _)| !projected_consumers.contains_key(token))
        .map(|(token, _)| token)
        .collect()
}

#[allow(dead_code)]
fn incident_edges(edges: &[Edge], removed: &BTreeSet<String>) -> Vec<String> {
    edges
        .iter()
        .filter(|edge| removed.contains(&edge.source) || removed.contains(&edge.target))
        .map(|edge| edge.id.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_dynamic_segments_to_tanstack() {
        assert_eq!(
            migrate_route_path("/users/:id", "react-router", "tanstack"),
            "/users/$id"
        );
    }
}
