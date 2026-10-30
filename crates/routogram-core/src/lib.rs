use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(feature = "napi")]
use napi::Result;
#[cfg(feature = "napi")]
use napi_derive::napi;

mod analyzer;
mod federation;
#[cfg(feature = "git-history")]
mod git;
mod graph_rag;
#[cfg(all(feature = "lsp-cli", not(target_arch = "wasm32")))]
pub mod lsp;
mod migration;
mod model;
mod refactor;
mod routing;
mod rulebook;
mod simulation;
mod style;
mod workspace;

#[cfg(feature = "napi")]
use analyzer::ScanCache;

#[cfg(feature = "napi")]
#[napi]
pub fn core_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(feature = "napi")]
#[napi]
pub fn scan_federation(roots_json: String) -> Result<String> {
    let roots: Vec<String> = serde_json::from_str(&roots_json)
        .map_err(|error| napi::Error::from_reason(format!("Invalid federation roots: {error}")))?;
    let topology = federation::scan(roots).map_err(napi::Error::from_reason)?;

    serde_json::to_string(&topology).map_err(|error| {
        napi::Error::from_reason(format!("Failed to serialize federation: {error}"))
    })
}

#[cfg(feature = "napi")]
#[napi]
pub fn run_migration(path: String, recipe_id: String, apply: bool) -> Result<String> {
    let root = canonical_workspace(&path)?;
    let result = migration::scan(&root, &recipe_id, apply).map_err(napi::Error::from_reason)?;

    serde_json::to_string(&result).map_err(|error| {
        napi::Error::from_reason(format!("Failed to serialize migration: {error}"))
    })
}

#[cfg(feature = "napi")]
#[napi]
pub fn simulate_topology(
    path: String,
    topology_json: String,
    operations_json: String,
) -> Result<String> {
    let root = canonical_workspace(&path)?;
    let topology: crate::model::Topology = serde_json::from_str(&topology_json)
        .map_err(|error| napi::Error::from_reason(format!("Invalid topology: {error}")))?;
    let operations: Vec<simulation::SimulationOperation> = serde_json::from_str(&operations_json)
        .map_err(|error| {
        napi::Error::from_reason(format!("Invalid simulation operations: {error}"))
    })?;
    let result = simulation::simulate(&root, &topology, operations);

    serde_json::to_string(&result).map_err(|error| {
        napi::Error::from_reason(format!("Failed to serialize simulation: {error}"))
    })
}

#[cfg(feature = "napi")]
#[napi]
pub fn build_graph_rag(path: String) -> Result<String> {
    let root = canonical_workspace(&path)?;
    let index = graph_rag::build(&root).map_err(napi::Error::from_reason)?;

    serde_json::to_string(&index).map_err(|error| {
        napi::Error::from_reason(format!("Failed to serialize Graph RAG: {error}"))
    })
}

#[cfg(feature = "napi")]
#[napi]
pub fn search_graph_rag(
    index_json: String,
    query: String,
    limit: u32,
    filters_json: String,
) -> Result<String> {
    let response = graph_rag::search(&index_json, &query, limit as usize, &filters_json)
        .map_err(napi::Error::from_reason)?;

    serde_json::to_string(&response)
        .map_err(|error| napi::Error::from_reason(format!("Failed to serialize search: {error}")))
}

#[cfg(feature = "napi")]
#[napi]
pub fn query_graph_rag(index_json: String, aql: String, limit: u32) -> Result<String> {
    let response =
        graph_rag::aql(&index_json, &aql, limit as usize).map_err(napi::Error::from_reason)?;

    serde_json::to_string(&response)
        .map_err(|error| napi::Error::from_reason(format!("Failed to serialize AQL: {error}")))
}

#[cfg(feature = "napi")]
#[napi]
pub fn graph_rag_context(index_json: String, node_ids_json: String) -> Result<String> {
    let context =
        graph_rag::context(&index_json, &node_ids_json).map_err(napi::Error::from_reason)?;

    serde_json::to_string(&context)
        .map_err(|error| napi::Error::from_reason(format!("Failed to serialize context: {error}")))
}

#[cfg(feature = "napi")]
#[napi]
pub fn check_arch_rulebook(path: String, config_json: String) -> Result<String> {
    let root = canonical_workspace(&path)?;
    let report = rulebook::check(&root, &config_json).map_err(napi::Error::from_reason)?;

    serde_json::to_string(&report)
        .map_err(|error| napi::Error::from_reason(format!("Failed to serialize rulebook: {error}")))
}

#[cfg(feature = "napi")]
#[napi]
pub fn apply_refactor(
    path: String,
    recipe_id: String,
    target_node_id: String,
    preview_only: bool,
) -> Result<String> {
    let root = canonical_workspace(&path)?;
    let result = refactor::apply_refactor(&root, &recipe_id, &target_node_id, preview_only)
        .map_err(napi::Error::from_reason)?;

    serde_json::to_string(&result)
        .map_err(|error| napi::Error::from_reason(format!("Failed to serialize refactor: {error}")))
}

