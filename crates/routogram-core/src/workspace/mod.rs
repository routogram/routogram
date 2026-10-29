use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use walkdir::WalkDir;

use crate::model::{WorkspaceInfo, WorkspacePackage};

const IGNORED_DIRS: &[&str] = &[
    ".git",
    ".next",
    ".nuxt",
    ".output",
    ".svelte-kit",
    ".turbo",
    ".vite",
    "coverage",
    "dist",
    "routogram-report",
    "node_modules",
    "target",
];

const RESOLVE_EXTENSIONS: &[&str] = &[
    "tsx", "ts", "jsx", "js", "mts", "cts", "mjs", "cjs", "vue", "svelte", "astro", "json",
];

#[derive(Debug, Clone)]
pub struct WorkspacePackageRecord {
    pub name: String,
    pub relative_dir: String,
    pub absolute_dir: PathBuf,
    pub frameworks: Vec<String>,
}

#[derive(Debug, Clone)]
struct PathAlias {
    pattern: String,
    targets: Vec<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct ResolvedImport {
    pub relative: String,
    pub package: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Workspace {
    pub root: PathBuf,
    pub tool: String,
    pub packages: Vec<WorkspacePackageRecord>,
    aliases: Vec<PathAlias>,
    pub warnings: Vec<String>,
}

impl Workspace {
    pub fn resolve(root: &Path) -> Self {
        let mut warnings = Vec::new();
        let root_package = read_json(&root.join("package.json"), &mut warnings);
        let pnpm_patterns = read_pnpm_patterns(&root.join("pnpm-workspace.yaml"), &mut warnings);
        let package_patterns = root_package
            .as_ref()
            .map(read_package_workspaces)
            .unwrap_or_default();
        let turbo = root.join("turbo.json").is_file();
        let nx = root.join("nx.json").is_file();
        let has_package_workspaces = !package_patterns.is_empty();
        let mut patterns = if !pnpm_patterns.is_empty() {
            pnpm_patterns
        } else {
            package_patterns
        };

        if patterns.is_empty() {
            patterns = vec!["apps/*".to_string(), "packages/*".to_string()];
            if nx {
                patterns.push("libs/*".to_string());
            }
        }

        let tool = if nx {
            "nx"
        } else if turbo {
            "turbo"
        } else if root.join("pnpm-workspace.yaml").is_file() {
            "pnpm"
        } else if has_package_workspaces {
            "npm"
        } else {
            "none"
        }
        .to_string();

        let mut packages = discover_packages(root, &patterns, &mut warnings);
        packages.sort_by(|left, right| left.relative_dir.cmp(&right.relative_dir));

        let mut aliases = Vec::new();
        collect_aliases(root, &mut aliases, &mut warnings);
        for package in &packages {
            collect_aliases(&package.absolute_dir, &mut aliases, &mut warnings);
        }

        Self {
            root: root.to_path_buf(),
            tool,
            packages,
            aliases,
            warnings,
        }
    }

    pub fn info(&self) -> Option<WorkspaceInfo> {
        if self.packages.is_empty() {
            return None;
        }

        Some(WorkspaceInfo {
            tool: self.tool.clone(),
            root: self.root.display().to_string(),
            packages: self
                .packages
                .iter()
                .map(|package| WorkspacePackage {
                    name: package.name.clone(),
                    path: package.relative_dir.clone(),
                    frameworks: package.frameworks.clone(),
                })
                .collect(),
        })
    }

    pub fn package_for_file(&self, relative: &str) -> Option<String> {
        let relative = normalize_relative(relative);

        self.packages
            .iter()
            .filter(|package| {
                relative == package.relative_dir
                    || relative.starts_with(&format!("{}/", package.relative_dir))
            })
            .max_by_key(|package| package.relative_dir.len())
            .map(|package| package.name.clone())
    }

    pub fn package_record_for_file(&self, relative: &str) -> Option<&WorkspacePackageRecord> {
        let relative = normalize_relative(relative);

        self.packages
            .iter()
            .filter(|package| {
                relative == package.relative_dir
                    || relative.starts_with(&format!("{}/", package.relative_dir))
            })
            .max_by_key(|package| package.relative_dir.len())
    }

    pub fn frameworks_for_file(&self, relative: &str) -> Vec<String> {
        self.package_record_for_file(relative)
            .map(|package| package.frameworks.clone())
            .unwrap_or_default()
    }

    pub fn resolve_import(&self, importer: &str, source: &str) -> Option<ResolvedImport> {
        let source = strip_query(source);
        let importer_dir = Path::new(importer).parent().unwrap_or(Path::new(""));
        let mut candidates = Vec::new();

        if source.starts_with('.') {
            candidates.push(self.root.join(importer_dir).join(&source));
        } else {
            for package in &self.packages {
                if source == package.name {
                    candidates.push(package.absolute_dir.clone());
                } else if let Some(subpath) = source.strip_prefix(&format!("{}/", package.name)) {
                    candidates.push(package.absolute_dir.join(subpath));
                }
            }

            for alias in &self.aliases {
                if let Some(star) = match_alias(&alias.pattern, &source) {
                    for target in &alias.targets {
                        let replaced = target.to_string_lossy().replace('*', &star).to_string();
                        candidates.push(PathBuf::from(replaced));
                    }
                }
            }

            let node_modules = self.root.join("node_modules").join(&source);
            if node_modules.exists() {
                candidates.push(node_modules);
            }
        }

        for candidate in candidates {
            if let Some(relative) = self.resolve_file(&candidate) {
                let package = self.package_for_file(&relative);
                return Some(ResolvedImport { relative, package });
            }
        }

        None
    }

    fn resolve_file(&self, candidate: &Path) -> Option<String> {
        let resolved = resolve_file_candidate(candidate)?;
        let canonical = resolved.canonicalize().ok()?;

        if !canonical.starts_with(&self.root) || !canonical.is_file() {
            return None;
        }

        let relative = canonical
            .strip_prefix(&self.root)
            .ok()?
            .to_string_lossy()
            .replace('\\', "/");

        Some(relative)
    }
}

fn discover_packages(
    root: &Path,
    patterns: &[String],
    warnings: &mut Vec<String>,
) -> Vec<WorkspacePackageRecord> {
    let mut packages = Vec::new();
    let mut seen = BTreeSet::new();

    for entry in WalkDir::new(root)
        .max_depth(6)
        .into_iter()
        .filter_entry(|entry| {
            !entry
                .file_name()
                .to_str()
                .is_some_and(|name| IGNORED_DIRS.contains(&name))
        })
        .flatten()
    {
        if !entry.file_type().is_dir() {
            continue;
        }

        let relative = entry
            .path()
            .strip_prefix(root)
            .ok()
            .map(|path| path.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();

        if relative.is_empty() || !matches_patterns(patterns, &relative) {
            continue;
        }

        let package_json = entry.path().join("package.json");
        let project_json = entry.path().join("project.json");

        if !package_json.is_file() && !project_json.is_file() {
            continue;
        }

        let package = package_json
            .is_file()
            .then(|| read_json(&package_json, warnings))
            .flatten();
        let project = project_json
            .is_file()
            .then(|| read_json(&project_json, warnings))
            .flatten();
        let name = package
            .as_ref()
            .and_then(|value| value.get("name"))
            .or_else(|| project.as_ref().and_then(|value| value.get("name")))
            .and_then(Value::as_str)
            .unwrap_or(&relative)
            .to_string();

        if !seen.insert(name.clone()) {
            continue;
        }

        packages.push(WorkspacePackageRecord {
            name: name.clone(),
            relative_dir: relative.clone(),
            absolute_dir: entry.path().to_path_buf(),
            frameworks: package.as_ref().map(detect_frameworks).unwrap_or_default(),
        });
    }

    packages
}

fn matches_patterns(patterns: &[String], relative: &str) -> bool {
    let positives = patterns
        .iter()
        .filter(|pattern| !pattern.starts_with('!'))
        .collect::<Vec<_>>();
    let negatives = patterns
        .iter()
        .filter_map(|pattern| pattern.strip_prefix('!'))
        .collect::<Vec<_>>();

    let included = positives.is_empty()
        || positives
            .iter()
            .any(|pattern| match_package_pattern(pattern, relative));
    let excluded = negatives
        .iter()
        .any(|pattern| match_package_pattern(pattern, relative));

    included && !excluded
}

fn match_package_pattern(pattern: &str, relative: &str) -> bool {
    let pattern = pattern.trim_matches('/');
    let relative = relative.trim_matches('/');
    let pattern_segments = pattern.split('/').collect::<Vec<_>>();
    let path_segments = relative.split('/').collect::<Vec<_>>();

    match_segments(&pattern_segments, &path_segments)
}

fn match_segments(pattern: &[&str], path: &[&str]) -> bool {
    if pattern.is_empty() {
        return path.is_empty();
    }

    if pattern[0] == "**" {
        if match_segments(&pattern[1..], path) {
            return true;
        }
        return !path.is_empty() && match_segments(pattern, &path[1..]);
    }

    if path.is_empty() {
        return false;
    }

    match_segment(pattern[0], path[0]) && match_segments(&pattern[1..], &path[1..])
}

fn match_segment(pattern: &str, value: &str) -> bool {
    let pattern_chars = pattern.chars().collect::<Vec<_>>();
    let value_chars = value.chars().collect::<Vec<_>>();
    let mut dp = vec![vec![false; value_chars.len() + 1]; pattern_chars.len() + 1];
    dp[0][0] = true;

    for index in 1..=pattern_chars.len() {
        if pattern_chars[index - 1] == '*' {
            dp[index][0] = dp[index - 1][0];
        }
    }

    for pattern_index in 1..=pattern_chars.len() {
        for value_index in 1..=value_chars.len() {
            dp[pattern_index][value_index] = match pattern_chars[pattern_index - 1] {
                '*' => dp[pattern_index - 1][value_index] || dp[pattern_index][value_index - 1],
                '?' => dp[pattern_index - 1][value_index - 1],
                character => {
                    character == value_chars[value_index - 1]
                        && dp[pattern_index - 1][value_index - 1]
                }
            };
        }
    }

    dp[pattern_chars.len()][value_chars.len()]
}

fn read_pnpm_patterns(path: &Path, warnings: &mut Vec<String>) -> Vec<String> {
    let Ok(source) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let mut patterns = Vec::new();
    let mut in_packages = false;

    for raw_line in source.lines() {
        let line = raw_line.split('#').next().unwrap_or("").trim_end();
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        if !line.starts_with(' ') && trimmed.starts_with("packages:") {
            in_packages = true;
            let inline = trimmed.trim_start_matches("packages:").trim();
            if inline.starts_with('[') {
                patterns.extend(parse_flow_list(inline));
                in_packages = false;
            }
            continue;
        }

        if in_packages {
            if let Some(item) = trimmed.strip_prefix('-') {
                patterns.push(
                    item.trim()
                        .trim_matches(|character| character == '\'' || character == '"')
                        .to_string(),
                );
                continue;
            }

            if !line.starts_with(' ') {
                in_packages = false;
            }
        }
    }

    if patterns.is_empty() {
        warnings.push(format!(
            "No workspace packages were found in {}.",
            path.display()
        ));
    }

    patterns
}

fn parse_flow_list(value: &str) -> Vec<String> {
    value
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .split(',')
        .map(|item| {
            item.trim()
                .trim_matches(|character| character == '\'' || character == '"')
                .to_string()
        })
        .filter(|item| !item.is_empty())
        .collect()
}

fn read_package_workspaces(value: &Value) -> Vec<String> {
    match value.get("workspaces") {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(Value::as_str)
            .map(ToOwned::to_owned)
            .collect(),
        Some(Value::Object(object)) => object
            .get("packages")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToOwned::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn detect_frameworks(value: &Value) -> Vec<String> {
    let mut frameworks = BTreeSet::new();
    let dependencies = ["dependencies", "devDependencies", "peerDependencies"];

    for section in dependencies {
        let Some(deps) = value.get(section).and_then(Value::as_object) else {
            continue;
        };

        for dependency in deps.keys() {
            let framework = match dependency.as_str() {
                "next" => Some("next"),
                "astro" => Some("astro"),
                "nuxt" => Some("nuxt"),
                "vue" => Some("vue"),
                "@sveltejs/kit" => Some("sveltekit"),
                "svelte" => Some("svelte"),
                "@tanstack/react-router" => Some("tanstack"),
                "react" => Some("react"),
                "solid-js" => Some("solid"),
                "preact" => Some("preact"),
                "lit" | "lit-html" | "lit-element" => Some("lit"),
                _ => None,
            };

            if let Some(framework) = framework {
                frameworks.insert(framework.to_string());
            }
        }
    }

    frameworks.into_iter().collect()
}

fn collect_aliases(directory: &Path, aliases: &mut Vec<PathAlias>, warnings: &mut Vec<String>) {
    let candidates = ["tsconfig.json", "jsconfig.json"];

    for candidate in candidates {
        let path = directory.join(candidate);
        if !path.is_file() {
            continue;
        }

        let Some(value) = read_json(&path, warnings) else {
            continue;
        };
        let Some(options) = value.get("compilerOptions").and_then(Value::as_object) else {
            continue;
        };
        let base = directory.join(
            options
                .get("baseUrl")
                .and_then(Value::as_str)
                .unwrap_or("."),
        );

        let Some(paths) = options.get("paths").and_then(Value::as_object) else {
            continue;
        };

        for (pattern, targets) in paths {
            let Some(targets) = targets.as_array() else {
                continue;
            };

            aliases.push(PathAlias {
                pattern: pattern.clone(),
                targets: targets
                    .iter()
                    .filter_map(Value::as_str)
                    .map(|target| base.join(target))
                    .collect(),
            });
        }
    }
}

fn match_alias(pattern: &str, source: &str) -> Option<String> {
    if let Some(star_index) = pattern.find('*') {
        let prefix = &pattern[..star_index];
        let suffix = &pattern[star_index + 1..];

        if source.starts_with(prefix) && source.ends_with(suffix) {
            return Some(source[prefix.len()..source.len() - suffix.len()].to_string());
        }

        None
    } else if pattern == source {
        Some(String::new())
    } else {
        None
    }
}

fn resolve_file_candidate(candidate: &Path) -> Option<PathBuf> {
    if candidate.is_file() {
        return Some(candidate.to_path_buf());
    }

    if candidate.extension().is_none() {
        for extension in RESOLVE_EXTENSIONS {
            let with_extension = candidate.with_extension(extension);
            if with_extension.is_file() {
                return Some(with_extension);
            }
        }

        for extension in RESOLVE_EXTENSIONS {
            let index = candidate.join(format!("index.{extension}"));
            if index.is_file() {
                return Some(index);
            }
        }
    }

    None
}

fn read_json(path: &Path, warnings: &mut Vec<String>) -> Option<Value> {
    let source = fs::read_to_string(path).ok()?;
    let cleaned = strip_json_comments(&source);

    match serde_json::from_str::<Value>(&cleaned) {
        Ok(value) => Some(value),
        Err(error) => {
            warnings.push(format!("{}: {error}", path.display()));
            None
        }
    }
}

fn strip_json_comments(source: &str) -> String {
    let mut output = String::with_capacity(source.len());
    let mut characters = source.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;

    while let Some(character) = characters.next() {
        if in_string {
            output.push(character);
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
            continue;
        }

        if character == '"' {
            in_string = true;
            output.push(character);
            continue;
        }

        if character == '/' {
            match characters.peek() {
                Some('/') => {
                    characters.next();
                    for next in characters.by_ref() {
                        if next == '\n' {
                            output.push('\n');
                            break;
                        }
                    }
                    continue;
                }
                Some('*') => {
                    characters.next();
                    let mut previous = '\0';
                    for next in characters.by_ref() {
                        if previous == '*' && next == '/' {
                            break;
                        }
                        previous = next;
                    }
                    continue;
                }
                _ => {}
            }
        }

        output.push(character);
    }

    remove_trailing_commas(&output)
}

fn remove_trailing_commas(source: &str) -> String {
    let mut output = String::with_capacity(source.len());
    let mut characters = source.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;

    while let Some(character) = characters.next() {
        if in_string {
            output.push(character);
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
            continue;
        }

        if character == '"' {
            in_string = true;
            output.push(character);
            continue;
        }

        if character == ',' {
            let mut lookahead = characters.clone();
            let next = lookahead.find(|candidate| !candidate.is_whitespace());
            if matches!(next, Some('}') | Some(']')) {
                continue;
            }
        }

        output.push(character);
    }

    output
}

fn normalize_relative(relative: &str) -> String {
    relative
        .replace('\\', "/")
        .trim_start_matches("./")
        .trim_end_matches('/')
        .to_string()
}

fn strip_query(source: &str) -> &str {
    source.split(['?', '#']).next().unwrap_or(source)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_workspace_globs() {
        assert!(match_package_pattern("apps/*", "apps/web"));
        assert!(match_package_pattern("packages/**", "packages/ui/src"));
        assert!(!match_package_pattern("apps/*", "apps/web/nested"));
        assert!(match_segment("*.test.tsx", "button.test.tsx"));
    }
}
