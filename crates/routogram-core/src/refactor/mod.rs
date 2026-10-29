use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use oxc_allocator::Allocator;
use oxc_ast::ast::{Declaration, ExportDefaultDeclarationKind, Expression, Statement};
use oxc_codegen::Codegen;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType};
use serde::Serialize;
use similar::TextDiff;

use crate::analyzer;
use crate::model::{Node, Topology};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefactorFile {
    pub path: String,
    pub is_new: bool,
    pub diff: String,
    pub before: String,
    pub after: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefactorResult {
    pub recipe_id: String,
    pub target_node_id: String,
    pub title: String,
    pub summary: String,
    pub diff: String,
    pub files: Vec<RefactorFile>,
    pub applied: bool,
    pub changed: bool,
    pub warnings: Vec<String>,
}

struct FileChange {
    path: String,
    before: String,
    after: String,
    is_new: bool,
}

pub fn apply_refactor(
    root: &Path,
    recipe_id: &str,
    target_node_id: &str,
    preview_only: bool,
) -> Result<RefactorResult, String> {
    let topology = analyzer::scan(root, "refactor".to_string())?;
    let target = topology
        .nodes
        .iter()
        .find(|node| node.id == target_node_id)
        .ok_or_else(|| format!("Unknown topology node: {target_node_id}"))?;
    let mut warnings = Vec::new();

    let changes = match recipe_id {
        "prune-dead-css" => prune_dead_css(root, &topology, target, &mut warnings)?,
        "extract-component-boundary" => extract_component_boundary(root, target, &mut warnings)?,
        "safe-server-client-split" => safe_server_client_split(root, target, &mut warnings)?,
        _ => return Err(format!("Unknown refactor recipe: {recipe_id}")),
    };

    let files = changes
        .into_iter()
        .map(|change| {
            let diff = unified_diff(&change.path, &change.before, &change.after, change.is_new);

            RefactorFile {
                path: change.path,
                is_new: change.is_new,
                diff,
                before: change.before,
                after: change.after,
            }
        })
        .collect::<Vec<_>>();
    let changed = !files.is_empty();
    let diff = files
        .iter()
        .map(|file| file.diff.clone())
        .collect::<Vec<_>>()
        .join("\n");
    let summary = if changed {
        match recipe_id {
            "prune-dead-css" => format!("Pruned dead CSS in {} file(s).", files.len()),
            "extract-component-boundary" => {
                "Extracted the component JSX boundary into a new file.".to_string()
            }
            "safe-server-client-split" => {
                "Inserted the runtime directive required by the component boundary.".to_string()
            }
            _ => "Applied refactor.".to_string(),
        }
    } else {
        "No safe changes were produced.".to_string()
    };

    if changed && !preview_only {
        let mut ordered = files.iter().collect::<Vec<_>>();
        ordered.sort_by_key(|file| !file.is_new);
        for file in ordered {
            write_change(root, file)?;
        }
    }

    Ok(RefactorResult {
        recipe_id: recipe_id.to_string(),
        target_node_id: target_node_id.to_string(),
        title: recipe_title(recipe_id).to_string(),
        summary,
        diff,
        files,
        applied: changed && !preview_only,
        changed,
        warnings,
    })
}

fn prune_dead_css(
    root: &Path,
    topology: &Topology,
    target: &Node,
    warnings: &mut Vec<String>,
) -> Result<Vec<FileChange>, String> {
    let stylesheets = target_stylesheets(target);
    if stylesheets.is_empty() {
        warnings.push("The target node has no analyzed stylesheets.".to_string());
        return Ok(Vec::new());
    }

    let component_metrics = topology
        .nodes
        .iter()
        .filter(|node| node.kind == "component")
        .filter_map(|node| {
            node.meta
                .as_ref()
                .and_then(|meta| meta.style_metrics.as_ref())
                .map(|metrics| (node, metrics))
        })
        .collect::<Vec<_>>();
    let mut changes = Vec::new();

    for stylesheet in stylesheets {
        if !stylesheet.ends_with(".module.css") {
            continue;
        }

        let importers = component_metrics
            .iter()
            .filter(|(_, metrics)| {
                metrics
                    .stylesheets
                    .as_ref()
                    .is_some_and(|files| files.iter().any(|file| file == &stylesheet))
            })
            .collect::<Vec<_>>();

        if importers.is_empty() {
            continue;
        }

        let dead = importers
            .iter()
            .map(|(_, metrics)| {
                metrics
                    .unused_classes
                    .iter()
                    .cloned()
                    .collect::<BTreeSet<_>>()
            })
            .reduce(|left, right| left.intersection(&right).cloned().collect())
            .unwrap_or_default();

        if dead.is_empty() {
            continue;
        }

        let path = root.join(&stylesheet);
        let source = fs::read_to_string(&path)
            .map_err(|error| format!("Unable to read {stylesheet}: {error}"))?;

        if lightningcss::stylesheet::StyleSheet::parse(
            &source,
            lightningcss::stylesheet::ParserOptions::default(),
        )
        .is_err()
        {
            warnings.push(format!("Skipping invalid stylesheet: {stylesheet}"));
            continue;
        }

        let after = prune_css_selectors(&source, &dead);

        if after != source {
            changes.push(FileChange {
                path: stylesheet,
                before: source,
                after,
                is_new: false,
            });
        }
    }

    Ok(changes)
}

fn extract_component_boundary(
    root: &Path,
    target: &Node,
    warnings: &mut Vec<String>,
) -> Result<Vec<FileChange>, String> {
    if target.kind != "component" {
        return Err("Extract Component Boundary requires a component node.".to_string());
    }

    let path = root.join(&target.file);
    let source = fs::read_to_string(&path)
        .map_err(|error| format!("Unable to read {}: {error}", target.file))?;
    let source_type = SourceType::from_path(&path).map_err(|error| error.to_string())?;
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &source, source_type).parse();

    if !parsed.diagnostics.is_empty() {
        return Err("The component file has parse errors.".to_string());
    }

    let mut imports = Vec::new();

    for statement in &parsed.program.body {
        let Statement::ImportDeclaration(import) = statement else {
            continue;
        };
        let span = statement.span();
        let mut import_text = source[span.start as usize..span.end as usize].to_string();
        let specifier = import.source.value.as_str().unwrap_or_default().to_string();

        if specifier.starts_with("./") || specifier.starts_with("../") {
            let start = (import.source.span.start - span.start) as usize;
            let end = (import.source.span.end - span.start) as usize;
            let rewritten = if let Some(rest) = specifier.strip_prefix("../") {
                format!("../../{rest}")
            } else if let Some(rest) = specifier.strip_prefix("./") {
                format!("../{rest}")
            } else {
                specifier.to_string()
            };
            import_text.replace_range(start..end, &format!("\"{rewritten}\""));
        }

        imports.push(import_text);
    }

    let Some((component_name, return_span, properties)) =
        find_jsx_component(&parsed.program, &source)
    else {
        return Err("No JSX component return was found in this file.".to_string());
    };

    let jsx = &source[return_span.start as usize..return_span.end as usize];
    let view_name = format!("{component_name}View");
    let relative_dir = Path::new(&target.file).parent().unwrap_or(Path::new(""));
    let view_relative = relative_dir
        .join("components")
        .join(format!("{}-view.tsx", to_kebab_case(&component_name)))
        .to_string_lossy()
        .replace('\\', "/");

    if root.join(&view_relative).exists() {
        return Err(format!(
            "Refusing to overwrite existing file: {view_relative}"
        ));
    }

    let (props_type, props_destructure, props_jsx) = if properties.is_empty() {
        (String::new(), String::new(), String::new())
    } else {
        let fields = properties
            .iter()
            .map(|property| format!("  {property}: any;"))
            .collect::<Vec<_>>()
            .join("\n");
        let destructured = properties.join(", ");
        let jsx_props = properties
            .iter()
            .map(|property| format!("{property}={{{property}}}"))
            .collect::<Vec<_>>()
            .join(" ");
        (
            format!("type {view_name}Props = {{\n{fields}\n}};\n\n"),
            format!("  const {{ {destructured} }} = props;\n"),
            format!(" {jsx_props}"),
        )
    };
    let generated = if properties.is_empty() {
        format!(
            "{}\n\nexport function {view_name}() {{\n  return (\n    {}\n  );\n}}\n",
            imports.join("\n"),
            jsx
        )
    } else {
        format!(
            "{}\n\n{props_type}export function {view_name}(props: {view_name}Props) {{\n{props_destructure}  return (\n    {}\n  );\n}}\n",
            imports.join("\n"),
            jsx
        )
    };
    let new_allocator = Allocator::default();
    let generated_parsed = Parser::new(&new_allocator, &generated, SourceType::tsx()).parse();

    if !generated_parsed.diagnostics.is_empty() {
        return Err("Unable to generate a syntactically valid extracted component.".to_string());
    }

    let formatted = Codegen::new().build(&generated_parsed.program).code;
    let module_specifier = view_relative
        .strip_prefix(relative_dir.to_string_lossy().as_ref())
        .unwrap_or(&view_relative)
        .trim_start_matches('/')
        .trim_end_matches(".tsx");
    let import_line = format!("\nimport {{ {view_name} }} from \"./{module_specifier}\";\n");
    let last_import_end = parsed
        .program
        .body
        .iter()
        .filter(|statement| matches!(statement, Statement::ImportDeclaration(_)))
        .map(|statement| statement.span().end as usize)
        .max()
        .unwrap_or(0);

    let mut updated = source.clone();
    updated.replace_range(
        return_span.start as usize..return_span.end as usize,
        &format!("<{view_name}{props_jsx} />"),
    );
    updated.insert_str(last_import_end.min(updated.len()), &import_line);
    let validation =
        Parser::new(&allocator, &updated, SourceType::from_path(&path).unwrap()).parse();

    if !validation.diagnostics.is_empty() {
        return Err("The extracted component produced an invalid parent file.".to_string());
    }

    warnings.push(
        "Extracted the top-level JSX boundary and passed referenced local values as props."
            .to_string(),
    );

    Ok(vec![
        FileChange {
            path: target.file.clone(),
            before: source,
            after: updated,
            is_new: false,
        },
        FileChange {
            path: view_relative,
            before: String::new(),
            after: formatted,
            is_new: true,
        },
    ])
}

