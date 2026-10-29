use std::collections::BTreeSet;
use std::path::Path;

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Argument, BindingPattern, CallExpression, ComputedMemberExpression, Declaration,
    ExportDefaultDeclarationKind, Expression, FormalParameters, IdentifierReference,
    ImportDeclaration, ImportDeclarationSpecifier, ImportOrExportKind, JSXAttribute,
    JSXAttributeName, JSXElement, JSXElementName, JSXFragment, JSXMemberExpression,
    JSXMemberExpressionObject, JSXOpeningElement, MemberExpression, ObjectProperty,
    ObjectPropertyKind, Program, PropertyKey, Statement, StaticMemberExpression, TSSignature,
    TSType, TSTypeName, TemplateLiteral,
};
use oxc_ast_visit::Visit;
use oxc_ast_visit::walk;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType, Span};

use crate::model::{ComponentPropMeta, NetworkCall};
use crate::style::extract_css_variable_names;

#[derive(Debug, Clone)]
pub struct CssImport {
    pub source: String,
    pub bindings: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct LocalImport {
    pub source: String,
    pub type_only: bool,
}

#[derive(Debug, Clone)]
pub struct JsxAnalysis {
    pub has_jsx: bool,
    pub component_name: Option<String>,
    pub runtime: &'static str,
    pub source_line: u32,
    pub source_column: u32,
    pub imports: Vec<CssImport>,
    pub used_classes: BTreeSet<String>,
    pub consumed_tokens: BTreeSet<String>,
    pub inline_tokens: BTreeSet<String>,
    pub network_calls: Vec<NetworkCall>,
    pub called_functions: BTreeSet<String>,
    pub local_imports: Vec<LocalImport>,
    pub has_dynamic_import: bool,
    pub providers: Vec<String>,
    pub fetch_signals: Vec<String>,
    pub used_stores: Vec<String>,
    pub props: Vec<ComponentPropMeta>,
}

#[derive(Default)]
struct ImportCollector {
    imports: Vec<CssImport>,
    local_imports: Vec<LocalImport>,
    store_bindings: BTreeSet<String>,
}

impl<'a> Visit<'a> for ImportCollector {
    fn visit_import_declaration(&mut self, declaration: &ImportDeclaration<'a>) {
        let Some(source) = declaration.source.value.as_str() else {
            return;
        };

        if !is_css_source(source) {
            let type_only = import_is_type_only(declaration);
            self.local_imports.push(LocalImport {
                source: strip_import_query(source).to_string(),
                type_only,
            });
            if !type_only && is_store_source(source) {
                if let Some(specifiers) = &declaration.specifiers {
                    for specifier in specifiers {
                        let name = match specifier {
                            ImportDeclarationSpecifier::ImportSpecifier(specifier) => {
                                specifier.local.name.as_ref()
                            }
                            ImportDeclarationSpecifier::ImportDefaultSpecifier(specifier) => {
                                specifier.local.name.as_ref()
                            }
                            ImportDeclarationSpecifier::ImportNamespaceSpecifier(specifier) => {
                                specifier.local.name.as_ref()
                            }
                        };
                        if is_valid_store_name(name) {
                            self.store_bindings.insert(name.to_string());
                        }
                    }
                }
            }
            return;
        }

        let mut bindings = Vec::new();

        if let Some(specifiers) = &declaration.specifiers {
            for specifier in specifiers {
                match specifier {
                    ImportDeclarationSpecifier::ImportSpecifier(specifier) => {
                        bindings.push(specifier.local.name.as_ref().to_string());
                    }
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(specifier) => {
                        bindings.push(specifier.local.name.as_ref().to_string());
                    }
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(specifier) => {
                        bindings.push(specifier.local.name.as_ref().to_string());
                    }
                }
            }
        }

        let clean_source = strip_import_query(source);
        self.imports.push(CssImport {
            source: clean_source.to_string(),
            bindings,
        });
    }
}

fn jsx_element_name(name: &JSXElementName<'_>) -> Option<String> {
    match name {
        JSXElementName::Identifier(identifier) => Some(identifier.name.as_ref().to_string()),
        JSXElementName::IdentifierReference(identifier) => {
            Some(identifier.name.as_ref().to_string())
        }
        JSXElementName::NamespacedName(namespace) => Some(format!(
            "{}:{}",
            namespace.namespace.name.as_ref(),
            namespace.name.name.as_ref()
        )),
        JSXElementName::MemberExpression(member) => {
            let object = match &member.object {
                JSXMemberExpressionObject::IdentifierReference(identifier) => {
                    identifier.name.as_ref().to_string()
                }
                JSXMemberExpressionObject::MemberExpression(inner) => jsx_member_name(inner),
                JSXMemberExpressionObject::ThisExpression(_) => "this".to_string(),
            };
            Some(format!("{}.{}", object, member.property.name.as_ref()))
        }
        JSXElementName::ThisExpression(_) => None,
    }
}

fn jsx_member_name(member: &JSXMemberExpression<'_>) -> String {
    let object = match &member.object {
        JSXMemberExpressionObject::IdentifierReference(identifier) => {
            identifier.name.as_ref().to_string()
        }
        JSXMemberExpressionObject::MemberExpression(inner) => jsx_member_name(inner),
        JSXMemberExpressionObject::ThisExpression(_) => "this".to_string(),
    };
    format!("{}.{}", object, member.property.name.as_ref())
}

fn import_is_type_only(declaration: &ImportDeclaration<'_>) -> bool {
    if declaration.import_kind == ImportOrExportKind::Type {
        return true;
    }

    declaration.specifiers.as_ref().is_some_and(|specifiers| {
        !specifiers.is_empty()
            && specifiers.iter().all(|specifier| {
                matches!(
                    specifier,
                    ImportDeclarationSpecifier::ImportSpecifier(specifier)
                        if specifier.import_kind == ImportOrExportKind::Type
                )
            })
    })
}

struct UsageCollector {
    css_bindings: BTreeSet<String>,
    classes: BTreeSet<String>,
    tokens: BTreeSet<String>,
    inline_tokens: BTreeSet<String>,
    network_calls: Vec<NetworkCall>,
    called_functions: BTreeSet<String>,
    capture_class_depth: usize,
    style_attribute_depth: usize,
    first_jsx_offset: Option<usize>,
    has_jsx: bool,
    has_dynamic_import: bool,
    providers: BTreeSet<String>,
    fetch_signals: BTreeSet<String>,
    used_stores: BTreeSet<String>,
}

impl Default for UsageCollector {
    fn default() -> Self {
        Self {
            css_bindings: BTreeSet::new(),
            classes: BTreeSet::new(),
            tokens: BTreeSet::new(),
            inline_tokens: BTreeSet::new(),
            network_calls: Vec::new(),
            called_functions: BTreeSet::new(),
            capture_class_depth: 0,
            style_attribute_depth: 0,
            first_jsx_offset: None,
            has_jsx: false,
            has_dynamic_import: false,
            providers: BTreeSet::new(),
            fetch_signals: BTreeSet::new(),
            used_stores: BTreeSet::new(),
        }
    }
}

impl<'a> Visit<'a> for UsageCollector {
    fn visit_jsx_element(&mut self, element: &JSXElement<'a>) {
        self.record_jsx_span(element.span);
        walk::walk_jsx_element(self, element);
    }

