use std::path::Path;

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    ArrowFunctionBody, BindingPattern, Declaration, ExportDefaultDeclarationKind, Expression,
    Function, Program, Statement, VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_parser::Parser;
use oxc_span::{SourceType, Span};
use oxc_syntax::scope::ScopeFlags;

use crate::routing::tanstack;
use crate::routing::vue;

#[derive(Debug, Clone)]
pub struct RouteDefinition {
    pub path: String,
    pub methods: Vec<String>,
    pub line: u32,
}

#[derive(Debug, Clone)]
pub struct ActionDefinition {
    pub name: String,
    pub line: u32,
}

#[derive(Debug, Clone, Default)]
pub struct BoundaryAnalysis {
    pub route: Option<RouteDefinition>,
    pub actions: Vec<ActionDefinition>,
    pub route_definitions: Vec<String>,
    pub vue_routes: Vec<String>,
    pub backend_routes: Vec<crate::analyzer::plugins::backend::BackendRouteSignal>,
}

pub fn analyze_boundary_file(
    path: &Path,
    relative: &str,
    source: &str,
) -> Result<BoundaryAnalysis, String> {
    let source_type =
        SourceType::from_path(path).map_err(|error| format!("{}: {error}", path.display()))?;
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type).parse();

    if !parsed.diagnostics.is_empty() {
        let detail = parsed
            .diagnostics
            .iter()
            .next()
            .map(|diagnostic| format!("{diagnostic:?}"))
            .unwrap_or_else(|| "unknown parser error".to_string());
        return Err(format!("{}: {detail}", path.display()));
    }

    let route =
        is_route_file(relative).then(|| route_definition(relative, &parsed.program, source));
    let file_level_actions = has_use_server(&parsed.program.directives)
        .then(|| exported_function_names(&parsed.program, source))
        .unwrap_or_default();

    let mut collector = InlineActionCollector {
        source,
        actions: file_level_actions,
    };
    collector.visit_program(&parsed.program);

    let mut actions = collector.actions;
    actions.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then_with(|| left.line.cmp(&right.line))
    });
    actions.dedup_by(|left, right| left.name == right.name && left.line == right.line);

    Ok(BoundaryAnalysis {
        route,
        actions,
        route_definitions: tanstack::extract_routes_from_program(&parsed.program),
        vue_routes: if relative.contains("router") || source.contains("createRouter") {
            vue::extract_router_paths(source)
        } else {
            Vec::new()
        },
        backend_routes: crate::analyzer::plugins::backend::detect(source),
    })
}

fn is_route_file(relative: &str) -> bool {
    let normalized = relative.replace('\\', "/");
    let file_name = normalized.rsplit('/').next().unwrap_or(&normalized);

    file_name.starts_with("route.") || normalized.contains("pages/api/")
}

fn route_definition(relative: &str, program: &Program<'_>, source: &str) -> RouteDefinition {
    let methods = exported_http_methods(program, source);
    let line = methods.first().map(|(_, line)| *line).unwrap_or(1);

    RouteDefinition {
        path: derive_route_path(relative),
        methods: methods.into_iter().map(|(method, _)| method).collect(),
        line,
    }
}

fn derive_route_path(relative: &str) -> String {
    let normalized = relative.replace('\\', "/");
    let without_extension = normalized
        .rsplit_once('.')
        .map(|(path, _)| path)
        .unwrap_or(&normalized);
    let segments = without_extension
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();

    if let Some(pages_index) = segments.iter().position(|segment| *segment == "pages") {
        if segments.get(pages_index + 1) == Some(&"api") {
            let mut rest = segments[pages_index + 2..].to_vec();

            if rest.last() == Some(&"index") {
                rest.pop();
            }

            return if rest.is_empty() {
                "/api".to_string()
            } else {
                format!("/api/{}", rest.join("/"))
            };
        }
    }

    if let Some(app_index) = segments.iter().rposition(|segment| *segment == "app") {
        let mut rest = segments[app_index + 1..]
            .iter()
            .copied()
            .filter(|segment| !(segment.starts_with('(') && segment.ends_with(')')))
            .collect::<Vec<_>>();

        if rest.last() == Some(&"route") {
            rest.pop();
        }

        return if rest.is_empty() {
            "/".to_string()
        } else {
            format!("/{}", rest.join("/"))
        };
    }

    let mut rest = segments;
    rest.pop();
    format!("/{}", rest.join("/"))
}

fn exported_http_methods(program: &Program<'_>, source: &str) -> Vec<(String, u32)> {
    let mut methods = Vec::new();

    for statement in &program.body {
        match statement {
            Statement::ExportDeclaration(declaration) => {
                collect_http_methods_from_declaration(
                    &declaration.declaration,
                    source,
                    &mut methods,
                );
            }
            Statement::ExportDefaultDeclaration(_) => {
                methods.push(("ANY".to_string(), 1));
            }
            _ => {}
        }
    }

    methods.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    methods.dedup_by(|left, right| left.0 == right.0);

    if methods.is_empty() {
        vec![("ANY".to_string(), 1)]
    } else {
        methods
    }
}

fn collect_http_methods_from_declaration(
    declaration: &Declaration<'_>,
    source: &str,
    methods: &mut Vec<(String, u32)>,
) {
    match declaration {
        Declaration::FunctionDeclaration(function) => {
            if let Some(name) = function
                .id
                .as_ref()
                .and_then(|identifier| Some(identifier.name.as_ref()))
            {
                if is_http_method(name) {
                    methods.push((name.to_string(), line_at(source, function.span)));
                }
            }
        }
        Declaration::VariableDeclaration(variables) => {
            for declarator in &variables.declarations {
                let Some(name) = binding_name(&declarator.id) else {
                    continue;
                };
                if is_http_method(name) {
                    methods.push((name.to_string(), line_at(source, declarator.span)));
                }
            }
        }
        _ => {}
    }
}

