use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::analyzer;
use crate::model::Topology;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulebookDiagnostic {
    pub rule: String,
    pub severity: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulebookReport {
    pub diagnostics: Vec<RulebookDiagnostic>,
    pub error_count: usize,
    pub warning_count: usize,
    pub passed: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RulebookConfig {
    #[serde(default)]
    boundaries: Vec<BoundaryRule>,
    max_depth: Option<u32>,
    tokens: Option<TokenRule>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BoundaryRule {
    from: String,
    #[serde(default)]
    deny: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokenRule {
    prefix: Option<String>,
    forbid_hardcoded_values: Option<bool>,
}

pub fn check(root: &Path, config_json: &str) -> Result<RulebookReport, String> {
    let config: RulebookConfig = if config_json.trim().is_empty() {
        RulebookConfig::default()
    } else {
        serde_json::from_str(config_json)
            .map_err(|error| format!("Invalid rulebook config: {error}"))?
    };
    let topology = analyzer::scan(root, "rulebook".to_string())?;
    let mut diagnostics = Vec::new();

    check_boundaries(&topology, &config, &mut diagnostics);
    check_depth(&topology, config.max_depth.unwrap_or(6), &mut diagnostics);
    check_tokens(root, &topology, config.tokens.as_ref(), &mut diagnostics);

    diagnostics.sort_by(|left, right| {
        (left.file.as_deref().unwrap_or(""))
            .cmp(right.file.as_deref().unwrap_or(""))
            .then_with(|| left.line.unwrap_or(0).cmp(&right.line.unwrap_or(0)))
            .then_with(|| left.rule.cmp(&right.rule))
    });

    let error_count = diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.severity == "error")
        .count();
    let warning_count = diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.severity == "warning")
        .count();

    Ok(RulebookReport {
        diagnostics,
        error_count,
        warning_count,
        passed: error_count == 0,
    })
}

fn check_boundaries(
    topology: &Topology,
    config: &RulebookConfig,
    diagnostics: &mut Vec<RulebookDiagnostic>,
) {
    let nodes = topology
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect::<BTreeMap<_, _>>();

    for edge in &topology.edges {
        if edge.kind != "cross_package" {
            continue;
        }
        let Some(metadata) = &edge.metadata else {
            continue;
        };
        let from = metadata.get("fromPackage").and_then(|value| value.as_str());
        let to = metadata.get("toPackage").and_then(|value| value.as_str());
        let (Some(from), Some(to)) = (from, to) else {
            continue;
        };

        for rule in &config.boundaries {
            if !package_matches(&rule.from, from) {
                continue;
            }
            if rule.deny.iter().any(|denied| package_matches(denied, to)) {
                let node = nodes.get(edge.source.as_str());
                diagnostics.push(RulebookDiagnostic {
                    rule: "boundary-enforcement".to_string(),
                    severity: "error".to_string(),
                    message: format!(
                        "Package \"{from}\" must not import \"{to}\"; use an approved boundary instead."
                    ),
                    file: node.map(|node| node.file.clone()),
                    line: node.and_then(|node| node.source.as_ref().map(|source| source.line)),
                    node_id: Some(edge.source.clone()),
                });
            }
        }
    }
}

fn check_depth(topology: &Topology, max_depth: u32, diagnostics: &mut Vec<RulebookDiagnostic>) {
    let components = topology
        .nodes
        .iter()
        .filter(|node| node.kind == "component")
        .map(|node| node.id.clone())
        .collect::<BTreeSet<_>>();
    let mut children: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut has_parent = BTreeSet::new();

    for edge in &topology.edges {
        if (edge.kind != "renders" && edge.kind != "cross_package")
            || !components.contains(&edge.source)
            || !components.contains(&edge.target)
        {
            continue;
        }
        children
            .entry(edge.source.clone())
            .or_default()
            .push(edge.target.clone());
        has_parent.insert(edge.target.clone());
    }

    let mut depths: BTreeMap<String, u32> = BTreeMap::new();
    let mut visiting = BTreeSet::new();

    for component in &components {
        if !has_parent.contains(component) {
            depth(component, &children, &mut depths, &mut visiting);
        }
    }
    for component in &components {
        depth(component, &children, &mut depths, &mut visiting);
    }

    let nodes = topology
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect::<BTreeMap<_, _>>();

    for (node_id, component_depth) in depths {
        if component_depth <= max_depth {
            continue;
        }
        let node = nodes.get(node_id.as_str());
        diagnostics.push(RulebookDiagnostic {
            rule: "component-depth-guard".to_string(),
            severity: "error".to_string(),
            message: format!(
                "Component depth {component_depth} exceeds the rulebook maximum of {max_depth}."
            ),
            file: node.map(|node| node.file.clone()),
            line: node.and_then(|node| node.source.as_ref().map(|source| source.line)),
            node_id: Some(node_id),
        });
    }
}

fn depth(
    node_id: &str,
    children: &BTreeMap<String, Vec<String>>,
    depths: &mut BTreeMap<String, u32>,
    visiting: &mut BTreeSet<String>,
) -> u32 {
    if let Some(depth) = depths.get(node_id) {
        return *depth;
    }
    if !visiting.insert(node_id.to_string()) {
        return 0;
    }

    let child_depth = children
        .get(node_id)
        .into_iter()
        .flatten()
        .map(|child| depth(child, children, depths, visiting))
        .max()
        .unwrap_or(0);
    visiting.remove(node_id);
    let value = child_depth + 1;
    depths.insert(node_id.to_string(), value);

    value
}

fn check_tokens(
    root: &Path,
    topology: &Topology,
    config: Option<&TokenRule>,
    diagnostics: &mut Vec<RulebookDiagnostic>,
) {
    let Some(config) = config else {
        return;
    };

    if let Some(prefix) = &config.prefix {
        for token in &topology.tokens {
            if !token.name.starts_with(prefix) {
                diagnostics.push(RulebookDiagnostic {
                    rule: "strict-token-isolation".to_string(),
                    severity: "error".to_string(),
                    message: format!(
                        "Token \"{}\" must use the required \"{prefix}\" prefix.",
                        token.name
                    ),
                    file: Some(token.file.clone()),
                    line: Some(token.line),
                    node_id: None,
                });
            }
        }
    }

    if config.forbid_hardcoded_values.unwrap_or(true) {
        let mut files = BTreeSet::new();
        for node in &topology.nodes {
            if node.kind == "component" || node.kind == "style" {
                files.insert(node.file.clone());
            }
        }

        for file in files {
            let Ok(source) = fs::read_to_string(root.join(&file)) else {
                continue;
            };
            for (line_index, line) in source.lines().enumerate() {
                for violation in hardcoded_values(line) {
                    diagnostics.push(RulebookDiagnostic {
                        rule: "strict-token-isolation".to_string(),
                        severity: "error".to_string(),
                        message: format!(
                            "Hardcoded value \"{violation}\" must use a design token (var(--...))."
                        ),
                        file: Some(file.clone()),
                        line: Some(line_index as u32 + 1),
                        node_id: None,
                    });
                }
            }
        }
    }
}

fn hardcoded_values(line: &str) -> Vec<String> {
    let mut values = Vec::new();
    let bytes = line.as_bytes();
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'#' {
            let start = index;
            index += 1;
            while index < bytes.len() && (bytes[index].is_ascii_hexdigit() || bytes[index] == b'#')
            {
                index += 1;
            }
            let value = &line[start..index];
            if matches!(value.len(), 4 | 7 | 9) {
                values.push(value.to_string());
            }
            continue;
        }

        if bytes[index].is_ascii_digit() {
            let start = index;
            while index < bytes.len() && (bytes[index].is_ascii_digit() || bytes[index] == b'.') {
                index += 1;
            }
            if index + 1 < bytes.len() && &line[index..index + 2] == "px" {
                values.push(line[start..index + 2].to_string());
                index += 2;
                continue;
            }
        }

        index += 1;
    }

    values
}

fn package_matches(pattern: &str, package: &str) -> bool {
    if pattern.ends_with('*') {
        return package.starts_with(pattern.trim_end_matches('*'));
    }

    pattern == package
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_hardcoded_colors_and_pixels() {
        assert_eq!(hardcoded_values("color: #fff; padding: 12px;").len(), 2);
        assert!(hardcoded_values("color: var(--zl-brand);").is_empty());
    }

    #[test]
    fn matches_package_prefixes() {
        assert!(package_matches("apps/*", "apps/web"));
        assert!(!package_matches("apps/*", "packages/ui"));
    }
}