    fn visit_identifier_reference(&mut self, identifier: &IdentifierReference<'a>) {
        let name = identifier.name.as_ref();
        if is_valid_store_name(name) {
            self.used_stores.insert(name.to_string());
        }
    }

    fn visit_jsx_opening_element(&mut self, element: &JSXOpeningElement<'a>) {
        if let Some(name) = jsx_element_name(&element.name) {
            let last = name.rsplit('.').next().unwrap_or("");
            if last.ends_with("Provider") && last.chars().next().is_some_and(char::is_uppercase) {
                self.providers.insert(name);
            }
        }
        walk::walk_jsx_opening_element(self, element);
    }

    fn visit_jsx_fragment(&mut self, fragment: &JSXFragment<'a>) {
        self.record_jsx_span(fragment.span);
        walk::walk_jsx_fragment(self, fragment);
    }

    fn visit_jsx_attribute(&mut self, attribute: &JSXAttribute<'a>) {
        let attribute_name = jsx_attribute_name(attribute);
        let captures_classes = matches!(attribute_name, Some("className" | "class"));
        let captures_style = matches!(attribute_name, Some("style"));

        if captures_classes {
            self.capture_class_depth += 1;
        }
        if captures_style {
            self.style_attribute_depth += 1;
        }

        walk::walk_jsx_attribute(self, attribute);

        if captures_classes {
            self.capture_class_depth = self.capture_class_depth.saturating_sub(1);
        }
        if captures_style {
            self.style_attribute_depth = self.style_attribute_depth.saturating_sub(1);
        }
    }

    fn visit_string_literal(&mut self, literal: &oxc_ast::ast::StringLiteral<'a>) {
        if let Some(value) = literal.value.as_str() {
            self.process_text(value);
        }
    }

    fn visit_template_literal(&mut self, template: &TemplateLiteral<'a>) {
        for quasi in &template.quasis {
            self.process_text(quasi.value.raw.as_str());
        }

        walk::walk_template_literal(self, template);
    }

    fn visit_call_expression(&mut self, call: &CallExpression<'a>) {
        self.record_fetch_signal(call);
        self.record_network_call(call);
        walk::walk_call_expression(self, call);
    }