#[cfg(feature = "git-history")]
#[cfg(feature = "napi")]
#[napi]
pub fn scan_git_timeline(path: String, limit: u32) -> Result<String> {
    let root = canonical_workspace(&path)?;
    let timeline = git::scan_timeline(&root, limit).map_err(napi::Error::from_reason)?;

    serde_json::to_string(&timeline)
        .map_err(|error| napi::Error::from_reason(format!("Failed to serialize timeline: {error}")))
}

#[cfg(feature = "napi")]
#[napi]
pub fn scan_workspace_with_options(path: String, options_json: String) -> Result<String> {
    #[derive(serde::Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    struct ScanOptions {
        project_root: Option<String>,
        scan_root: Option<String>,
        #[allow(dead_code)]
        cache_dir: Option<String>,
    }

    let options: ScanOptions = serde_json::from_str(&options_json).unwrap_or_default();
    let scan_root = canonical_workspace(options.scan_root.as_deref().unwrap_or(&path))?;
    let project_root = canonical_workspace(
        options
            .project_root
            .as_deref()
            .unwrap_or_else(|| scan_root.to_str().unwrap_or(&path)),
    )?;
    let topology = analyzer::scan_paths(&project_root, &scan_root, iso8601_now())
        .map_err(napi::Error::from_reason)?;

    serde_json::to_string(&topology)
        .map_err(|error| napi::Error::from_reason(format!("Failed to serialize topology: {error}")))
}

#[cfg(feature = "napi")]
#[napi]
pub fn scan_workspace(path: String) -> Result<String> {
    let root = canonical_workspace(&path)?;
    let topology = analyzer::scan(&root, iso8601_now()).map_err(napi::Error::from_reason)?;

    serde_json::to_string(&topology)
        .map_err(|error| napi::Error::from_reason(format!("Failed to serialize topology: {error}")))
}

#[cfg(feature = "napi")]
#[napi]
#[cfg(feature = "napi")]
pub struct IncrementalScanner {
    cache: Mutex<ScanCache>,
}

#[cfg(feature = "napi")]
#[napi]
#[cfg(feature = "napi")]
impl IncrementalScanner {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(ScanCache::new()),
        }
    }

    #[cfg(feature = "napi")]
    #[napi]
    pub fn scan(&self, path: String) -> Result<String> {
        let root = canonical_workspace(&path)?;
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| napi::Error::from_reason("Incremental scanner cache is poisoned."))?;
        let topology = analyzer::scan_cached(&root, iso8601_now(), &mut cache)
            .map_err(napi::Error::from_reason)?;

        serde_json::to_string(&topology).map_err(|error| {
            napi::Error::from_reason(format!("Failed to serialize topology: {error}"))
        })
    }

    #[cfg(feature = "napi")]
    #[napi]
    pub fn update(&self, path: String, changed_files: Vec<String>) -> Result<String> {
        let root = canonical_workspace(&path)?;
        let changed = changed_files
            .into_iter()
            .map(|file| file.replace('\\', "/").trim_start_matches("./").to_string())
            .collect::<BTreeSet<_>>();
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| napi::Error::from_reason("Incremental scanner cache is poisoned."))?;
        let (_, patch) = analyzer::update_cached(&root, iso8601_now(), &mut cache, &changed)
            .map_err(napi::Error::from_reason)?;

        serde_json::to_string(&patch).map_err(|error| {
            napi::Error::from_reason(format!("Failed to serialize patch: {error}"))
        })
    }
}

#[cfg(feature = "napi")]
fn canonical_workspace(path: &str) -> Result<PathBuf> {
    let root = Path::new(path);

    if !root.is_dir() {
        return Err(napi::Error::from_reason(format!(
            "Workspace root is not a directory: {path}"
        )));
    }

    root.canonicalize()
        .map_err(|error| napi::Error::from_reason(format!("Failed to resolve workspace: {error}")))
}

#[cfg(feature = "napi")]
fn iso8601_now() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default();
    let days = seconds.div_euclid(86_400);
    let time_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = time_of_day / 3_600;
    let minute = (time_of_day % 3_600) / 60;
    let second = time_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

// Converts Unix days to a civil date using Howard Hinnant's algorithm.
// Chuyển số ngày Unix sang ngày dương lịch bằng thuật toán của Howard Hinnant.
fn civil_from_days(days_since_epoch: i64) -> (i64, u32, u32) {
    let shifted = days_since_epoch + 719_468;
    let era = if shifted >= 0 {
        shifted
    } else {
        shifted - 146_096
    } / 146_097;
    let day_of_era = (shifted - era * 146_097) as u64;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era as i64 + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_prime + 2) / 5 + 1) as u32;
    let month = if month_prime < 10 {
        month_prime + 3
    } else {
        month_prime - 9
    } as u32;

    (if month <= 2 { year + 1 } else { year }, month, day)
}
