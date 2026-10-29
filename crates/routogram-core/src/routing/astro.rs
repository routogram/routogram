use crate::routing::{
    FileRole, FrameworkAnalysis, IslandDirective, component_name, directory_segments,
    import_bindings, import_sources, route_path,
};

pub fn analyze(relative: &str, source: &str) -> FrameworkAnalysis {
    let normalized = relative.replace('\\', "/");
    let directories = directory_segments(relative);
    let stem = normalized
        .rsplit('/')
        .next()
        .and_then(|file| file.split_once('.').map(|(stem, _)| stem))
        .unwrap_or("index");

    let pages_index = directories.iter().position(|segment| segment == "pages");
    let (role, route_path, is_root_layout) = if let Some(pages_index) = pages_index {
        let mut route_segments = directories[pages_index + 1..]
            .iter()
            .filter(|segment| !(segment.starts_with('(') && segment.ends_with(')')))
            .cloned()
            .collect::<Vec<_>>();

        if stem != "index" {
            route_segments.push(stem.to_string());
        }

        (FileRole::Page, Some(route_path(&route_segments)), false)
    } else {
        (FileRole::Component, None, false)
    };

    let bindings = import_bindings(source);
    let mut islands = Vec::new();

    for (component, import_source) in &bindings {
        let Some(attribute) = hydration_for_component(source, component) else {
            continue;
        };

        islands.push(IslandDirective {
            component: component.clone(),
            hydration: attribute,
            source: Some(import_source.clone()),
        });
    }

    FrameworkAnalysis {
        relative: relative.to_string(),
        framework: "astro".to_string(),
        role,
        route_path,
        is_root_layout,
        component_name: Some(component_name(relative)),
        islands,
        middleware: Vec::new(),
        imports: import_sources(source),
    }
}

fn hydration_for_component(source: &str, component: &str) -> Option<String> {
    let needle = format!("<{component}");
    let mut remaining = source;
    let mut offset = 0;

    while let Some(index) = remaining.find(&needle) {
        let start = offset + index;
        let after = &source[start..];
        let end = after.find('>')?;
        let tag = &after[..=end];

        for directive in [
            "client:load",
            "client:visible",
            "client:idle",
            "client:only",
        ] {
            if tag.contains(directive) {
                return Some(directive.to_string());
            }
        }

        offset = start + needle.len();
        remaining = &source[offset..];
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_astro_island_hydration() {
        let source = r#"
            ---
            import Counter from "../components/Counter.tsx";
            ---
            <Counter client:visible />
        "#;
        let analysis = analyze("src/pages/index.astro", source);
        assert_eq!(analysis.role, FileRole::Page);
        assert_eq!(analysis.route_path.as_deref(), Some("/"));
        assert_eq!(analysis.islands.len(), 1);
        assert_eq!(analysis.islands[0].hydration, "client:visible");
    }
}