    fn visit_import_expression(&mut self, expression: &oxc_ast::ast::ImportExpression<'a>) {
        self.has_dynamic_import = true;
        walk::walk_import_expression(self, expression);
    }

    fn visit_member_expression(&mut self, member: &MemberExpression<'a>) {
        match member {
            MemberExpression::StaticMemberExpression(member) => {
                self.process_static_member(member);
            }
            MemberExpression::ComputedMemberExpression(member) => {
                self.process_computed_member(member);
            }
            MemberExpression::PrivateFieldExpression(_) => {}
        }

        walk::walk_member_expression(self, member);
    }

    fn visit_object_property(&mut self, property: &ObjectProperty<'a>) {
        if self.style_attribute_depth > 0 {
            if let Some(token) = inline_token_key(&property.key) {
                self.inline_tokens.insert(token);
            }
        }

        walk::walk_object_property(self, property);
    }
}

impl UsageCollector {
    fn record_jsx_span(&mut self, span: Span) {
        self.has_jsx = true;
        if self.first_jsx_offset.is_none() {
            self.first_jsx_offset = Some(span.start as usize);
        }
    }

    fn process_text(&mut self, value: &str) {
        for token in extract_css_variable_names(value) {
            self.tokens.insert(token);
        }

        if self.capture_class_depth == 0 {
            return;
        }

        for class_name in value.split_whitespace() {
            if !class_name.is_empty() {
                self.classes.insert(class_name.to_string());
            }
        }
    }

    fn process_static_member<'a>(&mut self, member: &StaticMemberExpression<'a>) {
        if self.is_css_binding(&member.object) {
            self.classes
                .insert(member.property.name.as_ref().to_string());
        }
    }

    fn process_computed_member<'a>(&mut self, member: &ComputedMemberExpression<'a>) {
        if !self.is_css_binding(&member.object) {
            return;
        }

        if let Expression::StringLiteral(literal) = &member.expression {
            if let Some(name) = literal.value.as_str() {
                self.classes.insert(name.to_string());
            }
        }
    }

    fn is_css_binding(&self, expression: &Expression<'_>) -> bool {
        match expression {
            Expression::Identifier(identifier) => {
                self.css_bindings.contains(identifier.name.as_ref())
            }
            _ => false,
        }
    }

    fn record_fetch_signal(&mut self, call: &CallExpression<'_>) {
        let chain = expression_chain(&call.callee);
        if chain.is_empty() {
            return;
        }

        const HOOKS: &[&str] = &[
            "useQuery",
            "useSuspenseQuery",
            "useSWR",
            "useActionState",
            "useFetch",
        ];
        for signal in HOOKS {
            if chain.iter().any(|segment| segment == signal) {
                self.fetch_signals.insert((*signal).to_string());
            }
        }

        if chain.iter().any(|segment| segment == "fetch") {
            self.fetch_signals.insert("fetch".to_string());
        }
        if chain.first().is_some_and(|segment| segment == "axios") {
            self.fetch_signals.insert("axios".to_string());
        }
        if chain.first().is_some_and(|segment| segment == "prisma") {
            self.fetch_signals.insert("prisma".to_string());
        }
        if chain.first().is_some_and(|segment| segment == "drizzle") {
            self.fetch_signals.insert("drizzle".to_string());
        }
        if chain.first().is_some_and(|segment| segment == "db")
            && chain.get(1).is_some_and(|segment| segment == "query")
        {
            self.fetch_signals.insert("db.query".to_string());
        }
    }

    fn record_network_call<'a>(&mut self, call: &CallExpression<'a>) {
        let chain = expression_chain(&call.callee);

        if chain.is_empty() {
            return;
        }

        if chain.len() == 1 {
            self.called_functions.insert(chain[0].clone());
        } else if chain.first().is_some_and(|segment| segment == "actions") && chain.len() == 2 {
            self.called_functions.insert(chain[1].clone());
        }

        match chain.first().map(String::as_str) {
            Some("fetch") => {
                let Some(endpoint) = first_argument_string(call) else {
                    return;
                };
                let method = method_from_options(call).unwrap_or_else(|| "GET".to_string());
                self.push_network_call(endpoint, method, "fetch");
            }
            Some("axios") => {
                let Some(method) = chain.get(1).map(|method| method.to_uppercase()) else {
                    return;
                };
                if !is_http_method(&method) {
                    return;
                }
                let Some(endpoint) = first_argument_string(call) else {
                    return;
                };
                self.push_network_call(endpoint, method, "fetch");
            }
            _ => {}
        }

        if let Some(method) = chain.last().and_then(|segment| segment.strip_prefix('$')) {
            if !is_http_method(method) {
                return;
            }
            if let Some(endpoint) = rpc_endpoint(&chain[..chain.len() - 1]) {
                self.push_network_call(endpoint, method.to_uppercase(), "rpc");
            }
            return;
        }

        if chain.iter().any(|segment| segment == "trpc") {
            let last = chain.last().map(String::as_str).unwrap_or_default();
            let method = match last {
                "useQuery" | "query" | "useInfiniteQuery" => Some("QUERY"),
                "useMutation" | "mutate" => Some("MUTATION"),
                _ => None,
            };

            if let Some(method) = method {
                let trpc_index = chain
                    .iter()
                    .position(|segment| segment == "trpc")
                    .unwrap_or(0);
                let endpoint = chain[trpc_index + 1..chain.len() - 1].join(".");
                if !endpoint.is_empty() {
                    self.push_network_call(endpoint, method.to_string(), "rpc");
                }
            }
            return;
        }

        if chain.first().is_some_and(|segment| segment == "eden") {
            let Some(method) = chain.last().map(|method| method.to_uppercase()) else {
                return;
            };
            if !is_http_method(&method) {
                return;
            }
            let without_method = &chain[..chain.len() - 1];
            if let Some(endpoint) = rpc_endpoint(without_method) {
                self.push_network_call(endpoint, method, "rpc");
            }
        }
    }

    fn push_network_call(&mut self, endpoint: String, method: String, call_type: &str) {
        if self.network_calls.iter().any(|call| {
            call.endpoint == endpoint && call.method == method && call.call_type == call_type
        }) {
            return;
        }

        self.network_calls.push(NetworkCall {
            endpoint,
            method,
            call_type: call_type.to_string(),
        });
    }
}

