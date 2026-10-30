#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendRouteSignal {
    pub method: String,
    pub path: String,
    pub line: u32,
    pub framework: String,
    pub controller: Option<String>,
}

pub fn detect(source: &str) -> Vec<BackendRouteSignal> {
    let normalized = source.to_lowercase();
    let framework = if normalized.contains("hono") {
        "hono"
    } else if source.contains("@nestjs") || source.contains("@Controller") {
        "nest"
    } else if normalized.contains("express") {
        "express"
    } else {
        return Vec::new();
    };

    let controller = decorator_string(source, "@Controller", false);
    let mut routes = Vec::new();

    for (line_index, line) in source.lines().enumerate() {
        for method in ["get", "post", "put", "patch", "delete", "all"] {
            if let Some(path) = call_string(line, method) {
                let path = if let Some(prefix) = &controller {
                    combine_paths(prefix, &path)
                } else {
                    path
                };
                routes.push(BackendRouteSignal {
                    method: method.to_uppercase(),
                    path,
                    line: line_index as u32 + 1,
                    framework: framework.to_string(),
                    controller: controller.clone(),
                });
            }
        }
        if framework == "nest" {
            for (decorator, method) in [
                ("@Get", "GET"),
                ("@Post", "POST"),
                ("@Put", "PUT"),
                ("@Patch", "PATCH"),
                ("@Delete", "DELETE"),
            ] {
                if line.contains(&format!("{decorator}(")) {
                    let path = decorator_string(line, decorator, false).unwrap_or_default();
                    routes.push(BackendRouteSignal {
                        method: method.to_string(),
                        path: combine_paths(controller.as_deref().unwrap_or(""), &path),
                        line: line_index as u32 + 1,
                        framework: framework.to_string(),
                        controller: controller.clone(),
                    });
                }
            }
        }
    }

    routes.sort_by(|a, b| a.line.cmp(&b.line).then_with(|| a.path.cmp(&b.path)));
    routes.dedup_by(|a, b| a.method == b.method && a.path == b.path);
    routes
}

fn call_string(line: &str, method: &str) -> Option<String> {
    let needle = format!(".{method}(");
    let index = line.find(&needle)?;
    let object = line[..index].trim_end();
    if !["app", "router", "server", "api", "route"]
        .iter()
        .any(|name| object.ends_with(name))
    {
        return None;
    }
    first_string(&line[index + needle.len()..], true)
}

fn decorator_string(line: &str, decorator: &str, require_leading_slash: bool) -> Option<String> {
    let index = line.find(decorator)?;
    let after = &line[index + decorator.len()..];
    first_string(after, require_leading_slash)
}

fn first_string(input: &str, require_leading_slash: bool) -> Option<String> {
    let trimmed = input.trim_start().trim_start_matches('(').trim_start();
    let quote = trimmed.chars().next().filter(|c| *c == '\'' || *c == '"')?;
    let end = trimmed[1..].find(quote)?;
    let value = &trimmed[1..=end];
    if require_leading_slash && !value.starts_with('/') {
        return None;
    }
    Some(value.to_string())
}

fn combine_paths(prefix: &str, path: &str) -> String {
    let prefix = prefix.trim_matches('/');
    let path = path.trim_matches('/');
    match (prefix.is_empty(), path.is_empty()) {
        (true, true) => "/".to_string(),
        (true, false) => format!("/{path}"),
        (false, true) => format!("/{prefix}"),
        (false, false) => format!("/{prefix}/{path}"),
    }
}

#[cfg(test)]
mod tests {
    use super::detect;

    #[test]
    fn detects_nest_routes() {
        let source = r#"
@Controller("orders")
export class OrderController {
  @Post()
  create() {}

  @Get()
  findAll() {}

  @Get(":id")
  findOne() {}
}
"#;
        let routes = detect(source);
        assert_eq!(routes.len(), 3);
        assert!(
            routes
                .iter()
                .any(|route| route.path == "/orders" && route.method == "POST")
        );
        assert!(routes.iter().any(|route| route.path == "/orders/:id"));
    }

    #[test]
    fn detects_hono_routes() {
        let routes = detect("const app = new Hono();\napp.get('/api/health', handler)");
        assert_eq!(routes.len(), 1);
        assert_eq!(routes[0].path, "/api/health");
        assert_eq!(routes[0].framework, "hono");
    }
}
