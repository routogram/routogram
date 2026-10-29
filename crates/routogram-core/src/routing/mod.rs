pub mod astro;
pub mod svelte;
pub mod tanstack;
pub mod vue;

use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileRole {
    Page,
    Layout,
    Component,
    Middleware,
}

#[derive(Debug, Clone, Default)]
pub struct IslandDirective {
    pub component: String,
    pub hydration: String,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct FrameworkAnalysis {
    pub relative: String,
    pub framework: String,
    pub role: FileRole,
    pub route_path: Option<String>,
    pub is_root_layout: bool,
    pub component_name: Option<String>,
    pub islands: Vec<IslandDirective>,
    pub middleware: Vec<String>,
    pub imports: Vec<String>,
}

impl Default for FileRole {
    fn default() -> Self {
        Self::Component
    }
}

pub fn analyze_markup_file(relative: &str, source: &str) -> Option<FrameworkAnalysis> {
    let extension = Path::new(relative)
        .extension()
        .and_then(|extension| extension.to_str())?
        .to_lowercase();

    match extension.as_str() {
        "astro" => Some(astro::analyze(relative, source)),
        "vue" => Some(vue::analyze(relative, source)),
        "svelte" => Some(svelte::analyze(relative, source)),
        _ => None,
    }
}

pub fn route_path(segments: &[String]) -> String {
    let segments = segments
        .iter()
        .filter(|segment| !segment.is_empty())
        .map(String::as_str)
        .collect::<Vec<_>>();

    if segments.is_empty() {
        "/".to_string()
    } else {
        format!("/{}", segments.join("/"))
    }
}

pub fn directory_segments(relative: &str) -> Vec<String> {
    let normalized = relative.replace('\\', "/");
    let mut segments = normalized
        .split('/')
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    segments.pop();

    segments
}

pub fn component_name(relative: &str) -> String {
    let path = Path::new(relative);
    let mut stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Component")
        .trim_start_matches('+')
        .to_string();

    // `index` is a file-system convention, not a component name. Use the
    // containing directory so Sidebar/index.tsx and PricingCard/index.tsx differ.
    // `index` là quy ước file, không phải tên component. Dùng thư mục cha.
    if stem.eq_ignore_ascii_case("index") || stem.is_empty() {
        if let Some(parent) = path
            .parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
        {
            if !parent.is_empty() && parent != "." {
                stem = parent.to_string();
            }
        }
    }
    stem = stem.trim_matches(['[', ']']).to_string();

    stem.split(['-', '_'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut characters = part.chars();
            match characters.next() {
                Some(first) => first.to_uppercase().collect::<String>() + characters.as_str(),
                None => String::new(),
            }
        })
        .collect()
}

pub fn import_sources(source: &str) -> Vec<String> {
    let mut imports = Vec::new();

    for line in source.lines() {
        let line = line.trim();
        if !line.starts_with("import ") {
            continue;
        }

        let Some(from_index) = line.find(" from ") else {
            continue;
        };
        let rest = line[from_index + 6..].trim();
        let Some(quote) = rest
            .chars()
            .next()
            .filter(|char| *char == '"' || *char == '\'')
        else {
            continue;
        };
        let Some(end) = rest[1..].find(quote) else {
            continue;
        };

        imports.push(rest[1..=end].to_string());
    }

    imports
}

pub fn import_bindings(source: &str) -> Vec<(String, String)> {
    let mut bindings = Vec::new();

    for line in source.lines() {
        let line = line.trim();
        if !line.starts_with("import ") {
            continue;
        }
        let Some(from_index) = line.find(" from ") else {
            continue;
        };
        let clause = line[7..from_index].trim();
        let rest = line[from_index + 6..].trim();
        let Some(quote) = rest
            .chars()
            .next()
            .filter(|char| *char == '"' || *char == '\'')
        else {
            continue;
        };
        let Some(end) = rest[1..].find(quote) else {
            continue;
        };
        let import_source = rest[1..=end].to_string();
        let clause = clause
            .trim_start_matches("type ")
            .trim_matches(|character| character == '{' || character == '}');

        for part in clause.split(',') {
            let name = part
                .trim()
                .split(" as ")
                .next()
                .unwrap_or("")
                .trim()
                .trim_matches(|character| character == '{' || character == '}')
                .trim();
            let local = part
                .trim()
                .split(" as ")
                .nth(1)
                .unwrap_or(name)
                .trim()
                .trim_matches(|character| character == '{' || character == '}')
                .trim();

            if local
                .chars()
                .next()
                .is_some_and(|character| character.is_uppercase())
            {
                bindings.push((local.to_string(), import_source.clone()));
            }
        }
    }

    bindings
}

#[cfg(test)]
mod tests {
    use super::component_name;

    #[test]
    fn uses_parent_directory_for_index_files() {
        assert_eq!(
            component_name("src/components/Sidebar/index.tsx"),
            "Sidebar"
        );
        assert_eq!(
            component_name("src/features/billing/components/PricingCard/index.tsx"),
            "PricingCard"
        );
    }

    #[test]
    fn keeps_named_file_stem() {
        assert_eq!(
            component_name("src/components/user-avatar.tsx"),
            "UserAvatar"
        );
    }
}