fn expression_chain(expression: &Expression<'_>) -> Vec<String> {
    match expression {
        Expression::Identifier(identifier) => vec![identifier.name.as_ref().to_string()],
        Expression::StaticMemberExpression(member) => {
            let mut chain = expression_chain(&member.object);
            chain.push(member.property.name.as_ref().to_string());
            chain
        }
        Expression::ComputedMemberExpression(member) => {
            let mut chain = expression_chain(&member.object);
            if let Expression::StringLiteral(literal) = &member.expression {
                if let Some(property) = literal.value.as_str() {
                    chain.push(property.to_string());
                }
            }
            chain
        }
        Expression::CallExpression(call) => expression_chain(&call.callee),
        _ => Vec::new(),
    }
}

fn first_argument_string(call: &CallExpression<'_>) -> Option<String> {
    call.arguments.first().and_then(|argument| match argument {
        Argument::StringLiteral(literal) => literal.value.as_str().map(ToOwned::to_owned),
        Argument::TemplateLiteral(template) => template
            .single_quasi()
            .and_then(|quasi| quasi.as_str().map(ToOwned::to_owned)),
        _ => None,
    })
}

fn method_from_options(call: &CallExpression<'_>) -> Option<String> {
    let options = call.arguments.get(1)?;

    let Argument::ObjectExpression(object) = options else {
        return None;
    };

    for property in &object.properties {
        let ObjectPropertyKind::ObjectProperty(property) = property else {
            continue;
        };
        let PropertyKey::StaticIdentifier(key) = &property.key else {
            continue;
        };
        if key.name.as_ref() != "method" {
            continue;
        }
        if let Expression::StringLiteral(method) = &property.value {
            return method.value.as_str().map(|method| method.to_uppercase());
        }
    }

    None
}

fn rpc_endpoint(chain: &[String]) -> Option<String> {
    let api_index = chain.iter().position(|segment| segment == "api");
    let start = api_index.unwrap_or(1);

    if start >= chain.len() {
        return None;
    }

    let endpoint = format!("/{}", chain[start..].join("/"));
    (endpoint.len() > 1).then_some(endpoint)
}

fn is_http_method(method: &str) -> bool {
    matches!(
        method,
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
    )
}

pub fn analyze_jsx_file(path: &Path, source: &str) -> Result<JsxAnalysis, String> {
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

    let runtime = detect_runtime(&parsed.program);
    let component_name = extract_component_name(&parsed.program, source);
    let props = extract_component_props(&parsed.program, component_name.as_deref(), source);

    let mut import_collector = ImportCollector::default();
    import_collector.visit_program(&parsed.program);

    let bindings = import_collector
        .imports
        .iter()
        .flat_map(|import| import.bindings.iter().cloned())
        .collect::<BTreeSet<_>>();

    let mut usage = UsageCollector {
        css_bindings: bindings,
        ..UsageCollector::default()
    };
    usage.visit_program(&parsed.program);

    let (source_line, source_column) = usage
        .first_jsx_offset
        .map(|offset| offset_to_line_column(source, offset))
        .unwrap_or((1, 1));

    Ok(JsxAnalysis {
        has_jsx: usage.has_jsx,
        component_name,
        runtime,
        source_line,
        source_column,
        imports: import_collector.imports,
        used_classes: usage.classes,
        consumed_tokens: usage.tokens,
        inline_tokens: usage.inline_tokens,
        network_calls: usage.network_calls,
        called_functions: usage.called_functions,
        local_imports: import_collector.local_imports,
        has_dynamic_import: usage.has_dynamic_import,
        providers: usage.providers.into_iter().collect(),
        fetch_signals: usage.fetch_signals.into_iter().collect(),
        used_stores: usage
            .used_stores
            .into_iter()
            .chain(import_collector.store_bindings)
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect(),
        props,
    })
}

