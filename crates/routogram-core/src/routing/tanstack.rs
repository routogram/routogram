use oxc_ast::ast::{
    Argument, CallExpression, Expression, ObjectPropertyKind, Program, PropertyKey,
};
use oxc_ast_visit::{Visit, walk};

pub fn extract_routes_from_program(program: &Program<'_>) -> Vec<String> {
    let mut collector = RouteCallCollector { routes: Vec::new() };
    collector.visit_program(program);

    let mut routes = collector.routes;
    routes.sort();
    routes.dedup();
    routes
}

struct RouteCallCollector {
    routes: Vec<String>,
}

impl<'a> Visit<'a> for RouteCallCollector {
    fn visit_call_expression(&mut self, call: &CallExpression<'a>) {
        let Expression::Identifier(identifier) = &call.callee else {
            walk::walk_call_expression(self, call);
            return;
        };

        match identifier.name.as_str() {
            "createRootRoute" => self.routes.push("/".to_string()),
            "createFileRoute" => {
                if let Some(Argument::StringLiteral(literal)) = call.arguments.first() {
                    let path = literal.value.as_str().unwrap_or_default().to_string();
                    if path.starts_with('/') {
                        self.routes.push(path);
                    }
                }
            }
            "createRoute" => {
                if let Some(Argument::ObjectExpression(object)) = call.arguments.first() {
                    for property in &object.properties {
                        let ObjectPropertyKind::ObjectProperty(property) = property else {
                            continue;
                        };
                        let PropertyKey::StaticIdentifier(key) = &property.key else {
                            continue;
                        };

                        if key.name.as_str() != "path" {
                            continue;
                        }

                        if let Expression::StringLiteral(literal) = &property.value {
                            let path = literal.value.as_str().unwrap_or_default().to_string();
                            if path.starts_with('/') {
                                self.routes.push(path);
                            }
                        }
                    }
                }
            }
            _ => {}
        }

        walk::walk_call_expression(self, call);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_file_and_config_routes() {
        let source = r#"
            const orderRoute = createFileRoute('/orders/$orderId')({})
            const custom = createRoute({ path: "/reports" })
        "#;
        let allocator = oxc_allocator::Allocator::default();
        let parsed =
            oxc_parser::Parser::new(&allocator, source, oxc_span::SourceType::tsx()).parse();
        let ast_routes = extract_routes_from_program(&parsed.program);
        assert!(ast_routes.contains(&"/orders/$orderId".to_string()));
        assert!(ast_routes.contains(&"/reports".to_string()));
    }
}
