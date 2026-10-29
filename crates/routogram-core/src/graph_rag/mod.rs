use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::analyzer;
use crate::model::{Node, Topology};

const EMBEDDING_DIMENSIONS: usize = 384;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphDocument {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub text: String,
    pub metadata: Value,
    pub embedding: Vec<f32>,
    pub neighbors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRagIndex {
    pub schema_version: u32,
    pub generated_at: String,
    pub root: String,
    pub dimensions: usize,
    pub embedding_model: String,
    pub documents: Vec<GraphDocument>,
    pub stats: GraphRagStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRagStats {
    pub nodes: usize,
    pub edges: usize,
    pub tokens: usize,
    pub documents: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphSearchResult {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub text: String,
    pub metadata: Value,
    pub score: f32,
    pub neighbors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphSearchResponse {
    pub query: String,
    pub mode: String,
    pub results: Vec<GraphSearchResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphContext {
    pub node_ids: Vec<String>,
    pub text: String,
    pub documents: Vec<GraphSearchResult>,
}

#[derive(Debug, Clone)]
struct EdgeInfo {
    id: String,
    kind: String,
    source: String,
    target: String,
}

pub fn build(root: &Path) -> Result<GraphRagIndex, String> {
    let topology = analyzer::scan(root, "graph-rag".to_string())?;
    Ok(build_from_topology(root, &topology))
}

pub fn build_from_topology(_root: &Path, topology: &Topology) -> GraphRagIndex {
    let node_by_id = topology
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node))
        .collect::<BTreeMap<_, _>>();
    let mut outgoing: BTreeMap<String, Vec<&EdgeInfo>> = BTreeMap::new();
    let mut incoming: BTreeMap<String, Vec<&EdgeInfo>> = BTreeMap::new();
    let mut edges = Vec::with_capacity(topology.edges.len());

    for edge in &topology.edges {
        edges.push(EdgeInfo {
            id: edge.id.clone(),
            kind: edge.kind.clone(),
            source: edge.source.clone(),
            target: edge.target.clone(),
        });
    }
    for edge in &edges {
        outgoing.entry(edge.source.clone()).or_default().push(edge);
        incoming.entry(edge.target.clone()).or_default().push(edge);
    }

    let depths = component_depths(topology);
    let mut documents =
        Vec::with_capacity(topology.nodes.len() + edges.len() + topology.tokens.len());
    let mut neighbor_map: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();

    for edge in &edges {
        neighbor_map
            .entry(edge.source.clone())
            .or_default()
            .insert(edge.target.clone());
        neighbor_map
            .entry(edge.target.clone())
            .or_default()
            .insert(edge.source.clone());
    }

    for node in &topology.nodes {
        let route = nearest_route(node, &incoming, &node_by_id);
        let children = outgoing
            .get(&node.id)
            .into_iter()
            .flatten()
            .filter(|edge| edge.kind == "renders")
            .filter_map(|edge| node_by_id.get(edge.target.as_str()).copied())
            .collect::<Vec<_>>();
        let apis = outgoing
            .get(&node.id)
            .into_iter()
            .flatten()
            .filter(|edge| edge.kind == "calls_api" || edge.kind == "invokes_action")
            .filter_map(|edge| node_by_id.get(edge.target.as_str()).copied())
            .collect::<Vec<_>>();
        let consumed_tokens = node
            .meta
            .as_ref()
            .and_then(|meta| meta.style_metrics.as_ref())
            .map(|metrics| metrics.consumed_tokens.clone())
            .unwrap_or_default();
        let dead_css = node
            .meta
            .as_ref()
            .and_then(|meta| meta.style_metrics.as_ref())
            .map(|metrics| metrics.unused_classes.clone())
            .unwrap_or_default();
        let network_calls = node
            .meta
            .as_ref()
            .and_then(|meta| meta.network_calls.as_ref())
            .map(|calls| {
                calls
                    .iter()
                    .map(|call| format!("{} {}", call.method, call.endpoint))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let is_client = node.runtime.as_deref() == Some("client")
            || node.meta.as_ref().and_then(|meta| meta.is_server_component) == Some(false);
        let mut metadata = json!({
            "nodeId": node.id,
            "kind": node.kind,
            "layer": node.layer,
            "name": node.name,
            "file": node.file,
            "package": node.package,
            "route": route,
            "runtime": node.runtime,
            "isClient": is_client,
            "depth": depths.get(&node.id).copied().unwrap_or(0),
            "childCount": children.len(),
            "tokenCount": consumed_tokens.len(),
            "deadCss": dead_css.len(),
            "apiCount": apis.len(),
            "children": children.iter().map(|child| child.name.clone()).collect::<Vec<_>>(),
            "apis": apis.iter().map(|api| format!("{} {}", api.kind, api.name)).collect::<Vec<_>>(),
            "tokens": consumed_tokens,
            "deadClasses": dead_css,
        });
        let edge_summary = outgoing
            .get(&node.id)
            .into_iter()
            .flatten()
            .map(|edge| {
                let target = node_by_id
                    .get(edge.target.as_str())
                    .map(|target| target.name.as_str())
                    .unwrap_or(edge.target.as_str());
                format!("{}{}", edge.kind, target)
            })
            .collect::<Vec<_>>();
        if let Value::Object(map) = &mut metadata {
            map.insert("outgoing".to_string(), json!(edge_summary));
            map.insert(
                "incoming".to_string(),
                json!(incoming.get(&node.id).map_or(0, Vec::len)),
            );
        }

        let text = build_node_text(
            node,
            route.as_deref(),
            children.len(),
            &consumed_tokens,
            &apis,
            &dead_css,
            &network_calls,
        );
        let mut neighbors = neighbor_map.get(&node.id).cloned().unwrap_or_default();
        for token in &consumed_tokens {
            neighbors.insert(format!("token:{token}"));
        }
        let mut neighbors = neighbors.into_iter().collect::<Vec<_>>();
        neighbors.sort();
        documents.push(GraphDocument {
            id: node.id.clone(),
            kind: "node".to_string(),
            title: format!("{} · {}", node.name, node.kind),
            text: text.clone(),
            metadata,
            embedding: embed(&text),
            neighbors,
        });
    }

    for edge in &edges {
        let source = node_by_id.get(edge.source.as_str());
        let target = node_by_id.get(edge.target.as_str());
        let text = format!(
            "Relationship {} connects {} ({}) to {} ({}).",
            edge.kind,
            source
                .map(|node| node.name.as_str())
                .unwrap_or(edge.source.as_str()),
            source.map(|node| node.kind.as_str()).unwrap_or("unknown"),
            target
                .map(|node| node.name.as_str())
                .unwrap_or(edge.target.as_str()),
            target.map(|node| node.kind.as_str()).unwrap_or("unknown"),
        );
        let metadata = json!({
            "edgeId": edge.id,
            "kind": edge.kind,
            "source": edge.source,
            "target": edge.target,
            "sourceName": source.map(|node| node.name.clone()),
            "targetName": target.map(|node| node.name.clone()),
        });
        documents.push(GraphDocument {
            id: format!("edge:{}", edge.id),
            kind: "edge".to_string(),
            title: format!("{} -[{}]-> {}", edge.source, edge.kind, edge.target),
            text: text.clone(),
            metadata,
            embedding: embed(&text),
            neighbors: vec![edge.source.clone(), edge.target.clone()],
        });
    }

    for token in &topology.tokens {
        let text = format!(
            "Design token {} has value {} in {} ({} scope).",
            token.name, token.value, token.file, token.scope
        );
        let metadata = json!({
            "kind": "token",
            "name": token.name,
            "value": token.value,
            "file": token.file,
            "line": token.line,
            "scope": token.scope,
        });
        documents.push(GraphDocument {
            id: format!("token:{}", token.name),
            kind: "token".to_string(),
            title: token.name.clone(),
            text: text.clone(),
            metadata,
            embedding: embed(&text),
            neighbors: Vec::new(),
        });
    }

    GraphRagIndex {
        schema_version: 1,
        generated_at: topology.generated_at.clone(),
        root: topology.root.clone(),
        dimensions: EMBEDDING_DIMENSIONS,
        embedding_model: "routogram-hash-v1".to_string(),
        stats: GraphRagStats {
            nodes: topology.nodes.len(),
            edges: topology.edges.len(),
            tokens: topology.tokens.len(),
            documents: documents.len(),
        },
        documents,
    }
}

fn build_node_text(
    node: &Node,
    route: Option<&str>,
    children: usize,
    consumed_tokens: &[String],
    apis: &[&Node],
    dead_css: &[String],
    network_calls: &[String],
) -> String {
    let runtime = node.runtime.as_deref().unwrap_or("server-or-universal");
    let route_text = route.map_or_else(
        || "with no matched route".to_string(),
        |route| format!("under Route {route}"),
    );
    let token_text = if consumed_tokens.is_empty() {
        "no consumed design tokens".to_string()
    } else {
        format!("consumes design tokens {}", consumed_tokens.join(", "))
    };
    let api_text = if apis.is_empty() {
        "It calls no API boundaries".to_string()
    } else {
        format!(
            "It calls API boundaries {}",
            apis.iter()
                .map(|api| api.name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )
    };
    let network_text = if network_calls.is_empty() {
        String::new()
    } else {
        format!(" Observed network calls: {}.", network_calls.join(", "))
    };
    let dead_text = if dead_css.is_empty() {
        String::new()
    } else {
        format!(" It has dead CSS classes: {}.", dead_css.join(", "))
    };

    format!(
        "Node {} is a {} in the {} layer, located at {}. It is a {} runtime boundary {}; it has {} child components and {}. {}.{}{}",
        node.name,
        node.kind,
        node.layer,
        node.file,
        runtime,
        route_text,
        children,
        token_text,
        api_text,
        network_text,
        dead_text,
    )
}

fn nearest_route(
    node: &Node,
    incoming: &BTreeMap<String, Vec<&EdgeInfo>>,
    node_by_id: &BTreeMap<&str, &Node>,
) -> Option<String> {
    if let Some(route) = &node.route {
        return Some(route.clone());
    }

    let mut queue = VecDeque::from([(node.id.as_str(), 0usize)]);
    let mut visited = BTreeSet::new();

    while let Some((id, depth)) = queue.pop_front() {
        if depth > 8 || !visited.insert(id.to_string()) {
            continue;
        }
        if let Some(parent) = node_by_id.get(id) {
            if parent.kind == "route" {
                return parent.route.clone().or_else(|| Some(parent.name.clone()));
            }
        }
        for edge in incoming.get(id).into_iter().flatten() {
            queue.push_back((edge.source.as_str(), depth + 1));
        }
    }

    None
}

fn component_depths(topology: &Topology) -> BTreeMap<String, u32> {
    let components = topology
        .nodes
        .iter()
        .filter(|node| node.kind == "component")
        .map(|node| node.id.clone())
        .collect::<BTreeSet<_>>();
    let mut children: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut has_parent = BTreeSet::new();

    for edge in &topology.edges {
        if (edge.kind != "renders" && edge.kind != "cross_package")
            || !components.contains(&edge.source)
            || !components.contains(&edge.target)
        {
            continue;
        }
        children
            .entry(edge.source.clone())
            .or_default()
            .push(edge.target.clone());
        has_parent.insert(edge.target.clone());
    }

    let mut depths = BTreeMap::new();
    for component in &components {
        if !has_parent.contains(component) {
            compute_depth(component, &children, &mut depths, &mut BTreeSet::new());
        }
    }

    depths
}

fn compute_depth(
    id: &str,
    children: &BTreeMap<String, Vec<String>>,
    depths: &mut BTreeMap<String, u32>,
    visiting: &mut BTreeSet<String>,
) -> u32 {
    if let Some(depth) = depths.get(id) {
        return *depth;
    }
    if !visiting.insert(id.to_string()) {
        return 0;
    }
    let child = children
        .get(id)
        .into_iter()
        .flatten()
        .map(|child| compute_depth(child, children, depths, visiting))
        .max()
        .unwrap_or(0);
    visiting.remove(id);
    let value = child + 1;
    depths.insert(id.to_string(), value);
    value
}

pub fn search(
    index_json: &str,
    query: &str,
    limit: usize,
    filters_json: &str,
) -> Result<GraphSearchResponse, String> {
    let index: GraphRagIndex = serde_json::from_str(index_json)
        .map_err(|error| format!("Invalid Graph RAG index: {error}"))?;
    let filters: SearchFilters = if filters_json.trim().is_empty() {
        SearchFilters::default()
    } else {
        serde_json::from_str(filters_json)
            .map_err(|error| format!("Invalid graph search filters: {error}"))?
    };
    let query_terms = tokenize(query);
    let query_embedding = embed(query);
    let mut results = index
        .documents
        .iter()
        .filter(|document| filters.matches(document))
        .filter(|document| document.kind != "edge")
        .map(|document| {
            let cosine = cosine_similarity(&query_embedding, &document.embedding);
            let lexical = lexical_score(&query_terms, &document.text);
            GraphSearchResult {
                id: document.id.clone(),
                kind: document.kind.clone(),
                title: document.title.clone(),
                text: document.text.clone(),
                metadata: document.metadata.clone(),
                score: cosine * 0.72 + lexical * 0.28,
                neighbors: document.neighbors.clone(),
            }
        })
        .collect::<Vec<_>>();

    results.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(limit.clamp(1, 100));

    Ok(GraphSearchResponse {
        query: query.to_string(),
        mode: "semantic".to_string(),
        results,
    })
}

pub fn context(index_json: &str, node_ids_json: &str) -> Result<GraphContext, String> {
    let index: GraphRagIndex = serde_json::from_str(index_json)
        .map_err(|error| format!("Invalid Graph RAG index: {error}"))?;
    let node_ids: Vec<String> = serde_json::from_str(node_ids_json)
        .map_err(|error| format!("Invalid node id list: {error}"))?;
    let documents = index
        .documents
        .iter()
        .map(|document| (document.id.as_str(), document))
        .collect::<BTreeMap<_, _>>();
    let mut selected = BTreeSet::new();

    for id in &node_ids {
        selected.insert(id.clone());
        if let Some(document) = documents.get(id.as_str()) {
            for neighbor in &document.neighbors {
                selected.insert(neighbor.clone());
            }
        }
    }

    let mut included = Vec::new();
    let mut sections = Vec::new();
    for id in selected {
        let Some(document) = documents.get(id.as_str()) else {
            continue;
        };
        sections.push(format!("## {}\n{}", document.title, document.text));
        included.push(GraphSearchResult {
            id: document.id.clone(),
            kind: document.kind.clone(),
            title: document.title.clone(),
            text: document.text.clone(),
            metadata: document.metadata.clone(),
            score: 1.0,
            neighbors: document.neighbors.clone(),
        });
    }

    Ok(GraphContext {
        node_ids,
        text: sections.join("\n\n"),
        documents: included,
    })
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchFilters {
    kind: Option<FilterValue>,
    layer: Option<FilterValue>,
    runtime: Option<FilterValue>,
    package: Option<FilterValue>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum FilterValue {
    One(String),
    Many(Vec<String>),
}

impl SearchFilters {
    fn matches(&self, document: &GraphDocument) -> bool {
        filter_matches(&self.kind, document.metadata.get("kind"))
            && filter_matches(&self.layer, document.metadata.get("layer"))
            && filter_matches(&self.runtime, document.metadata.get("runtime"))
            && filter_matches(&self.package, document.metadata.get("package"))
            && (self.kind.is_some() || document.kind != "edge")
    }
}

fn filter_matches(filter: &Option<FilterValue>, value: Option<&Value>) -> bool {
    let Some(filter) = filter else {
        return true;
    };
    let Some(value) = value.and_then(Value::as_str) else {
        return false;
    };
    match filter {
        FilterValue::One(value_filter) => value_filter == value,
        FilterValue::Many(values) => values.iter().any(|candidate| candidate == value),
    }
}

fn lexical_score(query_terms: &[String], text: &str) -> f32 {
    if query_terms.is_empty() {
        return 0.0;
    }
    let lower = text.to_lowercase();
    let matches = query_terms
        .iter()
        .filter(|term| lower.contains(term.as_str()))
        .count() as f32;
    matches / query_terms.len() as f32
}

fn embed(text: &str) -> Vec<f32> {
    let mut vector = vec![0.0f32; EMBEDDING_DIMENSIONS];
    for term in tokenize(text) {
        let hash = fnv1a(term.as_bytes());
        let index = (hash as usize) % EMBEDDING_DIMENSIONS;
        let sign = if hash & (1 << 63) == 0 { 1.0 } else { -1.0 };
        vector[index] += sign;
    }
    let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm > 0.0 {
        for value in &mut vector {
            *value /= norm;
        }
    }
    vector
}

fn cosine_similarity(left: &[f32], right: &[f32]) -> f32 {
    if left.len() != right.len() || left.is_empty() {
        return 0.0;
    }
    left.iter().zip(right).map(|(a, b)| a * b).sum::<f32>()
}

fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenizes_camel_case_and_identifiers() {
        assert!(tokenize("CheckoutForm calls /api/orders").contains(&"checkout".to_string()));
        assert!(tokenize("CheckoutForm calls /api/orders").contains(&"form".to_string()));
        assert!(tokenize("CheckoutForm calls /api/orders").contains(&"orders".to_string()));
    }

    #[test]
    fn parses_aql_path_and_predicates() {
        let query = parse_aql(
            "MATCH (r:Route) -> (c:Component) WHERE c.isClient = true AND c.depth > 4 RETURN c LIMIT 5",
        )
        .expect("AQL should parse");
        assert_eq!(query.return_vars, vec!["c"]);
        assert!(query.where_clause.is_some());
        assert_eq!(query.limit, 5);
    }
}

fn tokenize(text: &str) -> Vec<String> {
    let mut terms = Vec::new();
    let mut current = String::new();

    for character in text.chars() {
        if character.is_alphanumeric() {
            if character.is_uppercase() && !current.is_empty() {
                terms.push(current.to_lowercase());
                current.clear();
            }
            current.push(character.to_ascii_lowercase());
        } else if !current.is_empty() {
            terms.push(current.clone());
            current.clear();
        }
    }
    if !current.is_empty() {
        terms.push(current);
    }

    terms
        .into_iter()
        .filter(|term| term.len() > 1)
        .filter(|term| {
            !matches!(
                term.as_str(),
                "the"
                    | "and"
                    | "for"
                    | "with"
                    | "from"
                    | "that"
                    | "this"
                    | "into"
                    | "under"
                    | "has"
                    | "have"
                    | "are"
                    | "its"
                    | "a"
                    | "an"
            )
        })
        .collect()
}

// Architecture Query Language (AQL) — a deliberately small declarative subset.
// AQL — tập con khai báo nhỏ, chạy hoàn toàn trên Graph RAG index.
pub fn aql(index_json: &str, query: &str, limit: usize) -> Result<GraphSearchResponse, String> {
    let index: GraphRagIndex = serde_json::from_str(index_json)
        .map_err(|error| format!("Invalid Graph RAG index: {error}"))?;
    let parsed = parse_aql(query)?;
    let documents = index
        .documents
        .iter()
        .map(|document| (document.id.as_str(), document))
        .collect::<BTreeMap<_, _>>();
    let edge_docs = index
        .documents
        .iter()
        .filter(|document| document.kind == "edge")
        .collect::<Vec<_>>();
    let outgoing = edge_docs
        .iter()
        .filter_map(|document| {
            let source = document.metadata.get("source")?.as_str()?;
            let target = document.metadata.get("target")?.as_str()?;
            let kind = document.metadata.get("kind")?.as_str()?;
            Some((source.to_string(), target.to_string(), kind.to_string()))
        })
        .fold(
            BTreeMap::<String, Vec<(String, String)>>::new(),
            |mut map, (source, target, kind)| {
                map.entry(source).or_default().push((target, kind));
                map
            },
        );

    let mut bindings = vec![BTreeMap::<String, String>::new()];
    let start_candidates = documents
        .values()
        .filter(|document| document.kind == "node")
        .filter(|document| matches_label(document, parsed.start.label.as_deref()))
        .filter_map(|document| document.metadata.get("nodeId").and_then(Value::as_str))
        .map(str::to_string)
        .collect::<Vec<_>>();

    let mut initial_bindings = Vec::new();
    for binding in bindings {
        for candidate in &start_candidates {
            let mut next = binding.clone();
            next.insert(parsed.start.var.clone(), candidate.clone());
            initial_bindings.push(next);
        }
    }
    bindings = initial_bindings;

    for step in &parsed.steps {
        let mut next_bindings = Vec::new();
        for binding in &bindings {
            let Some(current) = binding.get(&step.from.var) else {
                continue;
            };
            let reachable = reachable_targets(current, step.edge.as_deref(), &outgoing, 4);
            for target in reachable {
                let Some(document) = documents.get(target.as_str()) else {
                    continue;
                };
                if !matches_label(document, step.to.label.as_deref()) {
                    continue;
                }
                let mut next = binding.clone();
                if let Some(existing) = next.get(&step.to.var) {
                    if existing != &target {
                        continue;
                    }
                }
                next.insert(step.to.var.clone(), target);
                next_bindings.push(next);
            }
        }
        bindings = next_bindings;
    }

    if let Some(condition) = &parsed.where_clause {
        bindings.retain(|binding| evaluate(condition, binding, &documents));
    }

    let mut results = Vec::new();
    let mut seen = BTreeSet::new();
    for binding in bindings {
        let vars = if parsed.return_vars.is_empty() {
            binding.keys().cloned().collect::<Vec<_>>()
        } else {
            parsed.return_vars.clone()
        };
        for var in vars {
            let Some(id) = binding.get(&var) else {
                continue;
            };
            if !seen.insert(id.clone()) {
                continue;
            }
            if let Some(document) = documents.get(id.as_str()) {
                results.push(GraphSearchResult {
                    id: document.id.clone(),
                    kind: document.kind.clone(),
                    title: document.title.clone(),
                    text: document.text.clone(),
                    metadata: document.metadata.clone(),
                    score: 1.0,
                    neighbors: document.neighbors.clone(),
                });
            }
        }
    }

    let effective_limit = if limit == 0 { parsed.limit } else { limit };
    results.truncate(effective_limit.clamp(1, 100));
    Ok(GraphSearchResponse {
        query: query.to_string(),
        mode: "aql".to_string(),
        results,
    })
}

#[derive(Debug)]
struct AqlQuery {
    start: AqlNode,
    steps: Vec<AqlStep>,
    where_clause: Option<AqlCondition>,
    return_vars: Vec<String>,
    limit: usize,
}

#[derive(Debug)]
struct AqlNode {
    var: String,
    label: Option<String>,
}

#[derive(Debug)]
struct AqlStep {
    from: AqlNode,
    edge: Option<String>,
    to: AqlNode,
}

#[derive(Debug)]
enum AqlCondition {
    Compare {
        var: String,
        field: String,
        operator: String,
        value: Value,
    },
    Exists {
        label: String,
        negated: bool,
    },
    And(Box<AqlCondition>, Box<AqlCondition>),
    Or(Box<AqlCondition>, Box<AqlCondition>),
    Not(Box<AqlCondition>),
}

#[derive(Debug, Clone, PartialEq)]
enum AqlToken {
    Word(String),
    String(String),
    Number(f64),
    Arrow,
    Star,
    LParen,
    RParen,
    LBracket,
    RBracket,
    Colon,
    Dot,
    Comma,
    Hyphen,
    Operator(String),
}

fn tokenize_aql(input: &str) -> Result<Vec<AqlToken>, String> {
    let mut tokens = Vec::new();
    let chars = input.chars().collect::<Vec<_>>();
    let mut index = 0;

    while index < chars.len() {
        let character = chars[index];
        if character.is_whitespace() {
            index += 1;
            continue;
        }
        match character {
            '(' => {
                tokens.push(AqlToken::LParen);
                index += 1;
            }
            ')' => {
                tokens.push(AqlToken::RParen);
                index += 1;
            }
            '[' => {
                tokens.push(AqlToken::LBracket);
                index += 1;
            }
            ']' => {
                tokens.push(AqlToken::RBracket);
                index += 1;
            }
            ':' => {
                tokens.push(AqlToken::Colon);
                index += 1;
            }
            '.' => {
                tokens.push(AqlToken::Dot);
                index += 1;
            }
            ',' => {
                tokens.push(AqlToken::Comma);
                index += 1;
            }
            '!' if chars.get(index + 1) == Some(&'=') => {
                tokens.push(AqlToken::Operator("!=".to_string()));
                index += 2;
            }
            '>' | '<' => {
                let mut operator = character.to_string();
                index += 1;
                if chars.get(index) == Some(&'=') {
                    operator.push('=');
                    index += 1;
                }
                tokens.push(AqlToken::Operator(operator));
            }
            '=' => {
                index += 1;
                if chars.get(index) == Some(&'=') {
                    index += 1;
                }
                tokens.push(AqlToken::Operator("=".to_string()));
            }
            '-' => {
                if chars.get(index + 1) == Some(&'>') {
                    tokens.push(AqlToken::Arrow);
                    index += 2;
                } else {
                    tokens.push(AqlToken::Hyphen);
                    index += 1;
                }
            }
            '"' | '\'' => {
                let quote = character;
                index += 1;
                let mut value = String::new();
                while index < chars.len() && chars[index] != quote {
                    value.push(chars[index]);
                    index += 1;
                }
                index += 1;
                tokens.push(AqlToken::String(value));
            }
            '*' => {
                tokens.push(AqlToken::Star);
                index += 1;
            }
            _ if character.is_ascii_digit() => {
                let start = index;
                while index < chars.len() && (chars[index].is_ascii_digit() || chars[index] == '.')
                {
                    index += 1;
                }
                let value = chars[start..index].iter().collect::<String>();
                tokens.push(AqlToken::Number(value.parse().unwrap_or_default()));
            }
            _ if character.is_alphanumeric() || character == '_' => {
                let start = index;
                while index < chars.len()
                    && (chars[index].is_alphanumeric()
                        || chars[index] == '_'
                        || chars[index] == '-')
                {
                    index += 1;
                }
                tokens.push(AqlToken::Word(chars[start..index].iter().collect()));
            }
            _ => {
                return Err(format!("Unexpected AQL character: {character}"));
            }
        }
    }

    Ok(tokens)
}

fn parse_aql(query: &str) -> Result<AqlQuery, String> {
    let tokens = tokenize_aql(query)?;
    let mut parser = AqlParser { tokens, index: 0 };
    parser.expect_word("MATCH")?;
    let start = parser.parse_node()?;
    let mut steps = Vec::new();

    loop {
        let Some(token) = parser.peek().cloned() else {
            break;
        };
        let edge = match token {
            AqlToken::Arrow => {
                parser.index += 1;
                None
            }
            AqlToken::Hyphen => {
                parser.index += 1;
                parser.expect(AqlToken::LBracket)?;
                parser.expect(AqlToken::Colon)?;
                let kind = parser.expect_word_any()?;
                parser.expect(AqlToken::RBracket)?;
                parser.expect(AqlToken::Arrow)?;
                Some(kind)
            }
            _ => break,
        };
        let to = parser.parse_node()?;
        steps.push(AqlStep {
            from: steps
                .last()
                .map(|step: &AqlStep| AqlNode {
                    var: step.to.var.clone(),
                    label: step.to.label.clone(),
                })
                .unwrap_or_else(|| AqlNode {
                    var: start.var.clone(),
                    label: start.label.clone(),
                }),
            edge,
            to,
        });
    }

    let where_clause = if parser.peek_word("WHERE") {
        parser.index += 1;
        Some(parser.parse_condition()?)
    } else {
        None
    };

    parser.expect_word("RETURN")?;
    let mut return_vars = Vec::new();
    loop {
        return_vars.push(parser.expect_word_any()?);
        if parser.peek() == Some(&AqlToken::Comma) {
            parser.index += 1;
        } else {
            break;
        }
    }

    let mut limit = 50;
    if parser.peek_word("LIMIT") {
        parser.index += 1;
        if let Some(AqlToken::Number(value)) = parser.peek().cloned() {
            parser.index += 1;
            limit = value as usize;
        }
    }

    Ok(AqlQuery {
        start,
        steps,
        where_clause,
        return_vars,
        limit,
    })
}

struct AqlParser {
    tokens: Vec<AqlToken>,
    index: usize,
}

impl AqlParser {
    fn peek(&self) -> Option<&AqlToken> {
        self.tokens.get(self.index)
    }

    fn peek_word(&self, expected: &str) -> bool {
        matches!(self.peek(), Some(AqlToken::Word(word)) if word.eq_ignore_ascii_case(expected))
    }

    fn expect(&mut self, expected: AqlToken) -> Result<(), String> {
        if self.peek() == Some(&expected) {
            self.index += 1;
            Ok(())
        } else {
            Err(format!(
                "AQL expected {:?} at token {}",
                expected, self.index
            ))
        }
    }

    fn expect_word(&mut self, expected: &str) -> Result<(), String> {
        if self.peek_word(expected) {
            self.index += 1;
            Ok(())
        } else {
            Err(format!("AQL expected {expected} at token {}", self.index))
        }
    }

    fn expect_word_any(&mut self) -> Result<String, String> {
        match self.peek().cloned() {
            Some(AqlToken::Word(word)) => {
                self.index += 1;
                Ok(word)
            }
            other => Err(format!("AQL expected identifier, got {other:?}")),
        }
    }

    fn parse_node(&mut self) -> Result<AqlNode, String> {
        self.expect(AqlToken::LParen)?;
        let var = self.expect_word_any()?;
        let label = if self.peek() == Some(&AqlToken::Colon) {
            self.index += 1;
            Some(self.expect_word_any()?)
        } else {
            None
        };
        self.expect(AqlToken::RParen)?;
        Ok(AqlNode { var, label })
    }

    fn parse_condition(&mut self) -> Result<AqlCondition, String> {
        self.parse_or()
    }

    fn parse_or(&mut self) -> Result<AqlCondition, String> {
        let mut condition = self.parse_and()?;
        while self.peek_word("OR") {
            self.index += 1;
            condition = AqlCondition::Or(Box::new(condition), Box::new(self.parse_and()?));
        }
        Ok(condition)
    }

    fn parse_and(&mut self) -> Result<AqlCondition, String> {
        let mut condition = self.parse_unary()?;
        while self.peek_word("AND") {
            self.index += 1;
            condition = AqlCondition::And(Box::new(condition), Box::new(self.parse_unary()?));
        }
        Ok(condition)
    }

    fn parse_unary(&mut self) -> Result<AqlCondition, String> {
        if self.peek_word("NOT") {
            self.index += 1;
            return Ok(AqlCondition::Not(Box::new(self.parse_unary()?)));
        }
        if self.peek_word("EXISTS") {
            self.index += 1;
            return self.parse_exists(false);
        }
        if self.peek() == Some(&AqlToken::LParen) {
            self.index += 1;
            let condition = self.parse_condition()?;
            self.expect(AqlToken::RParen)?;
            return Ok(condition);
        }
        self.parse_comparison()
    }

    fn parse_exists(&mut self, negated: bool) -> Result<AqlCondition, String> {
        self.expect(AqlToken::LParen)?;
        let _var = self.expect_word_any()?;
        self.expect(AqlToken::Colon)?;
        let label = self.expect_word_any()?;
        self.expect(AqlToken::RParen)?;
        Ok(AqlCondition::Exists { label, negated })
    }

    fn parse_comparison(&mut self) -> Result<AqlCondition, String> {
        let var = self.expect_word_any()?;
        self.expect(AqlToken::Dot)?;
        let field = self.expect_word_any()?;
        let operator = match self.peek().cloned() {
            Some(AqlToken::Operator(operator)) => {
                self.index += 1;
                operator
            }
            Some(AqlToken::Word(word)) if word.eq_ignore_ascii_case("contains") => {
                self.index += 1;
                word
            }
            _ => return Err("AQL expected comparison operator".to_string()),
        };
        let value = match self.peek().cloned() {
            Some(AqlToken::String(value)) => {
                self.index += 1;
                Value::String(value)
            }
            Some(AqlToken::Number(value)) => {
                self.index += 1;
                json!(value)
            }
            Some(AqlToken::Word(value)) => {
                self.index += 1;
                if value.eq_ignore_ascii_case("true") {
                    Value::Bool(true)
                } else if value.eq_ignore_ascii_case("false") {
                    Value::Bool(false)
                } else {
                    Value::String(value)
                }
            }
            _ => return Err("AQL expected comparison value".to_string()),
        };
        Ok(AqlCondition::Compare {
            var,
            field,
            operator,
            value,
        })
    }
}

fn evaluate(
    condition: &AqlCondition,
    binding: &BTreeMap<String, String>,
    documents: &BTreeMap<&str, &GraphDocument>,
) -> bool {
    match condition {
        AqlCondition::And(left, right) => {
            evaluate(left, binding, documents) && evaluate(right, binding, documents)
        }
        AqlCondition::Or(left, right) => {
            evaluate(left, binding, documents) || evaluate(right, binding, documents)
        }
        AqlCondition::Not(condition) => !evaluate(condition, binding, documents),
        AqlCondition::Exists { label, negated } => {
            let exists = documents
                .values()
                .any(|document| document.kind == "node" && matches_label(document, Some(label)));
            if *negated { !exists } else { exists }
        }
        AqlCondition::Compare {
            var,
            field,
            operator,
            value,
        } => {
            let Some(id) = binding.get(var) else {
                return false;
            };
            let Some(document) = documents.get(id.as_str()) else {
                return false;
            };
            let Some(actual) = document.metadata.get(field) else {
                return false;
            };
            compare_values(actual, operator, value)
        }
    }
}

fn compare_values(actual: &Value, operator: &str, expected: &Value) -> bool {
    match operator.to_ascii_lowercase().as_str() {
        "=" | "==" => {
            if let (Some(left), Some(right)) = (actual.as_f64(), expected.as_f64()) {
                (left - right).abs() < f64::EPSILON
            } else {
                actual == expected
            }
        }
        "!=" | "<>" => {
            if let (Some(left), Some(right)) = (actual.as_f64(), expected.as_f64()) {
                (left - right).abs() >= f64::EPSILON
            } else {
                actual != expected
            }
        }
        ">" | ">=" | "<" | "<=" => {
            let left = actual
                .as_f64()
                .or_else(|| actual.as_str().and_then(|v| v.parse().ok()));
            let right = expected
                .as_f64()
                .or_else(|| expected.as_str().and_then(|v| v.parse().ok()));
            match (left, right, operator) {
                (Some(left), Some(right), ">") => left > right,
                (Some(left), Some(right), ">=") => left >= right,
                (Some(left), Some(right), "<") => left < right,
                (Some(left), Some(right), "<=") => left <= right,
                _ => false,
            }
        }
        "CONTAINS" => {
            let left = actual.as_str().unwrap_or_default().to_lowercase();
            let right = expected.as_str().unwrap_or_default().to_lowercase();
            left.contains(&right)
        }
        _ => false,
    }
}

fn matches_label(document: &GraphDocument, label: Option<&str>) -> bool {
    let Some(label) = label else {
        return true;
    };
    if label == "*" {
        return true;
    }
    let actual = document
        .metadata
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let normalized = label.to_lowercase().replace(['-', '_'], "");
    let actual_normalized = actual.to_lowercase().replace(['-', '_'], "");
    normalized == actual_normalized
        || match normalized.as_str() {
            "route" => actual == "route",
            "component" => actual == "component",
            "layout" => actual == "layout",
            "apiboundary" | "api" => actual == "api_endpoint",
            "serveraction" => actual == "server_action",
            "token" => actual == "token",
            _ => false,
        }
}

fn reachable_targets(
    source: &str,
    edge_kind: Option<&str>,
    outgoing: &BTreeMap<String, Vec<(String, String)>>,
    max_depth: usize,
) -> Vec<String> {
    let mut queue = VecDeque::from([(source.to_string(), 0usize)]);
    let mut visited = BTreeSet::new();
    let mut targets = Vec::new();

    while let Some((current, depth)) = queue.pop_front() {
        if depth >= max_depth || !visited.insert(current.clone()) {
            continue;
        }
        for (target, kind) in outgoing.get(&current).into_iter().flatten() {
            if let Some(kind_filter) = edge_kind {
                if kind != kind_filter {
                    continue;
                }
            }
            targets.push(target.clone());
            queue.push_back((target.clone(), depth + 1));
        }
    }

    targets
}
