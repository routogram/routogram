use crate::routing::{
    FileRole, FrameworkAnalysis, component_name, directory_segments, import_sources, route_path,
};

pub fn analyze(relative: &str, source: &str) -> FrameworkAnalysis {
    let normalized = relative.replace('\\', "/");
    let stem = normalized
        .rsplit('/')
        .next()
        .and_then(|file| file.split_once('.').map(|(stem, _)| stem))
        .unwrap_or("index");
    let directories = directory_segments(relative);
    let pages_index = directories.iter().position(|segment| segment == "pages");
    let layouts_index = directories.iter().position(|segment| segment == "layouts");
    let middleware_index = directories
        .iter()
        .position(|segment| segment == "middleware");

    let (role, route_path, is_root_layout) = if let Some(pages_index) = pages_index {
        let mut route_segments = directories[pages_index + 1..].to_vec();

        if stem != "index" {
            route_segments.push(stem.to_string());
        }

        (FileRole::Page, Some(route_path(&route_segments)), false)
    } else if layouts_index.is_some() {
        (FileRole::Layout, None, stem == "default")
    } else if middleware_index.is_some() {
        (FileRole::Middleware, None, false)
    } else {
        (FileRole::Component, None, false)
    };

    let middleware = if role == FileRole::Page {
        middleware_names(source)
    } else {
        Vec::new()
    };

    FrameworkAnalysis {
        relative: relative.to_string(),
        framework: "vue".to_string(),
        role,
        route_path,
        is_root_layout,
        component_name: Some(component_name(relative)),
        islands: Vec::new(),
        middleware,
        imports: import_sources(source),
    }
}

fn middleware_names(source: &str) -> Vec<String> {
    let Some(index) = source.find("middleware:") else {
        return Vec::new();
    };
    let rest = &source[index + "middleware:".len()..];
    let end = rest.find('}').unwrap_or(rest.len());
    let value = &rest[..end];

    value
        .split(',')
        .filter_map(|item| {
            let item = item
                .trim()
                .trim_matches(|character| {
                    character == '[' || character == ']' || character == '\'' || character == '"'
                })
                .trim();
            (!item.is_empty()).then(|| item.to_string())
        })
        .collect()
}

pub fn extract_router_paths(source: &str) -> Vec<String> {
    if !source.contains("createRouter") && !source.contains("routes:") {
        return Vec::new();
    }

    let mut paths = Vec::new();
    let mut remaining = source;

    while let Some(index) = remaining.find("path:") {
        let after = &remaining[index + "path:".len()..];
        let trimmed = after.trim_start();
        let Some(quote) = trimmed
            .chars()
            .next()
            .filter(|char| *char == '"' || *char == '\'')
        else {
            remaining = after;
            continue;
        };
        let Some(end) = trimmed[1..].find(quote) else {
            break;
        };
        let path = trimmed[1..=end].to_string();
        if path.is_empty() {
            paths.push("/".to_string());
        } else if path.starts_with('/') {
            paths.push(path);
        }

        remaining = &trimmed[end + 1..];
    }

    paths.sort();
    paths.dedup();
    paths
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_vue_router_paths() {
        let source = r#"
            const routes = [
              { path: "/admin", component: Admin },
              { path: "/users/:id", component: User },
            ];
            export default createRouter({ routes });
        "#;
        let paths = extract_router_paths(source);
        assert!(paths.contains(&"/admin".to_string()));
        assert!(paths.contains(&"/users/:id".to_string()));
    }
}
