use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use similar::TextDiff;

use crate::analyzer;
use crate::model::Topology;
use crate::simulation::SimulationOperation;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationFileChange {
    pub path: String,
    pub is_new: bool,
    pub is_deleted: bool,
    pub diff: String,
    pub before: String,
    pub after: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationResult {
    pub recipe_id: String,
    pub summary: String,
    pub files: Vec<MigrationFileChange>,
    pub applied: bool,
    pub changed: bool,
    pub bytes_saved: u64,
    pub projected_topology: Topology,
}

pub fn scan(root: &Path, recipe_id: &str, apply: bool) -> Result<MigrationResult, String> {
    let topology = analyzer::scan(root, "migration".to_string())?;
    match recipe_id {
        "css-to-tokens" => css_to_tokens(root, &topology, apply),
        "dead-module-pruner" => dead_module_pruner(root, &topology, apply),
        _ => Err(format!("Unknown migration recipe: {recipe_id}")),
    }
}

fn css_to_tokens(root: &Path, topology: &Topology, apply: bool) -> Result<MigrationResult, String> {
    let token_files = topology
        .tokens
        .iter()
        .map(|token| token.file.as_str())
        .collect::<BTreeSet<_>>();
    let colors = topology
        .tokens
        .iter()
        .filter_map(|token| parse_hex(&token.value).map(|rgb| (token, rgb)))
        .collect::<Vec<_>>();
    let pixels = topology
        .tokens
        .iter()
        .filter_map(|token| {
            token
                .value
                .trim()
                .strip_suffix("px")
                .and_then(|value| value.parse::<f64>().ok())
                .map(|value| (token, value))
        })
        .collect::<Vec<_>>();
    let mut files = BTreeSet::new();

    for node in &topology.nodes {
        if matches!(
            node.kind.as_str(),
            "component" | "style" | "route" | "layout"
        ) {
            files.insert(node.file.clone());
        }
    }

    let mut changes = Vec::new();
    let mut bytes_saved = 0u64;

    for file in files {
        if token_files.contains(file.as_str()) {
            continue;
        }
        let path = root.join(&file);
        let Ok(before) = fs::read_to_string(&path) else {
            continue;
        };
        let mut after = before.clone();
        for (token, rgb) in &colors {
            after = replace_hex_colors(&after, *rgb, &token.name);
        }
        for (token, value) in &pixels {
            after = replace_pixels(&after, *value, &token.name);
        }
        if after != before {
            bytes_saved += before.len().saturating_sub(after.len()) as u64;
            changes.push(MigrationFileChange {
                path: file.clone(),
                is_new: false,
                is_deleted: false,
                diff: unified_diff(&file, &before, &after, false),
                before,
                after,
            });
        }
    }

    if apply {
        for change in &changes {
            let current = fs::read_to_string(root.join(&change.path))
                .map_err(|error| format!("Unable to read {}: {error}", change.path))?;
            if current != change.before {
                return Err(format!("File changed during migration: {}", change.path));
            }
            fs::write(root.join(&change.path), &change.after)
                .map_err(|error| format!("Unable to write {}: {error}", change.path))?;
        }
    }

    Ok(MigrationResult {
        recipe_id: "css-to-tokens".to_string(),
        summary: format!(
            "Matched {} color token(s) and {} spacing token(s) across {} file(s).",
            colors.len(),
            pixels.len(),
            changes.len()
        ),
        changed: !changes.is_empty(),
        files: changes,
        applied: apply,
        bytes_saved,
        projected_topology: topology.clone(),
    })
}

fn dead_module_pruner(
    root: &Path,
    topology: &Topology,
    apply: bool,
) -> Result<MigrationResult, String> {
    let simulation =
        crate::simulation::simulate(root, topology, vec![SimulationOperation::PruneOrphans]);
    let removed = simulation
        .removed_node_ids
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    let mut files = BTreeSet::new();
    for node in &topology.nodes {
        if removed.contains(&node.id) && node.kind == "component" {
            files.insert(node.file.clone());
        }
    }
    let mut changes = Vec::new();
    let mut bytes_saved = 0u64;

    for file in files {
        let path = root.join(&file);
        let Ok(before) = fs::read_to_string(&path) else {
            continue;
        };
        bytes_saved += before.len() as u64;
        changes.push(MigrationFileChange {
            path: file.clone(),
            is_new: false,
            is_deleted: true,
            diff: unified_diff(&file, &before, "", true),
            before,
            after: String::new(),
        });
    }

    if apply {
        for change in &changes {
            let path = root.join(&change.path);
            let current = fs::read_to_string(&path)
                .map_err(|error| format!("Unable to read {}: {error}", change.path))?;
            if current != change.before {
                return Err(format!("File changed during migration: {}", change.path));
            }
            fs::remove_file(&path)
                .map_err(|error| format!("Unable to delete {}: {error}", change.path))?;
        }
    }

    Ok(MigrationResult {
        recipe_id: "dead-module-pruner".to_string(),
        summary: format!(
            "{} orphan component file(s) would be removed ({} bytes).",
            changes.len(),
            bytes_saved
        ),
        changed: !changes.is_empty(),
        files: changes,
        applied: apply,
        bytes_saved,
        projected_topology: simulation.projected_topology,
    })
}

fn replace_hex_colors(source: &str, target: Rgb, token_name: &str) -> String {
    let chars = source.chars().collect::<Vec<_>>();
    let mut output = String::with_capacity(source.len());
    let mut index = 0;

    while index < chars.len() {
        if chars[index] == '#' {
            let start = index;
            index += 1;
            while index < chars.len() && chars[index].is_ascii_hexdigit() {
                index += 1;
            }
            let literal = chars[start..index].iter().collect::<String>();
            if let Some(rgb) = parse_hex(&literal) {
                if delta_e(rgb, target) < 2.0 {
                    output.push_str(&format!("var({token_name})"));
                    continue;
                }
            }
            output.push_str(&literal);
            continue;
        }
        output.push(chars[index]);
        index += 1;
    }

    output
}

fn replace_pixels(source: &str, target: f64, token_name: &str) -> String {
    let chars = source.chars().collect::<Vec<_>>();
    let mut output = String::with_capacity(source.len());
    let mut index = 0;

    while index < chars.len() {
        if chars[index].is_ascii_digit() {
            let start = index;
            while index < chars.len() && (chars[index].is_ascii_digit() || chars[index] == '.') {
                index += 1;
            }
            if index + 1 < chars.len() && chars[index] == 'p' && chars[index + 1] == 'x' {
                let value = chars[start..index]
                    .iter()
                    .collect::<String>()
                    .parse::<f64>()
                    .unwrap_or_default();
                if (value - target).abs() < f64::EPSILON {
                    output.push_str(&format!("var({token_name})"));
                    index += 2;
                    continue;
                }
            }
            output.extend(chars[start..index].iter());
            continue;
        }
        output.push(chars[index]);
        index += 1;
    }

    output
}

#[derive(Debug, Clone, Copy)]
struct Rgb {
    r: f64,
    g: f64,
    b: f64,
}

fn parse_hex(value: &str) -> Option<Rgb> {
    let hex = value.trim().strip_prefix('#')?;
    let expanded = match hex.len() {
        3 => hex
            .chars()
            .flat_map(|character| [character, character])
            .collect::<String>(),
        6 => hex.to_string(),
        _ => return None,
    };
    let red = u8::from_str_radix(&expanded[0..2], 16).ok()? as f64 / 255.0;
    let green = u8::from_str_radix(&expanded[2..4], 16).ok()? as f64 / 255.0;
    let blue = u8::from_str_radix(&expanded[4..6], 16).ok()? as f64 / 255.0;
    Some(Rgb {
        r: red,
        g: green,
        b: blue,
    })
}

fn delta_e(left: Rgb, right: Rgb) -> f64 {
    let left_lab = lab(left);
    let right_lab = lab(right);
    ((left_lab.0 - right_lab.0).powi(2)
        + (left_lab.1 - right_lab.1).powi(2)
        + (left_lab.2 - right_lab.2).powi(2))
    .sqrt()
}

fn lab(rgb: Rgb) -> (f64, f64, f64) {
    let linear = |value: f64| {
        if value > 0.04045 {
            ((value + 0.055) / 1.055).powf(2.4)
        } else {
            value / 12.92
        }
    };
    let r = linear(rgb.r);
    let g = linear(rgb.g);
    let b = linear(rgb.b);
    let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    let f = |value: f64| {
        if value > 0.008856 {
            value.powf(1.0 / 3.0)
        } else {
            7.787 * value + 16.0 / 116.0
        }
    };
    (
        116.0 * f(y) - 16.0,
        500.0 * (f(x) - f(y)),
        200.0 * (f(y) - f(z)),
    )
}

fn unified_diff(path: &str, before: &str, after: &str, deleted: bool) -> String {
    let after_header = if deleted {
        "/dev/null".to_string()
    } else {
        format!("b/{path}")
    };
    TextDiff::from_lines(before, after)
        .unified_diff()
        .context_radius(3)
        .header(&format!("a/{path}"), &after_header)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_close_colors() {
        let left = parse_hex("#38bdf8").expect("valid hex");
        let right = parse_hex("#39bdf8").expect("valid hex");
        assert!(delta_e(left, right) < 2.0);
    }

    #[test]
    fn replaces_matching_pixels() {
        assert_eq!(
            replace_pixels("padding: 12px;", 12.0, "--zl-space"),
            "padding: var(--zl-space);"
        );
    }
}