fn safe_server_client_split(
    root: &Path,
    target: &Node,
    _warnings: &mut Vec<String>,
) -> Result<Vec<FileChange>, String> {
    let path = root.join(&target.file);
    let source = fs::read_to_string(&path)
        .map_err(|error| format!("Unable to read {}: {error}", target.file))?;
    let Some(directive) = runtime_directive(target, &source) else {
        return Err("No deterministic server/client directive applies to this node.".to_string());
    };
    let trimmed = source.trim_start();

    if trimmed.starts_with("\"use client\"") || trimmed.starts_with("'use client'") {
        if directive == "use client" {
            return Ok(Vec::new());
        }

        return Err("The file already contains a conflicting 'use client' directive.".to_string());
    }
    if trimmed.starts_with("\"use server\"") || trimmed.starts_with("'use server'") {
        if directive == "use server" {
            return Ok(Vec::new());
        }

        return Err("The file already contains a conflicting 'use server' directive.".to_string());
    }

    let after = format!("\"{directive}\";\n\n{source}");
    let allocator = Allocator::default();
    let validation = Parser::new(
        &allocator,
        &after,
        SourceType::from_path(&path).unwrap_or(SourceType::tsx()),
    )
    .parse();

    if !validation.diagnostics.is_empty() {
        return Err("The directive insertion produced invalid source.".to_string());
    }

    Ok(vec![FileChange {
        path: target.file.clone(),
        before: source,
        after,
        is_new: false,
    }])
}