fn extract_component_name(program: &Program<'_>, source: &str) -> Option<String> {
    use oxc_ast::ast::{BindingPattern, Declaration, ExportDefaultDeclarationKind, Statement};

    // Pass 1: explicit default export. This is the strongest signal and must
    // win even when helper constants appear earlier in the file.
    // Lượt 1: default export là tín hiệu mạnh nhất, kể cả khi có helper ở trên.
    for statement in &program.body {
        let Statement::ExportDefaultDeclaration(export) = statement else {
            continue;
        };
        match &export.declaration {
            ExportDefaultDeclarationKind::FunctionDeclaration(function) => {
                if let Some(identifier) = &function.id {
                    return Some(identifier.name.as_ref().to_string());
                }
            }
            ExportDefaultDeclarationKind::ClassDeclaration(class) => {
                if let Some(identifier) = &class.id {
                    return Some(identifier.name.as_ref().to_string());
                }
            }
            ExportDefaultDeclarationKind::Identifier(identifier) => {
                return Some(identifier.name.as_ref().to_string());
            }
            _ => {}
        }
    }

    // Pass 2: named exports (`export function Header`, `export const Header`).
    // Lượt 2: named export.
    for statement in &program.body {
        let Statement::ExportDeclaration(export) = statement else {
            continue;
        };
        if let Some(name) = declaration_name(&export.declaration) {
            return Some(name);
        }
    }

    // Pass 3: top-level declarations in a file without exports.
    // Lượt 3: khai báo top-level khi file không export.
    for statement in &program.body {
        match statement {
            Statement::FunctionDeclaration(function) => {
                if let Some(identifier) = &function.id {
                    return Some(identifier.name.as_ref().to_string());
                }
            }
            Statement::VariableDeclaration(declaration) => {
                if let Some(name) = variable_name(declaration) {
                    return Some(name);
                }
            }
            _ => {}
        }
    }

    // Pass 4: Vue options API `defineComponent({ name: "AppButton" })`.
    // Lượt 4: Vue options API.
    if let Some(index) = source.find("defineComponent") {
        let tail = &source[index..];
        if let Some(name_index) = tail.find("name") {
            let tail = &tail[name_index..];
            if let Some(colon) = tail.find(':') {
                let tail = tail[colon + 1..].trim_start();
                if let Some(quote) = tail.chars().next().filter(|c| *c == '\'' || *c == '"') {
                    if let Some(end) = tail[1..].find(quote) {
                        let name = tail[1..=end].trim().to_string();
                        if !name.is_empty() {
                            return Some(name);
                        }
                    }
                }
            }
        }
    }

    fn declaration_name(declaration: &Declaration<'_>) -> Option<String> {
        match declaration {
            Declaration::FunctionDeclaration(function) => function
                .id
                .as_ref()
                .map(|identifier| identifier.name.as_ref().to_string()),
            Declaration::VariableDeclaration(declaration) => variable_name(declaration),
            _ => None,
        }
    }

    fn variable_name(declaration: &oxc_ast::ast::VariableDeclaration<'_>) -> Option<String> {
        declaration.declarations.iter().find_map(|declarator| {
            if let BindingPattern::BindingIdentifier(identifier) = &declarator.id {
                Some(identifier.name.as_ref().to_string())
            } else {
                None
            }
        })
    }

    None
}

fn extract_component_props(
    program: &Program<'_>,
    component_name: Option<&str>,
    source: &str,
) -> Vec<ComponentPropMeta> {
    let Some(params) = find_component_params(program, component_name) else {
        return Vec::new();
    };
    let Some(param) = params.items.first() else {
        return Vec::new();
    };

    let mut props = param
        .type_annotation
        .as_ref()
        .map(|annotation| props_from_type(program, &annotation.type_annotation, source, 0))
        .unwrap_or_default();

    if props.is_empty() {
        props = object_pattern_names(&param.pattern)
            .into_iter()
            .map(|name| ComponentPropMeta {
                name,
                prop_type: None,
                optional: false,
            })
            .collect();
    }

    let mut seen = BTreeSet::new();
    props.retain(|prop| seen.insert(prop.name.clone()));
    props
}