fn exported_function_names(program: &Program<'_>, source: &str) -> Vec<ActionDefinition> {
    let mut actions = Vec::new();

    for statement in &program.body {
        match statement {
            Statement::ExportDeclaration(declaration) => {
                collect_exported_function(&declaration.declaration, source, &mut actions);
            }
            Statement::ExportDefaultDeclaration(default) => {
                if let ExportDefaultDeclarationKind::FunctionDeclaration(function) =
                    &default.declaration
                {
                    let name = function
                        .id
                        .as_ref()
                        .map(|identifier| identifier.name.as_ref().to_string())
                        .unwrap_or_else(|| "default".to_string());
                    actions.push(ActionDefinition {
                        name,
                        line: line_at(source, default.span),
                    });
                }
            }
            _ => {}
        }
    }

    actions
}

fn collect_exported_function(
    declaration: &Declaration<'_>,
    source: &str,
    actions: &mut Vec<ActionDefinition>,
) {
    match declaration {
        Declaration::FunctionDeclaration(function) => {
            if let Some(name) = function
                .id
                .as_ref()
                .map(|identifier| identifier.name.as_ref().to_string())
            {
                actions.push(ActionDefinition {
                    name,
                    line: line_at(source, function.span),
                });
            }
        }
        Declaration::VariableDeclaration(variables) => {
            for declarator in &variables.declarations {
                let Some(name) = binding_name(&declarator.id) else {
                    continue;
                };
                if declarator.init.is_some() {
                    actions.push(ActionDefinition {
                        name: name.to_string(),
                        line: line_at(source, declarator.span),
                    });
                }
            }
        }
        _ => {}
    }
}

fn has_use_server(directives: &[oxc_ast::ast::Directive<'_>]) -> bool {
    directives.iter().any(|directive| {
        directive
            .directive
            .as_str()
            .eq_ignore_ascii_case("use server")
    })
}

struct InlineActionCollector<'a> {
    source: &'a str,
    actions: Vec<ActionDefinition>,
}

impl<'a> Visit<'a> for InlineActionCollector<'a> {
    fn visit_function(&mut self, function: &Function<'a>, flags: ScopeFlags) {
        if function_has_use_server(function) {
            if let Some(name) = function
                .id
                .as_ref()
                .map(|identifier| identifier.name.as_ref().to_string())
            {
                self.actions.push(ActionDefinition {
                    name,
                    line: line_at(self.source, function.span),
                });
            }
        }

        walk::walk_function(self, function, flags);
    }

    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'a>) {
        if let Some(name) = binding_name(&declarator.id) {
            let has_inline_directive = declarator.init.as_ref().is_some_and(|init| match init {
                Expression::ArrowFunctionExpression(arrow) => arrow_has_use_server(arrow),
                Expression::FunctionExpression(function) => function_has_use_server(function),
                _ => false,
            });

            if has_inline_directive {
                self.actions.push(ActionDefinition {
                    name: name.to_string(),
                    line: line_at(self.source, declarator.span),
                });
            }
        }

        walk::walk_variable_declarator(self, declarator);
    }
}

fn arrow_has_use_server(arrow: &oxc_ast::ast::ArrowFunctionExpression<'_>) -> bool {
    match &arrow.body {
        ArrowFunctionBody::FunctionBody(body) => has_use_server(&body.directives),
        _ => false,
    }
}

fn function_has_use_server(function: &Function<'_>) -> bool {
    function
        .body
        .as_ref()
        .is_some_and(|body| has_use_server(&body.directives))
}

fn binding_name<'a>(pattern: &'a BindingPattern<'a>) -> Option<&'a str> {
    match pattern {
        BindingPattern::BindingIdentifier(identifier) => Some(identifier.name.as_ref()),
        _ => None,
    }
}

fn is_http_method(name: &str) -> bool {
    matches!(
        name,
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
    )
}

fn line_at(source: &str, span: Span) -> u32 {
    let mut offset = (span.start as usize).min(source.len());
    while offset > 0 && !source.is_char_boundary(offset) {
        offset -= 1;
    }

    source[..offset]
        .bytes()
        .filter(|byte| *byte == b'\n')
        .count() as u32
        + 1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_app_route_handlers() {
        let source = r#"
            export async function GET() { return Response.json({}); }
            export async function POST() { return new Response(null, { status: 201 }); }
        "#;

        let analysis = analyze_boundary_file(
            Path::new("app/api/orders/route.ts"),
            "app/api/orders/route.ts",
            source,
        )
        .unwrap();
        let route = analysis.route.unwrap();

        assert_eq!(route.path, "/api/orders");
        assert_eq!(route.methods, vec!["GET", "POST"]);
    }

    #[test]
    fn detects_file_level_server_actions() {
        let source = r#"
            "use server";
            export async function createOrder() {}
            export const cancelOrder = async () => {};
        "#;

        let analysis =
            analyze_boundary_file(Path::new("actions/orders.ts"), "actions/orders.ts", source)
                .unwrap();

        assert!(analysis.route.is_none());
        assert!(
            analysis
                .actions
                .iter()
                .any(|action| action.name == "createOrder")
        );
        assert!(
            analysis
                .actions
                .iter()
                .any(|action| action.name == "cancelOrder")
        );
    }

    #[test]
    fn detects_inline_server_actions() {
        let source = r#"
            export function Page() {
                async function save() { "use server"; }
                return null;
            }
        "#;

        let analysis =
            analyze_boundary_file(Path::new("app/page.tsx"), "app/page.tsx", source).unwrap();

        assert!(analysis.actions.iter().any(|action| action.name == "save"));
    }
}
