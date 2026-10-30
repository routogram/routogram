use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: u32 = 2;
pub const GENERATOR_NAME: &str = "routogram";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Generator {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub files_scanned: usize,
    pub duration_ms: u64,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub file: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlastRadiusWarning {
    pub selector: String,
    pub reason: String,
    pub specificity_score: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StyleMetrics {
    pub consumed_tokens: Vec<String>,
    pub defined_classes_count: usize,
    pub unused_classes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unknown_tokens: Option<Vec<String>>,
    pub blast_radius_warnings: Vec<BlastRadiusWarning>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stylesheets: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkCall {
    pub endpoint: String,
    pub method: String,
    #[serde(rename = "type")]
    pub call_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ComponentPropMeta {
    pub name: String,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub prop_type: Option<String>,
    pub optional: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NodeDataFlowMeta {
    pub providers: Vec<String>,
    pub data_role: String,
    pub fetch_signals: Vec<String>,
    pub re_render_surface_count: u32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub side_effects: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub state_management: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NodeMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub framework: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub store_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_server_component: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_dynamic: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_island: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hydration: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_metrics: Option<StyleMetrics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network_calls: Option<Vec<NetworkCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_flow: Option<NodeDataFlowMeta>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub used_stores: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub props: Option<Vec<ComponentPropMeta>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleToken {
    pub name: String,
    pub value: String,
    pub file: String,
    pub line: u32,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub layer: String,
    pub kind: String,
    pub name: String,
    pub file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub framework: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<Source>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<NodeMeta>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<BTreeMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub id: String,
    pub kind: String,
    pub source: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<BTreeMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePackage {
    pub name: String,
    pub path: String,
    pub frameworks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub tool: String,
    pub root: String,
    pub packages: Vec<WorkspacePackage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Topology {
    pub schema_version: u32,
    pub generator: Generator,
    pub root: String,
    pub generated_at: String,
    pub stats: Stats,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub tokens: Vec<StyleToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace: Option<WorkspaceInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyPatch {
    pub updated_nodes: Vec<Node>,
    pub removed_node_ids: Vec<String>,
    pub updated_edges: Vec<Edge>,
    pub removed_edge_ids: Vec<String>,
    pub tokens: Vec<StyleToken>,
    pub generated_at: String,
    pub stats: Stats,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace: Option<WorkspaceInfo>,
}