fn runtime_directive(target: &Node, source: &str) -> Option<&'static str> {
    if target.kind == "server_action" || target.kind == "api_endpoint" {
        return Some("use server");
    }
    if target
        .meta
        .as_ref()
        .and_then(|meta| meta.is_server_component)
        == Some(false)
    {
        return Some("use client");
    }
    if target.runtime.as_deref() == Some("client") {
        return Some("use client");
    }
    if target.kind == "component"
        && target.runtime.as_deref().unwrap_or("universal") == "universal"
        && [
            "useState",
            "useEffect",
            "useRef",
            "onClick",
            "onChange",
            "window.",
            "document.",
        ]
        .iter()
        .any(|needle| source.contains(needle))
    {
        return Some("use client");
    }

    None
}

fn target_stylesheets(target: &Node) -> Vec<String> {
    if target.kind == "style" {
        return vec![target.file.clone()];
    }

    target
        .meta
        .as_ref()
        .and_then(|meta| meta.style_metrics.as_ref())
        .and_then(|metrics| metrics.stylesheets.clone())
        .unwrap_or_default()
}

fn prune_css_selectors(source: &str, dead: &BTreeSet<String>) -> String {
    let mut output = String::with_capacity(source.len());
    let bytes = source.as_bytes();
    let mut index = 0;

    while index < bytes.len() {
        let start = index;
        let mut in_string = None;
        let mut prelude_end = None;

        while index < bytes.len() {
            let byte = bytes[index];
            if let Some(quote) = in_string {
                if byte == quote {
                    in_string = None;
                }
                index += 1;
                continue;
            }
            if byte == b'"' || byte == b'\'' {
                in_string = Some(byte);
                index += 1;
                continue;
            }
            if byte == b'{' {
                prelude_end = Some(index);
                break;
            }
            index += 1;
        }

        let Some(prelude_end) = prelude_end else {
            output.push_str(&source[start..]);
            break;
        };
        let prelude = &source[start..prelude_end];
        let mut depth = 1;
        index = prelude_end + 1;
        let mut in_string = None;

        while index < bytes.len() && depth > 0 {
            let byte = bytes[index];
            if let Some(quote) = in_string {
                if byte == quote {
                    in_string = None;
                }
            } else if byte == b'"' || byte == b'\'' {
                in_string = Some(byte);
            } else if byte == b'{' {
                depth += 1;
            } else if byte == b'}' {
                depth -= 1;
            }
            index += 1;
        }

        let block = &source[start..index];
        let classes = class_names(prelude);
        let remove = !prelude.trim_start().starts_with('@')
            && !classes.is_empty()
            && classes.iter().all(|class| dead.contains(class));

        if !remove {
            output.push_str(block);
        }
    }

    output
}