fn find_component_params<'a>(
    program: &'a Program<'a>,
    name: Option<&str>,
) -> Option<&'a FormalParameters<'a>> {
    for statement in &program.body {
        match statement {
            Statement::ExportDefaultDeclaration(export) => {
                if let ExportDefaultDeclarationKind::FunctionDeclaration(function) =
                    &export.declaration
                {
                    return Some(&function.params);
                }
            }
            Statement::ExportDeclaration(export) => {
                if let Some(params) = declaration_params(&export.declaration, name) {
                    return Some(params);
                }
            }
            Statement::FunctionDeclaration(function) => {
                if function_name_matches(function.id.as_ref(), name) {
                    return Some(&function.params);
                }
            }
            Statement::VariableDeclaration(declaration) => {
                if let Some(params) = variable_params(declaration, name) {
                    return Some(params);
                }
            }
            _ => {}
        }
    }
    None
}

fn declaration_params<'a>(
    declaration: &'a Declaration<'a>,
    name: Option<&str>,
) -> Option<&'a FormalParameters<'a>> {
    match declaration {
        Declaration::FunctionDeclaration(function)
            if function_name_matches(function.id.as_ref(), name) =>
        {
            Some(&function.params)
        }
        Declaration::VariableDeclaration(declaration) => variable_params(declaration, name),
        _ => None,
    }
}

fn variable_params<'a>(
    declaration: &'a oxc_ast::ast::VariableDeclaration<'a>,
    name: Option<&str>,
) -> Option<&'a FormalParameters<'a>> {
    for declarator in &declaration.declarations {
        let BindingPattern::BindingIdentifier(identifier) = &declarator.id else {
            continue;
        };
        if name.is_some_and(|name| identifier.name.as_ref() != name) {
            continue;
        }
        match declarator.init.as_ref() {
            Some(Expression::ArrowFunctionExpression(arrow)) => return Some(&arrow.params),
            Some(Expression::FunctionExpression(function)) => return Some(&function.params),
            _ => {}
        }
    }
    None
}

fn function_name_matches(
    identifier: Option<&oxc_ast::ast::BindingIdentifier<'_>>,
    name: Option<&str>,
) -> bool {
    match (identifier, name) {
        (Some(identifier), Some(name)) => identifier.name.as_ref() == name,
        (Some(_), None) => true,
        _ => false,
    }
}

fn props_from_type(
    program: &Program<'_>,
    ty: &TSType<'_>,
    source: &str,
    depth: usize,
) -> Vec<ComponentPropMeta> {
    if depth > 4 {
        return Vec::new();
    }

    match ty {
        TSType::TSTypeLiteral(literal) => {
            props_from_members(&literal.members, program, source, depth)
        }
        TSType::TSTypeReference(reference) => {
            let name = ts_type_name(&reference.type_name);
            find_named_type_props(program, &name, source, depth + 1)
        }
        TSType::TSIntersectionType(intersection) => merge_props(
            intersection
                .types
                .iter()
                .flat_map(|ty| props_from_type(program, ty, source, depth + 1)),
        ),
        TSType::TSParenthesizedType(parenthesized) => {
            props_from_type(program, &parenthesized.type_annotation, source, depth + 1)
        }
        _ => Vec::new(),
    }
}

fn find_named_type_props(
    program: &Program<'_>,
    name: &str,
    source: &str,
    depth: usize,
) -> Vec<ComponentPropMeta> {
    for statement in &program.body {
        match statement {
            Statement::TSInterfaceDeclaration(interface) => {
                if interface.id.name.as_ref() == name {
                    let mut props =
                        props_from_members(&interface.body.body, program, source, depth);
                    for heritage in &interface.extends {
                        let name = ts_type_name(&heritage.type_name);
                        props.extend(find_named_type_props(program, &name, source, depth + 1));
                    }
                    return merge_props(props);
                }
            }
            Statement::TSTypeAliasDeclaration(alias) => {
                if alias.id.name.as_ref() == name {
                    return props_from_type(program, &alias.type_annotation, source, depth + 1);
                }
            }
            Statement::ExportDeclaration(export) => match &export.declaration {
                Declaration::TSInterfaceDeclaration(interface) => {
                    if interface.id.name.as_ref() == name {
                        return props_from_members(&interface.body.body, program, source, depth);
                    }
                }
                Declaration::TSTypeAliasDeclaration(alias) => {
                    if alias.id.name.as_ref() == name {
                        return props_from_type(program, &alias.type_annotation, source, depth + 1);
                    }
                }
                _ => {}
            },
            Statement::ExportDefaultDeclaration(export) => {
                if let ExportDefaultDeclarationKind::TSInterfaceDeclaration(interface) =
                    &export.declaration
                {
                    if interface.id.name.as_ref() == name {
                        return props_from_members(&interface.body.body, program, source, depth);
                    }
                }
            }
            _ => {}
        }
    }
    Vec::new()
}

