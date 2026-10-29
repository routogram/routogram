use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use cssparser::{BasicParseErrorKind, CowRcStr, Parser, ParserState};
use lightningcss::declaration::DeclarationBlock;
use lightningcss::error::PrinterError;
use lightningcss::printer::Printer;
use lightningcss::properties::custom::CustomPropertyName;
use lightningcss::properties::{Property, PropertyId};
use lightningcss::rules::{CssRule, CssRuleList, Location};
use lightningcss::selector::{Component, Selector};
use lightningcss::stylesheet::{ParserOptions, PrinterOptions, StyleSheet};
use lightningcss::traits::{AtRuleParser, ToCss};

use crate::model::{BlastRadiusWarning, StyleToken};

#[derive(Debug, Clone, Default)]
pub struct StyleSheetAnalysis {
    pub is_module: bool,
    pub defined_classes: BTreeSet<String>,
    pub defined_tokens: BTreeSet<String>,
    pub consumed_tokens: BTreeSet<String>,
    pub global_tokens: Vec<StyleToken>,
    pub warnings: Vec<BlastRadiusWarning>,
}

#[derive(Debug, Default)]
pub struct GlobalTokenRegistry {
    tokens: BTreeMap<String, StyleToken>,
}

impl GlobalTokenRegistry {
    pub fn contains(&self, name: &str) -> bool {
        self.tokens.contains_key(name)
    }

    pub fn get(&self, name: &str) -> Option<&StyleToken> {
        self.tokens.get(name)
    }

    pub fn insert(&mut self, token: StyleToken) {
        self.tokens.entry(token.name.clone()).or_insert(token);
    }

    pub fn values(&self) -> Vec<StyleToken> {
        let mut tokens: Vec<StyleToken> = self.tokens.values().cloned().collect();
        tokens.sort_by(|left, right| left.name.cmp(&right.name));
        tokens
    }
}

#[derive(Debug, Clone)]
pub struct ThemeRule<'i> {
    pub declarations: DeclarationBlock<'i>,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone)]
pub enum RoutogramAtRule<'i> {
    Theme(ThemeRule<'i>),
}

impl ToCss for RoutogramAtRule<'_> {
    fn to_css<W>(&self, dest: &mut Printer<W>) -> Result<(), PrinterError>
    where
        W: std::fmt::Write,
    {
        match self {
            RoutogramAtRule::Theme(theme) => {
                dest.write_str("@theme")?;
                theme.declarations.to_css_block(dest)?;
            }
        }

        Ok(())
    }
}

#[derive(Debug)]
struct RoutogramAtRuleParser;

enum AtRulePrelude {
    Theme,
}

impl<'i> AtRuleParser<'i> for RoutogramAtRuleParser {
    type Prelude = AtRulePrelude;
    type AtRule = RoutogramAtRule<'i>;
    type Error = lightningcss::error::ParserError<'i>;

    fn parse_prelude<'t>(
        &mut self,
        name: CowRcStr<'i>,
        input: &mut Parser<'i, 't>,
        _options: &ParserOptions<'i>,
    ) -> Result<Self::Prelude, cssparser::ParseError<'i, Self::Error>> {
        if name.eq_ignore_ascii_case("theme") {
            while input.next_including_whitespace_and_comments().is_ok() {}
            return Ok(AtRulePrelude::Theme);
        }

        Err(input.new_error(BasicParseErrorKind::AtRuleInvalid(name)))
    }

    fn parse_block<'t>(
        &mut self,
        prelude: Self::Prelude,
        start: &ParserState,
        input: &mut Parser<'i, 't>,
        options: &ParserOptions<'i>,
        _is_nested: bool,
    ) -> Result<Self::AtRule, cssparser::ParseError<'i, Self::Error>> {
        match prelude {
            AtRulePrelude::Theme => {
                let location = start.source_location();
                let declarations = DeclarationBlock::parse(input, options)?;
                Ok(RoutogramAtRule::Theme(ThemeRule {
                    declarations,
                    line: location.line,
                    column: location.column,
                }))
            }
        }
    }
}