fn class_names(selector: &str) -> BTreeSet<String> {
    let bytes = selector.as_bytes();
    let mut classes = BTreeSet::new();
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] != b'.' {
            index += 1;
            continue;
        }
        index += 1;
        let start = index;
        while index < bytes.len()
            && (bytes[index].is_ascii_alphanumeric()
                || bytes[index] == b'-'
                || bytes[index] == b'_')
        {
            index += 1;
        }
        if index > start {
            classes.insert(selector[start..index].to_string());
        }
    }

    classes
}

fn find_jsx_component(
    program: &oxc_ast::ast::Program<'_>,
    source: &str,
) -> Option<(String, oxc_span::Span, Vec<String>)> {
    for statement in &program.body {
        let function = match statement {
            Statement::FunctionDeclaration(function) => Some(function.as_ref()),
            Statement::ExportDeclaration(export) => match &export.declaration {
                Declaration::FunctionDeclaration(function) => Some(function.as_ref()),
                _ => None,
            },
            Statement::ExportDefaultDeclaration(export) => match &export.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(function) => {
                    Some(function.as_ref())
                }
                _ => None,
            },
            _ => None,
        };

        let Some(function) = function else {
            continue;
        };
        let Some(body) = &function.body else {
            continue;
        };
        let return_expression = body.statements.iter().find_map(|statement| {
            let Statement::ReturnStatement(return_statement) = statement else {
                return None;
            };
            jsx_span(return_statement.argument.as_ref()?)
        });
        let Some(return_span) = return_expression else {
            continue;
        };
        let name = function
            .id
            .as_ref()
            .map(|identifier| identifier.name.as_ref().to_string())
            .or_else(|| {
                let Statement::ExportDefaultDeclaration(_) = statement else {
                    return None;
                };
                Some("DefaultComponent".to_string())
            })
            .unwrap_or_else(|| "Component".to_string());
        let jsx = &source[return_span.start as usize..return_span.end as usize];
        let mut candidates = function
            .params
            .items
            .iter()
            .flat_map(|parameter| binding_names(&parameter.pattern))
            .collect::<Vec<_>>();

        for statement in &body.statements {
            if let Statement::VariableDeclaration(declaration) = statement {
                for declarator in &declaration.declarations {
                    candidates.extend(binding_names(&declarator.id));
                }
            } else if let Statement::FunctionDeclaration(function) = statement {
                if let Some(identifier) = &function.id {
                    candidates.push(identifier.name.as_ref().to_string());
                }
            }
        }

        candidates.sort();
        candidates.dedup();
        let properties = candidates
            .into_iter()
            .filter(|name| contains_identifier(jsx, name))
            .collect();

        return Some((name, return_span, properties));
    }

    None
}