fn props_from_members(
    members: &[TSSignature<'_>],
    program: &Program<'_>,
    source: &str,
    depth: usize,
) -> Vec<ComponentPropMeta> {
    let mut props = Vec::new();
    for member in members {
        match member {
            TSSignature::TSPropertySignature(property) => {
                let Some(name) = property_key_name(&property.key) else {
                    continue;
                };
                props.push(ComponentPropMeta {
                    name,
                    prop_type: property
                        .type_annotation
                        .as_ref()
                        .map(|annotation| annotation_text(annotation, source)),
                    optional: property.optional,
                });
            }
            TSSignature::TSMethodSignature(method) => {
                let Some(name) = property_key_name(&method.key) else {
                    continue;
                };
                props.push(ComponentPropMeta {
                    name,
                    prop_type: Some(method_text(method, source)),
                    optional: method.optional,
                });
            }
            _ => {}
        }
    }
    let _ = (program, depth);
    props
}

fn merge_props(props: impl IntoIterator<Item = ComponentPropMeta>) -> Vec<ComponentPropMeta> {
    let mut seen = BTreeSet::new();
    props
        .into_iter()
        .filter(|prop| seen.insert(prop.name.clone()))
        .collect()
}

fn property_key_name(key: &PropertyKey<'_>) -> Option<String> {
    match key {
        PropertyKey::StaticIdentifier(identifier) => Some(identifier.name.as_ref().to_string()),
        PropertyKey::StringLiteral(literal) => literal.value.as_str().map(ToOwned::to_owned),
        _ => None,
    }
}

fn annotation_text(annotation: &oxc_ast::ast::TSTypeAnnotation<'_>, source: &str) -> String {
    let span = annotation.type_annotation.span();
    source
        .get(span.start as usize..span.end as usize)
        .unwrap_or("any")
        .trim()
        .to_string()
}

fn method_text(method: &oxc_ast::ast::TSMethodSignature<'_>, source: &str) -> String {
    let span = method.span;
    source
        .get(span.start as usize..span.end as usize)
        .unwrap_or("function")
        .trim()
        .to_string()
}

fn ts_type_name(name: &TSTypeName<'_>) -> String {
    match name {
        TSTypeName::IdentifierReference(identifier) => identifier.name.as_ref().to_string(),
        TSTypeName::QualifiedName(qualified) => {
            format!("{}.{}", ts_type_name(&qualified.left), qualified.right.name)
        }
        TSTypeName::ThisExpression(_) => "this".to_string(),
    }
}

fn object_pattern_names(pattern: &BindingPattern<'_>) -> Vec<String> {
    let BindingPattern::ObjectPattern(object) = pattern else {
        return Vec::new();
    };
    object
        .properties
        .iter()
        .filter_map(|property| property_key_name(&property.key))
        .collect()
}

fn detect_runtime(program: &Program<'_>) -> &'static str {
    for directive in &program.directives {
        let value = directive.directive.as_str();
        if value.eq_ignore_ascii_case("use client") {
            return "client";
        }
        if value.eq_ignore_ascii_case("use server") {
            return "server";
        }
    }

    "universal"
}

fn jsx_attribute_name<'a>(attribute: &JSXAttribute<'a>) -> Option<&'a str> {
    match &attribute.name {
        JSXAttributeName::Identifier(identifier) => Some(identifier.name.as_str()),
        JSXAttributeName::NamespacedName(_) => None,
    }
}

fn inline_token_key(key: &PropertyKey<'_>) -> Option<String> {
    let name = match key {
        PropertyKey::StaticIdentifier(identifier) => identifier.name.as_ref(),
        PropertyKey::StringLiteral(literal) => literal.value.as_str()?,
        _ => return None,
    };

    name.starts_with("--").then(|| name.to_string())
}

fn offset_to_line_column(source: &str, offset: usize) -> (u32, u32) {
    let mut offset = offset.min(source.len());
    while offset > 0 && !source.is_char_boundary(offset) {
        offset -= 1;
    }

    let before = &source[..offset];
    let line = before.bytes().filter(|byte| *byte == b'\n').count() as u32 + 1;
    let column = before
        .rsplit('\n')
        .next()
        .map(|line_text| line_text.chars().count() as u32 + 1)
        .unwrap_or(1);

    (line, column)
}