pub fn analyze_stylesheet(
    source: &str,
    file_label: &str,
    is_module: bool,
    registry: &mut GlobalTokenRegistry,
) -> Result<StyleSheetAnalysis, String> {
    let options = ParserOptions {
        filename: file_label.to_string(),
        ..ParserOptions::default()
    };
    let sheet = StyleSheet::parse_with(source, options, &mut RoutogramAtRuleParser)
        .map_err(|error| format!("{file_label}: {error}"))?;

    let mut analysis = StyleSheetAnalysis {
        is_module,
        ..StyleSheetAnalysis::default()
    };
    let mut seen_warnings = BTreeSet::new();

    walk_rules(
        &sheet.rules,
        file_label,
        source,
        registry,
        &mut analysis,
        &mut seen_warnings,
    );

    analysis.warnings.sort_by(|left, right| {
        right
            .specificity_score
            .cmp(&left.specificity_score)
            .then_with(|| left.selector.cmp(&right.selector))
    });

    Ok(analysis)
}

fn walk_rules<'i>(
    rules: &CssRuleList<'i, RoutogramAtRule<'i>>,
    file_label: &str,
    source: &str,
    registry: &mut GlobalTokenRegistry,
    analysis: &mut StyleSheetAnalysis,
    seen_warnings: &mut BTreeSet<String>,
) {
    for rule in &rules.0 {
        match rule {
            CssRule::Style(style) => {
                let scope = global_scope(&style.selectors.0);
                process_selectors(&style.selectors.0, analysis, seen_warnings);
                process_declarations(
                    &style.declarations,
                    file_label,
                    source,
                    style.loc,
                    scope,
                    registry,
                    analysis,
                );
                walk_rules(
                    &style.rules,
                    file_label,
                    source,
                    registry,
                    analysis,
                    seen_warnings,
                );
            }
            CssRule::Media(rule) => {
                walk_rules(
                    &rule.rules,
                    file_label,
                    source,
                    registry,
                    analysis,
                    seen_warnings,
                );
            }
            CssRule::Supports(rule) => {
                walk_rules(
                    &rule.rules,
                    file_label,
                    source,
                    registry,
                    analysis,
                    seen_warnings,
                );
            }
            CssRule::LayerBlock(rule) => {
                walk_rules(
                    &rule.rules,
                    file_label,
                    source,
                    registry,
                    analysis,
                    seen_warnings,
                );
            }
            CssRule::Container(rule) => {
                walk_rules(
                    &rule.rules,
                    file_label,
                    source,
                    registry,
                    analysis,
                    seen_warnings,
                );
            }
            CssRule::Scope(rule) => {
                walk_rules(
                    &rule.rules,
                    file_label,
                    source,
                    registry,
                    analysis,
                    seen_warnings,
                );
            }
            CssRule::StartingStyle(rule) => {
                walk_rules(
                    &rule.rules,
                    file_label,
                    source,
                    registry,
                    analysis,
                    seen_warnings,
                );
            }
            CssRule::MozDocument(rule) => {
                walk_rules(
                    &rule.rules,
                    file_label,
                    source,
                    registry,
                    analysis,
                    seen_warnings,
                );
            }
            CssRule::Nesting(rule) => {
                let style = &rule.style;
                let scope = global_scope(&style.selectors.0);
                process_selectors(&style.selectors.0, analysis, seen_warnings);
                process_declarations(
                    &style.declarations,
                    file_label,
                    source,
                    style.loc,
                    scope,
                    registry,
                    analysis,
                );
                walk_rules(
                    &style.rules,
                    file_label,
                    source,
                    registry,
                    analysis,
                    seen_warnings,
                );
            }
            CssRule::NestedDeclarations(rule) => {
                process_declarations(
                    &rule.declarations,
                    file_label,
                    source,
                    rule.loc,
                    None,
                    registry,
                    analysis,
                );
            }
            CssRule::Custom(RoutogramAtRule::Theme(theme)) => {
                process_declarations(
                    &theme.declarations,
                    file_label,
                    source,
                    Location {
                        source_index: 0,
                        line: theme.line,
                        column: theme.column,
                    },
                    Some("theme"),
                    registry,
                    analysis,
                );
            }
            _ => {}
        }
    }
}

