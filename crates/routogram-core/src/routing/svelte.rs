use crate::routing::{
    FileRole, FrameworkAnalysis, component_name, directory_segments, import_sources, route_path,
};

pub fn analyze(relative: &str, source: &str) -> FrameworkAnalysis {
    let normalized = relative.replace('\\', "/");
    let directories = directory_segments(relative);
    let file_name = normalized.rsplit('/').next().unwrap_or("");
    let routes_index = directories.iter().position(|segment| segment == "routes");

    let (role, route_path, is_root_layout) = if let Some(routes_index) = routes_index {
        let route_segments = directories[routes_index + 1..].to_vec();

        match file_name {
            "+page.svelte" => (FileRole::Page, Some(route_path(&route_segments)), false),
            "+layout.svelte" => (
                FileRole::Layout,
                Some(route_path(&route_segments)),
                route_segments.is_empty(),
            ),
            _ => (FileRole::Component, None, false),
        }
    } else {
        (FileRole::Component, None, false)
    };

    FrameworkAnalysis {
        relative: relative.to_string(),
        framework: "svelte".to_string(),
        role,
        route_path,
        is_root_layout,
        component_name: Some(component_name(relative)),
        islands: Vec::new(),
        middleware: Vec::new(),
        imports: import_sources(source),
        side_effects: Vec::new(),
        state_management: Vec::new(),
        has_style_block: false,
        script_line: 1,
        props: Vec::new(),
        used_stores: Vec::new(),
    }
}
