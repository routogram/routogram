use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use git2::{ObjectType, Repository, TreeWalkMode, TreeWalkResult};
use serde::Serialize;

use crate::analyzer;
use crate::model::{Edge, Node, Topology};

const MAX_TREE_FILE_BYTES: usize = 5 * 1024 * 1024;
const MAX_COMMITS: u32 = 50;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineSummary {
    pub nodes: usize,
    pub components: usize,
    pub routes: usize,
    pub layouts: usize,
    pub styles: usize,
    pub tokens: usize,
    pub edges: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyDiff {
    pub added_nodes: Vec<Node>,
    pub removed_nodes: Vec<Node>,
    pub updated_nodes: Vec<Node>,
    pub added_node_ids: Vec<String>,
    pub removed_node_ids: Vec<String>,
    pub updated_node_ids: Vec<String>,
    pub added_edges: Vec<Edge>,
    pub removed_edges: Vec<Edge>,
    pub updated_edges: Vec<Edge>,
    pub added_edge_ids: Vec<String>,
    pub removed_edge_ids: Vec<String>,
    pub updated_edge_ids: Vec<String>,
    pub summary: TimelineSummary,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineStep {
    pub commit_hash: String,
    pub short_hash: String,
    pub message: String,
    pub timestamp: i64,
    pub topology: Topology,
    pub diff: TopologyDiff,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineResult {
    pub branch: String,
    pub steps: Vec<TimelineStep>,
}

pub fn scan_timeline(root: &Path, limit: u32) -> Result<TimelineResult, String> {
    let repository = Repository::discover(root)
        .map_err(|error| format!("Unable to discover git repository: {error}"))?;
    let branch = repository
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(ToOwned::to_owned))
        .unwrap_or_else(|| "HEAD".to_string());
    let limit = limit.clamp(1, MAX_COMMITS) as usize;
    let mut commits = Vec::new();
    let mut current = repository
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|error| format!("Unable to resolve HEAD: {error}"))?;

    loop {
        commits.push(current.clone());
        if commits.len() >= limit {
            break;
        }

        match current.parent(0) {
            Ok(parent) => current = parent,
            Err(_) => break,
        }
    }

    commits.reverse();
    let mut snapshots = Vec::new();

    for commit in commits {
        let oid = commit.id();
        let tree = commit
            .tree()
            .map_err(|error| format!("Unable to load tree for {oid}: {error}"))?;
        let workspace = unique_temp_dir();
        fs::create_dir_all(&workspace)
            .map_err(|error| format!("Unable to create temporary git workspace: {error}"))?;
        let workspace = workspace
            .canonicalize()
            .map_err(|error| format!("Unable to resolve temporary git workspace: {error}"))?;

        let result = (|| {
            extract_tree(&repository, &tree, &workspace)?;
            let mut topology = analyzer::scan(&workspace, format!("{}", commit.time().seconds()))
                .map_err(|error| format!("Unable to scan commit {oid}: {error}"))?;
            topology.root = root.display().to_string();

            Ok::<Topology, String>(topology)
        })();

        let _ = fs::remove_dir_all(&workspace);
        let topology = result?;
        let hash = oid.to_string();
        let message = commit.message().unwrap_or_default().trim().to_string();
        let timestamp = commit.time().seconds();

        snapshots.push((hash, message, timestamp, topology));
    }

    let mut steps = Vec::with_capacity(snapshots.len());
    let mut previous: Option<Topology> = None;

    for (hash, message, timestamp, topology) in snapshots {
        let diff = diff_topologies(previous.as_ref(), &topology);
        previous = Some(topology.clone());
        let short_hash = hash.chars().take(8).collect::<String>();

        steps.push(TimelineStep {
            commit_hash: hash,
            short_hash,
            message,
            timestamp,
            topology,
            diff,
        });
    }

    Ok(TimelineResult { branch, steps })
}

fn diff_topologies(previous: Option<&Topology>, current: &Topology) -> TopologyDiff {
    let old_nodes = previous
        .map(|topology| {
            topology
                .nodes
                .iter()
                .map(|node| (node.id.as_str(), node))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();
    let new_nodes = current
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect::<BTreeMap<_, _>>();
    let mut added_nodes = Vec::new();
    let mut removed_nodes = Vec::new();
    let mut updated_nodes = Vec::new();

    for node in &current.nodes {
        match old_nodes.get(node.id.as_str()) {
            None => added_nodes.push(node.clone()),
            Some(old) if !same_json(*old, node) => updated_nodes.push(node.clone()),
            _ => {}
        }
    }

    for node in previous
        .map(|topology| &topology.nodes)
        .into_iter()
        .flatten()
    {
        if !new_nodes.contains_key(node.id.as_str()) {
            removed_nodes.push(node.clone());
        }
    }

    let old_edges = previous
        .map(|topology| {
            topology
                .edges
                .iter()
                .map(|edge| (edge.id.as_str(), edge))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();
    let new_edges = current
        .edges
        .iter()
        .map(|edge| (edge.id.as_str(), edge))
        .collect::<BTreeMap<_, _>>();
    let mut added_edges = Vec::new();
    let mut removed_edges = Vec::new();
    let mut updated_edges = Vec::new();

    for edge in &current.edges {
        match old_edges.get(edge.id.as_str()) {
            None => added_edges.push(edge.clone()),
            Some(old) if !same_json(*old, edge) => updated_edges.push(edge.clone()),
            _ => {}
        }
    }

    for edge in previous
        .map(|topology| &topology.edges)
        .into_iter()
        .flatten()
    {
        if !new_edges.contains_key(edge.id.as_str()) {
            removed_edges.push(edge.clone());
        }
    }

    TopologyDiff {
        added_node_ids: added_nodes.iter().map(|node| node.id.clone()).collect(),
        removed_node_ids: removed_nodes.iter().map(|node| node.id.clone()).collect(),
        updated_node_ids: updated_nodes.iter().map(|node| node.id.clone()).collect(),
        added_edge_ids: added_edges.iter().map(|edge| edge.id.clone()).collect(),
        removed_edge_ids: removed_edges.iter().map(|edge| edge.id.clone()).collect(),
        updated_edge_ids: updated_edges.iter().map(|edge| edge.id.clone()).collect(),
        added_nodes,
        removed_nodes,
        updated_nodes,
        added_edges,
        removed_edges,
        updated_edges,
        summary: TimelineSummary {
            nodes: current.nodes.len(),
            components: current
                .nodes
                .iter()
                .filter(|node| node.kind == "component")
                .count(),
            routes: current
                .nodes
                .iter()
                .filter(|node| node.kind == "route")
                .count(),
            layouts: current
                .nodes
                .iter()
                .filter(|node| node.kind == "layout")
                .count(),
            styles: current
                .nodes
                .iter()
                .filter(|node| node.kind == "style")
                .count(),
            tokens: current.tokens.len(),
            edges: current.edges.len(),
        },
    }
}

fn same_json<T: Serialize>(left: &T, right: &T) -> bool {
    serde_json::to_value(left).ok() == serde_json::to_value(right).ok()
}

fn extract_tree(
    repository: &Repository,
    tree: &git2::Tree<'_>,
    destination: &Path,
) -> Result<(), String> {
    tree.walk(TreeWalkMode::PreOrder, |root, entry| {
        if entry.kind() != Some(ObjectType::Blob) {
            return TreeWalkResult::Ok;
        }

        let Some(name) = entry.name() else {
            return TreeWalkResult::Ok;
        };
        let relative = Path::new(root).join(name);

        if relative.components().any(|component| {
            component.as_os_str() == ".git"
                || component.as_os_str() == "node_modules"
                || component.as_os_str() == "target"
        }) {
            return TreeWalkResult::Ok;
        }

        let Ok(blob) = repository.find_blob(entry.id()) else {
            return TreeWalkResult::Ok;
        };
        if blob.size() > MAX_TREE_FILE_BYTES {
            return TreeWalkResult::Ok;
        }

        let target = destination.join(&relative);
        if let Some(parent) = target.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::write(&target, blob.content()).is_err() {
            return TreeWalkResult::Skip;
        }

        TreeWalkResult::Ok
    })
    .map_err(|error| format!("Unable to extract git tree: {error}"))?;

    Ok(())
}

fn unique_temp_dir() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();

    std::env::temp_dir().join(format!("routogram-git-{}-{nanos}", std::process::id()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diff_marks_added_and_removed_nodes() {
        let mut previous = crate::model::Topology {
            schema_version: crate::model::SCHEMA_VERSION,
            generator: crate::model::Generator {
                name: crate::model::GENERATOR_NAME.to_string(),
                version: "test".to_string(),
            },
            root: "/tmp".to_string(),
            generated_at: "1".to_string(),
            stats: crate::model::Stats {
                files_scanned: 0,
                duration_ms: 0,
                warnings: Vec::new(),
            },
            nodes: vec![Node {
                id: "old".to_string(),
                ..Node::default()
            }],
            edges: Vec::new(),
            tokens: Vec::new(),
            workspace: None,
        };
        let mut current = previous.clone();
        current.nodes = vec![Node {
            id: "new".to_string(),
            ..Node::default()
        }];

        let diff = diff_topologies(Some(&previous), &current);
        assert_eq!(diff.added_node_ids, vec!["new"]);
        assert_eq!(diff.removed_node_ids, vec!["old"]);

        previous.nodes.clear();
        let empty = diff_topologies(Some(&previous), &current);
        assert_eq!(empty.summary.nodes, 1);
    }
}