fn process_selectors(
    selectors: &[Selector<'_>],
    analysis: &mut StyleSheetAnalysis,
    seen_warnings: &mut BTreeSet<String>,
) {
    for selector in selectors {
        collect_selector_classes(selector, &mut analysis.defined_classes);

        let (id_count, class_count, type_count) = decode_specificity(selector.specificity());
        let score = id_count * 100 + class_count * 10 + type_count;

        if let Some(reason) = blast_radius_reason(id_count, class_count, type_count) {
            let selector_text = selector
                .to_css_string(PrinterOptions::default())
                .unwrap_or_else(|_| "<selector>".to_string());

            if seen_warnings.insert(selector_text.clone()) {
                analysis.warnings.push(BlastRadiusWarning {
                    selector: selector_text,
                    reason,
                    specificity_score: score,
                });
            }
        }
    }
}

fn process_declarations<'i>(
    declarations: &DeclarationBlock<'i>,
    file_label: &str,
    source: &str,
    loc: Location,
    scope: Option<&'static str>,
    registry: &mut GlobalTokenRegistry,
    analysis: &mut StyleSheetAnalysis,
) {
    for property in declarations
        .declarations
        .iter()
        .chain(declarations.important_declarations.iter())
    {
        let property_name = custom_property_name(property);
        let value = property
            .value_to_css_string(PrinterOptions::default())
            .unwrap_or_default();

        for variable in extract_css_variable_names(&value) {
            analysis.consumed_tokens.insert(variable);
        }

        let Some(token_name) = property_name else {
            continue;
        };

        analysis.defined_tokens.insert(token_name.clone());

        if let Some(token_scope) = scope {
            let line = token_definition_line(source, &token_name, loc.line as usize);
            let token = StyleToken {
                name: token_name,
                value: value.trim().to_string(),
                file: file_label.to_string(),
                line,
                scope: token_scope.to_string(),
            };
            analysis.global_tokens.push(token.clone());
            registry.insert(token);
        }
    }
}

fn token_definition_line(source: &str, name: &str, start_line: usize) -> u32 {
    for (index, line) in source.lines().enumerate().skip(start_line) {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix(name) {
            if rest.trim_start().starts_with(':') {
                return index.saturating_add(1) as u32;
            }
        }
    }

    start_line.saturating_add(1) as u32
}

fn custom_property_name(property: &Property<'_>) -> Option<String> {
    let name = match property {
        Property::Custom(custom) => match &custom.name {
            CustomPropertyName::Custom(name) => name.as_ref(),
            CustomPropertyName::Unknown(_) => return None,
        },
        Property::Unparsed(unparsed) => match &unparsed.property_id {
            PropertyId::Custom(name) => name.as_ref(),
            _ => return None,
        },
        _ => return None,
    };

    name.starts_with("--").then(|| name.to_string())
}

