use std::collections::BTreeSet;
use std::path::Path;

use oxc_allocator::Allocator;
use oxc_ast::ast::{Declaration, Expression, ImportDeclarationSpecifier, Program, Statement};
use oxc_ast_visit::{Visit, walk};
use oxc_parser::Parser;
use oxc_span::SourceType;

fn parse<'a>(path: &Path, source: &'a str, allocator: &'a Allocator) -> Option<Program<'a>> {
    let source_type = SourceType::from_path(path).ok()?;
    let parsed = Parser::new(allocator, source, source_type).parse();
    parsed.diagnostics.is_empty().then_some(parsed.program)
}

pub fn find_function_calls(path: &Path, source: &str) -> Vec<String> {
    let allocator = Allocator::default();
    let Some(program) = parse(path, source, &allocator) else {
        return Vec::new();
    };
    let mut collector = CallCollector::default();
    collector.visit_program(&program);
    collector.calls.into_iter().collect()
}

pub fn get_imported_symbols(path: &Path, source: &str) -> Vec<String> {
    let allocator = Allocator::default();
    let Some(program) = parse(path, source, &allocator) else {
        return Vec::new();
    };
    let mut symbols = BTreeSet::new();
    for statement in &program.body {
        let Statement::ImportDeclaration(import) = statement else {
            continue;
        };
        let Some(specifiers) = &import.specifiers else {
            continue;
        };
        for specifier in specifiers {
            match specifier {
                ImportDeclarationSpecifier::ImportSpecifier(specifier) => {
                    symbols.insert(specifier.local.name.as_ref().to_string());
                }
                ImportDeclarationSpecifier::ImportDefaultSpecifier(specifier) => {
                    symbols.insert(specifier.local.name.as_ref().to_string());
                }
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(specifier) => {
                    symbols.insert(specifier.local.name.as_ref().to_string());
                }
            }
        }
    }
    symbols.into_iter().collect()
}

pub fn find_exported_declarations(path: &Path, source: &str) -> Vec<String> {
    let allocator = Allocator::default();
    let Some(program) = parse(path, source, &allocator) else {
        return Vec::new();
    };
    let mut names = BTreeSet::new();
    for statement in &program.body {
        match statement {
            Statement::ExportDeclaration(export) => match &export.declaration {
                Declaration::FunctionDeclaration(function) => {
                    if let Some(id) = &function.id {
                        names.insert(id.name.as_ref().to_string());
                    }
                }
                Declaration::VariableDeclaration(declaration) => {
                    for declarator in &declaration.declarations {
                        if let oxc_ast::ast::BindingPattern::BindingIdentifier(id) = &declarator.id
                        {
                            names.insert(id.name.as_ref().to_string());
                        }
                    }
                }
                Declaration::ClassDeclaration(class) => {
                    if let Some(id) = &class.id {
                        names.insert(id.name.as_ref().to_string());
                    }
                }
                _ => {}
            },
            Statement::ExportDefaultDeclaration(export) => {
                if let oxc_ast::ast::ExportDefaultDeclarationKind::FunctionDeclaration(function) =
                    &export.declaration
                {
                    if let Some(id) = &function.id {
                        names.insert(id.name.as_ref().to_string());
                    }
                }
            }
            _ => {}
        }
    }
    names.into_iter().collect()
}

#[derive(Default)]
struct CallCollector {
    calls: BTreeSet<String>,
}

impl<'a> Visit<'a> for CallCollector {
    fn visit_call_expression(&mut self, call: &oxc_ast::ast::CallExpression<'a>) {
        if let Expression::Identifier(identifier) = &call.callee {
            self.calls.insert(identifier.name.as_ref().to_string());
        }
        walk::walk_call_expression(self, call);
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{find_exported_declarations, find_function_calls, get_imported_symbols};

    #[test]
    fn extracts_calls_imports_and_exports() {
        let path = Path::new("fixture.tsx");
        let source = "import { useState } from 'react'; export function App() { useState(0); }";
        assert_eq!(get_imported_symbols(path, source), vec!["useState"]);
        assert!(find_function_calls(path, source).contains(&"useState".to_string()));
        assert_eq!(find_exported_declarations(path, source), vec!["App"]);
    }
}
