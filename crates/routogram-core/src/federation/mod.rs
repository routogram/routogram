use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::analyzer;
use crate::model::{Edge, Topology};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedApp {
    pub id: String,
    pub name: String,
    pub root: String,
    pub node_count: usize,
    pub route_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteContainer {
    pub app_id: String,
    pub name: String,
    pub url: String,
    pub config_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedDependency {
    pub name: String,
    pub versions: Vec<DependencyVersion>,
    pub conflict: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyVersion {
    pub app_id: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FederationConflict {
    pub kind: String,
    pub severity: String,
    pub message: String,
    pub apps: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedTopology {
    pub topology: Topology,
    pub apps: Vec<FederatedApp>,
    pub remotes: Vec<RemoteContainer>,
    pub shared_dependencies: Vec<SharedDependency>,
    pub conflicts: Vec<FederationConflict>,
}

pub fn scan(roots: Vec<String>) -> Result<FederatedTopology, String> {
    let roots = roots
        .into_iter()
        .filter(|root| !root.trim().is_empty())
        .map(|root| PathBuf::from(root))
        .collect::<Vec<_>>();

    if roots.is_empty() {
        return Err("At least one federation root is required.".to_string());
    }

    let mut apps = Vec::new();
    let mut remotes = Vec::new();
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut tokens = BTreeMap::new();
    let mut package_dependencies: BTreeMap<String, BTreeMap<String, String>> = BTreeMap::new();
    let mut generated_at = String::new();

    for root in roots {
        let canonical = root
            .canonicalize()
            .map_err(|error| format!("Unable to resolve {}: {error}", root.display()))?;
        let name = canonical
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("app")
            .to_string();
        let app_id = slug(&name);
        let topology = analyzer::scan(&canonical, String::new())
            .map_err(|error| format!("Unable to scan {}: {error}", canonical.display()))?;
        generated_at = topology.generated_at.clone();

        let app_nodes = topology
            .nodes
            .into_iter()
            .map(|mut node| {
                node.id = format!("{app_id}:{}", node.id);
                node.metadata
                    .get_or_insert_with(BTreeMap::new)
                    .insert("appId".to_string(), json!(app_id));
                node.metadata.get_or_insert_with(BTreeMap::new).insert(
                    "federatedRoot".to_string(),
                    json!(canonical.display().to_string()),
                );
                node
            })
            .collect::<Vec<_>>();
        let app_edges = topology
            .edges
            .into_iter()
            .map(|mut edge| {
                edge.id = format!("{app_id}:{}", edge.id);
                edge.source = format!("{app_id}:{}", edge.source);
                edge.target = format!("{app_id}:{}", edge.target);
                edge
            })
            .collect::<Vec<_>>();
        let route_count = app_nodes.iter().filter(|node| node.kind == "route").count();

        apps.push(FederatedApp {
            id: app_id.clone(),
            name,
            root: canonical.display().to_string(),
            node_count: app_nodes.len(),
            route_count,
        });
        nodes.extend(app_nodes);
        edges.extend(app_edges);
        for token in topology.tokens {
            tokens.entry(token.name.clone()).or_insert(token);
        }

        let dependencies = read_dependencies(&canonical);
        package_dependencies.insert(app_id.clone(), dependencies);

        for remote in read_remotes(&canonical, &app_id) {
            let remote_id = format!("remote:{}:{}", app_id, slug(&remote.name));
            nodes.push(crate::model::Node {
                id: remote_id.clone(),
                layer: "boundary".to_string(),
                kind: "remote_component".to_string(),
                name: remote.name.clone(),
                file: remote.config_file.clone(),
                package: None,
                route: None,
                symbol: None,
                framework: None,
                runtime: None,
                source: None,
                meta: None,
                metadata: Some(BTreeMap::from([
                    ("appId".to_string(), json!(app_id)),
                    ("remoteUrl".to_string(), json!(remote.url)),
                    ("federated".to_string(), json!(true)),
                ])),
            });
            if let Some(host) = nodes
                .iter()
                .find(|node| {
                    node.metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("appId"))
                        .and_then(|value| value.as_str())
                        == Some(app_id.as_str())
                        && node.kind == "route"
                })
                .map(|node| node.id.clone())
            {
                edges.push(Edge {
                    id: format!("{app_id}:federated:{}", slug(&remote.name)),
                    kind: "dynamic_imports".to_string(),
                    source: host,
                    target: remote_id,
                    label: Some("remote container".to_string()),
                    metadata: Some(BTreeMap::from([
                        ("appId".to_string(), json!(app_id)),
                        ("remote".to_string(), json!(true)),
                    ])),
                });
            }
            remotes.push(remote);
        }
    }

    let (shared_dependencies, conflicts) = shared_dependency_report(&package_dependencies);
    let federated_topology = Topology {
        schema_version: 2,
        generator: crate::model::Generator {
            name: "routogram-federation".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        },
        root: "federated".to_string(),
        generated_at,
        stats: crate::model::Stats {
            files_scanned: nodes.len(),
            duration_ms: 0,
            warnings: Vec::new(),
        },
        nodes,
        edges,
        tokens: tokens.into_values().collect(),
        workspace: None,
    };

    Ok(FederatedTopology {
        topology: federated_topology,
        apps,
        remotes,
        shared_dependencies,
        conflicts,
    })
}

fn read_dependencies(root: &Path) -> BTreeMap<String, String> {
    let Ok(source) = fs::read_to_string(root.join("package.json")) else {
        return BTreeMap::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&source) else {
        return BTreeMap::new();
    };
    let mut dependencies = BTreeMap::new();
    for section in ["dependencies", "devDependencies"] {
        if let Some(values) = value.get(section).and_then(|value| value.as_object()) {
            for (name, version) in values {
                if let Some(version) = version.as_str() {
                    dependencies.insert(name.clone(), version.to_string());
                }
            }
        }
    }
    dependencies
}

fn read_remotes(root: &Path, app_id: &str) -> Vec<RemoteContainer> {
    let candidates = [
        "modulefederation.config.js",
        "module-federation.config.js",
        "modulefederation.config.ts",
        "module-federation.config.ts",
        "vite.config.ts",
        "vite.config.js",
        "webpack.config.js",
    ];
    let mut remotes = Vec::new();

    for file in candidates {
        let path = root.join(file);
        let Ok(source) = fs::read_to_string(&path) else {
            continue;
        };
        if !source.contains("remotes") && !source.contains("federation") {
            continue;
        }
        for (name, url) in parse_remotes(&source) {
            if remotes
                .iter()
                .any(|remote: &RemoteContainer| remote.name == name)
            {
                continue;
            }
            remotes.push(RemoteContainer {
                app_id: app_id.to_string(),
                name,
                url,
                config_file: file.to_string(),
            });
        }
    }

    remotes
}

fn parse_remotes(source: &str) -> Vec<(String, String)> {
    let Some(index) = source.find("remotes") else {
        return Vec::new();
    };
    let Some(open) = source[index..].find('{').map(|offset| index + offset) else {
        return Vec::new();
    };
    let chars = source.chars().collect::<Vec<_>>();
    let mut depth = 0;
    let mut close = open;
    for (position, character) in chars.iter().enumerate().skip(open) {
        if *character == '{' {
            depth += 1;
        } else if *character == '}' {
            depth -= 1;
            if depth == 0 {
                close = position;
                break;
            }
        }
    }
    let block = &source[open + 1..close];
    let mut remotes = Vec::new();
    for entry in block.split(',') {
        let Some((name, value)) = entry.split_once(':') else {
            continue;
        };
        let name = name.trim().trim_matches(['"', '\'']).trim();
        let value = value.trim().trim_matches(['"', '\'']).trim();
        if name.is_empty() || value.is_empty() {
            continue;
        }
        if name.starts_with("...") || !value.contains('@') {
            continue;
        }
        remotes.push((name.to_string(), value.to_string()));
    }
    remotes
}

fn shared_dependency_report(
    dependencies: &BTreeMap<String, BTreeMap<String, String>>,
) -> (Vec<SharedDependency>, Vec<FederationConflict>) {
    let mut versions: BTreeMap<String, Vec<DependencyVersion>> = BTreeMap::new();
    for (app_id, dependencies) in dependencies {
        for (name, version) in dependencies {
            if name == "react" || name == "react-dom" || name == "vue" || name == "next" {
                versions
                    .entry(name.clone())
                    .or_default()
                    .push(DependencyVersion {
                        app_id: app_id.clone(),
                        version: version.clone(),
                    });
            }
        }
    }

    let mut shared = Vec::new();
    let mut conflicts = Vec::new();
    for (name, entries) in versions {
        let unique = entries
            .iter()
            .map(|entry| entry.version.clone())
            .collect::<BTreeSet<_>>();
        let conflict = unique.len() > 1;
        if conflict {
            conflicts.push(FederationConflict {
                kind: "version-mismatch".to_string(),
                severity: "high".to_string(),
                message: format!(
                    "Shared dependency {name} has conflicting versions: {}.",
                    entries
                        .iter()
                        .map(|entry| format!("{}@{}", entry.app_id, entry.version))
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                apps: entries.iter().map(|entry| entry.app_id.clone()).collect(),
            });
        }
        shared.push(SharedDependency {
            name,
            versions: entries,
            conflict,
        });
    }

    for store in ["zustand", "redux", "@reduxjs/toolkit"] {
        let apps = dependencies
            .iter()
            .filter(|(_, deps)| deps.contains_key(store))
            .map(|(app, _)| app.clone())
            .collect::<Vec<_>>();
        if apps.len() > 1 {
            conflicts.push(FederationConflict {
                kind: "duplicate-state-store".to_string(),
                severity: "warning".to_string(),
                message: format!(
                    "{store} is installed in multiple federated apps: {}.",
                    apps.join(", ")
                ),
                apps,
            });
        }
    }

    (shared, conflicts)
}

fn slug(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_vite_remotes() {
        let source = r#"federation({ name: "host", remotes: { checkout: "checkout@http://localhost:3001/remoteEntry.js" } })"#;
        let remotes = parse_remotes(source);
        assert_eq!(remotes[0].0, "checkout");
        assert!(remotes[0].1.contains("remoteEntry"));
    }
}