fn global_scope(selectors: &[Selector<'_>]) -> Option<&'static str> {
    let mut has_root = false;

    for selector in selectors {
        for component in selector.iter_raw_match_order() {
            match component {
                Component::Host(_) => return Some("host"),
                Component::Root => has_root = true,
                _ => {}
            }
        }
    }

    has_root.then_some("root")
}

fn collect_selector_classes(selector: &Selector<'_>, classes: &mut BTreeSet<String>) {
    for component in selector.iter_raw_match_order() {
        match component {
            Component::Class(name) => {
                classes.insert(name.as_ref().to_string());
            }
            Component::Negation(list)
            | Component::Is(list)
            | Component::Where(list)
            | Component::Any(_, list)
            | Component::Has(list) => {
                for nested in &**list {
                    collect_selector_classes(nested, classes);
                }
            }
            Component::Host(Some(nested)) | Component::Slotted(nested) => {
                collect_selector_classes(nested, classes);
            }
            _ => {}
        }
    }
}

fn decode_specificity(specificity: u32) -> (u32, u32, u32) {
    (
        specificity >> 20,
        (specificity >> 10) & 0x3ff,
        specificity & 0x3ff,
    )
}

fn blast_radius_reason(id_count: u32, class_count: u32, type_count: u32) -> Option<String> {
    if id_count > 0 {
        return Some(format!(
            "Uses {id_count} ID selector(s); overriding this rule requires equal or higher ID specificity."
        ));
    }

    if class_count >= 3 {
        return Some(format!(
            "Combines {class_count} class-like selectors; broad override pressure leaks across components."
        ));
    }

    if class_count >= 2 && type_count >= 1 {
        return Some(format!(
            "Combines {class_count} class-like selectors with a tag selector; the selector is tightly coupled to DOM structure."
        ));
    }

    if class_count >= 1 && type_count >= 2 {
        return Some(format!(
            "Chains {type_count} tag selectors with a class; deep element coupling raises blast radius."
        ));
    }

    None
}

pub fn extract_css_variable_names(input: &str) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    let bytes = input.as_bytes();
    let mut index = 0;

    while index + 4 <= bytes.len() {
        if !bytes[index..].starts_with(b"var(") {
            index += 1;
            continue;
        }

        let mut cursor = index + 4;
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }

        if cursor + 2 > bytes.len() || &bytes[cursor..cursor + 2] != b"--" {
            index += 4;
            continue;
        }

        let start = cursor;
        while cursor < bytes.len()
            && (bytes[cursor].is_ascii_alphanumeric()
                || matches!(bytes[cursor], b'-' | b'_' | b'\\'))
        {
            cursor += 1;
        }

        if cursor > start {
            names.insert(input[start..cursor].to_string());
        }

        index = cursor.max(index + 4);
    }

    names
}

pub fn analyze_css_file(
    path: &Path,
    file_label: &str,
    registry: &mut GlobalTokenRegistry,
) -> Result<StyleSheetAnalysis, String> {
    let source =
        std::fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))?;
    let is_module = file_label.ends_with(".module.css");

    analyze_stylesheet(&source, file_label, is_module, registry)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_css_variable_references() {
        let names = extract_css_variable_names(
            "linear-gradient(var(--zl-primary), var(--zl-accent, var(--zl-fallback)))",
        );

        assert!(names.contains("--zl-primary"));
        assert!(names.contains("--zl-accent"));
        assert!(names.contains("--zl-fallback"));
        assert_eq!(names.len(), 3);
    }

    #[test]
    fn collects_global_tokens_and_blast_radius() {
        let source = r#"
            :root { --zl-primary: #7c3aed; }
            :host { --zl-host: 1px; }
            @theme { --zl-accent: #22d3ee; }
            .card { color: var(--zl-primary); }
            #submit .card .title .icon { color: red; }
        "#;
        let mut registry = GlobalTokenRegistry::default();

        let analysis = analyze_stylesheet(source, "src/tokens.css", false, &mut registry).unwrap();

        assert!(analysis.defined_classes.contains("card"));
        assert!(analysis.defined_classes.contains("icon"));
        assert!(analysis.consumed_tokens.contains("--zl-primary"));
        assert!(analysis.warnings.iter().any(|warning| {
            warning.selector == "#submit .card .title .icon" && warning.specificity_score == 130
        }));

        let tokens = registry.values();
        assert_eq!(tokens.len(), 3);
        assert_eq!(tokens[0].scope, "theme");
        assert_eq!(tokens[1].scope, "host");
        assert_eq!(tokens[2].scope, "root");
    }
}