fn is_valid_store_name(name: &str) -> bool {
    const RESERVED: &[&str] = &["useStore", "create", "createStore", "Store"];
    if RESERVED.contains(&name) {
        return false;
    }

    if !name.starts_with("use") || !name.ends_with("Store") || name.len() <= 8 {
        return false;
    }

    let middle = &name[3..name.len() - 5];
    middle
        .chars()
        .next()
        .is_some_and(|first| first.is_ascii_uppercase())
}

fn is_store_source(source: &str) -> bool {
    let normalized = source.replace('\\', "/").to_lowercase();
    normalized.split('/').any(|segment| {
        segment == "store" || segment == "stores" || segment == "store.ts" || segment == "stores.ts"
    })
}

fn is_css_source(source: &str) -> bool {
    strip_import_query(source).ends_with(".css")
}

fn strip_import_query(source: &str) -> &str {
    source.split(['?', '#']).next().unwrap_or(source)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_css_module_class_usage_and_tokens() {
        let source = r#"
            "use client";
            import styles from "./Button.module.css";
            export function Button({ active }: { active: boolean }) {
                return (
                    <button
                        className={`${styles.button} ${active ? styles["active"] : ""} utility`}
                        style={{ "--zl-inline": "1px", color: "var(--zl-accent)" }}
                    />
                );
            }
        "#;

        let analysis = analyze_jsx_file(Path::new("Button.tsx"), source).unwrap();

        assert!(analysis.has_jsx);
        assert_eq!(analysis.runtime, "client");
        assert_eq!(analysis.imports.len(), 1);
        assert_eq!(analysis.imports[0].source, "./Button.module.css");
        assert!(analysis.used_classes.contains("button"));
        assert!(analysis.used_classes.contains("active"));
        assert!(analysis.used_classes.contains("utility"));
        assert!(analysis.inline_tokens.contains("--zl-inline"));
        assert!(analysis.consumed_tokens.contains("--zl-accent"));
        assert!(!analysis.has_dynamic_import);
    }

    #[test]
    fn extracts_network_call_patterns() {
        let source = r#"
            import axios from "axios";
            export function Calls() {
                fetch("/api/orders", { method: "POST" });
                axios.get("/api/users");
                client.api.orders.$get();
                trpc.orders.list.useQuery();
                eden.api.orders.get();
                return <div />;
            }
        "#;

        let analysis = analyze_jsx_file(Path::new("Calls.tsx"), source).unwrap();
        let calls = &analysis.network_calls;

        assert!(calls.iter().any(|call| call.endpoint == "/api/orders"
            && call.method == "POST"
            && call.call_type == "fetch"));
        assert!(calls.iter().any(|call| call.endpoint == "/api/users"
            && call.method == "GET"
            && call.call_type == "fetch"));
        assert!(calls.iter().any(|call| call.endpoint == "/api/orders"
            && call.method == "GET"
            && call.call_type == "rpc"));
        assert!(calls.iter().any(|call| call.endpoint == "orders.list"
            && call.method == "QUERY"
            && call.call_type == "rpc"));
        assert!(calls.iter().any(|call| call.endpoint == "/api/orders"
            && call.method == "GET"
            && call.call_type == "rpc"));
    }

    #[test]
    fn resolves_default_export_component_name() {
        let source = "export default function UserAvatar() { return null; }";
        let analysis = analyze_jsx_file(Path::new("src/components/UserAvatar/index.tsx"), source)
            .expect("parse");
        assert_eq!(analysis.component_name.as_deref(), Some("UserAvatar"));
    }

    #[test]
    fn ignores_helpers_before_default_export() {
        let source = r#"
            const helper = 1;
            export default function UserCard() { return null; }
        "#;
        let analysis = analyze_jsx_file(Path::new("src/components/UserCard/index.tsx"), source)
            .expect("parse");
        assert_eq!(analysis.component_name.as_deref(), Some("UserCard"));
    }

    #[test]
    fn resolves_exported_const_component_name() {
        let source = "export const Header = () => <header />;";
        let analysis =
            analyze_jsx_file(Path::new("src/components/Header/index.tsx"), source).expect("parse");
        assert_eq!(analysis.component_name.as_deref(), Some("Header"));
    }

    #[test]
    fn resolves_define_component_name() {
        let source =
            r#"export default defineComponent({ name: "AppButton", setup() { return {}; } });"#;
        let analysis =
            analyze_jsx_file(Path::new("src/components/Button/index.ts"), source).expect("parse");
        assert_eq!(analysis.component_name.as_deref(), Some("AppButton"));
    }

    #[test]
    fn detects_dynamic_imports() {
        let source = r#"
            export function LazyPanel() {
                const load = () => import("./Panel");
                return <button onClick={load}>Load</button>;
            }
        "#;

        let analysis = analyze_jsx_file(Path::new("LazyPanel.tsx"), source).unwrap();

        assert!(analysis.has_dynamic_import);
    }
}