fn contains_identifier(source: &str, name: &str) -> bool {
    let bytes = source.as_bytes();
    let needle = name.as_bytes();
    let mut index = 0;

    while index + needle.len() <= bytes.len() {
        if &bytes[index..index + needle.len()] == needle {
            let before_ok = index == 0
                || !(bytes[index - 1].is_ascii_alphanumeric() || bytes[index - 1] == b'_');
            let after = index + needle.len();
            let after_ok = after == bytes.len()
                || !(bytes[after].is_ascii_alphanumeric() || bytes[after] == b'_');
            if before_ok && after_ok {
                return true;
            }
        }
        index += 1;
    }

    false
}

fn jsx_span(expression: &Expression<'_>) -> Option<oxc_span::Span> {
    match expression {
        Expression::JSXElement(_) | Expression::JSXFragment(_) => Some(expression.span()),
        Expression::ParenthesizedExpression(parenthesized) => jsx_span(&parenthesized.expression),
        _ => None,
    }
}

fn binding_names(pattern: &oxc_ast::ast::BindingPattern<'_>) -> Vec<String> {
    use oxc_ast::ast::BindingPattern;

    match pattern {
        BindingPattern::BindingIdentifier(identifier) => {
            vec![identifier.name.as_ref().to_string()]
        }
        BindingPattern::ObjectPattern(object) => object
            .properties
            .iter()
            .flat_map(|property| binding_names(&property.value))
            .collect(),
        BindingPattern::ArrayPattern(array) => array
            .elements
            .iter()
            .flatten()
            .flat_map(binding_names)
            .collect(),
        BindingPattern::AssignmentPattern(assignment) => binding_names(&assignment.left),
    }
}

fn to_kebab_case(name: &str) -> String {
    let mut output = String::new();

    for (index, character) in name.chars().enumerate() {
        if character.is_uppercase() {
            if index > 0 {
                output.push('-');
            }
            output.push(character.to_ascii_lowercase());
        } else {
            output.push(character);
        }
    }

    output
}

fn recipe_title(recipe_id: &str) -> &'static str {
    match recipe_id {
        "prune-dead-css" => "Prune Dead CSS",
        "extract-component-boundary" => "Extract Component Boundary",
        "safe-server-client-split" => "Safe Server/Client Split",
        _ => "Routogram Refactor",
    }
}

fn unified_diff(path: &str, before: &str, after: &str, is_new: bool) -> String {
    let before_header = if is_new {
        "/dev/null".to_string()
    } else {
        format!("a/{path}")
    };
    let after_header = format!("b/{path}");
    TextDiff::from_lines(before, after)
        .unified_diff()
        .context_radius(4)
        .header(&before_header, &after_header)
        .to_string()
}

fn write_change(root: &Path, file: &RefactorFile) -> Result<(), String> {
    let path = root.join(&file.path);
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Unable to resolve workspace: {error}"))?;
    let parent = path
        .parent()
        .ok_or_else(|| format!("Invalid refactor path: {}", file.path))?;
    fs::create_dir_all(parent).map_err(|error| format!("Unable to create directory: {error}"))?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|error| format!("Unable to resolve target directory: {error}"))?;

    if !canonical_parent.starts_with(&canonical_root) {
        return Err("Refactor path escapes the workspace root.".to_string());
    }

    if !file.is_new {
        let current = fs::read_to_string(&path)
            .map_err(|error| format!("Unable to read current file: {error}"))?;
        if current != file.before {
            return Err(format!("File changed on disk since preview: {}", file.path));
        }
    }

    let temporary = path.with_extension(format!(
        "{}.routogram.tmp",
        path.extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("tmp")
    ));
    fs::write(&temporary, &file.after)
        .map_err(|error| format!("Unable to write temporary file: {error}"))?;
    fs::rename(&temporary, &path).map_err(|error| format!("Unable to commit file: {error}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prunes_only_dead_class_rules() {
        let source =
            ".used { color: red; }\n.unused { color: blue; }\n.unused:hover { color: green; }\n";
        let dead = BTreeSet::from(["unused".to_string()]);
        let result = prune_css_selectors(source, &dead);
        assert!(result.contains(".used"));
        assert!(!result.contains(".unused"));
    }

    #[test]
    fn creates_kebab_file_names() {
        assert_eq!(to_kebab_case("ProductCard"), "product-card");
    }
}
