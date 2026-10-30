use std::collections::BTreeMap;
use std::path::Path;
use std::time::UNIX_EPOCH;

use crate::analyzer::matcher::JsxAnalysis;
use crate::analyzer::network::BoundaryAnalysis;
use crate::model::Topology;
use crate::routing::FrameworkAnalysis;
use crate::style::StyleSheetAnalysis;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileFingerprint {
    pub modified_ns: u128,
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct CachedCss {
    pub fingerprint: FileFingerprint,
    pub analysis: StyleSheetAnalysis,
}

#[derive(Debug, Clone)]
pub struct CachedJsx {
    pub fingerprint: FileFingerprint,
    pub analysis: JsxAnalysis,
}

#[derive(Debug, Clone)]
pub struct CachedBoundary {
    pub fingerprint: FileFingerprint,
    pub analysis: BoundaryAnalysis,
}

#[derive(Debug, Clone)]
pub struct CachedFramework {
    pub fingerprint: FileFingerprint,
    pub analysis: FrameworkAnalysis,
}

#[derive(Debug, Default)]
pub struct ScanCache {
    pub(crate) root: Option<String>,
    pub(crate) scan_root: Option<String>,
    pub(crate) css: BTreeMap<String, CachedCss>,
    pub(crate) jsx: BTreeMap<String, CachedJsx>,
    pub(crate) boundary: BTreeMap<String, CachedBoundary>,
    pub(crate) framework: BTreeMap<String, CachedFramework>,
    pub(crate) topology: Option<Topology>,
}

impl ScanCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub(crate) fn prepare_roots(&mut self, project_root: &Path, scan_root: &Path) {
        let project = project_root.display().to_string();
        let scan = scan_root.display().to_string();

        if self.root.as_deref() != Some(project.as_str())
            || self.scan_root.as_deref() != Some(scan.as_str())
        {
            self.root = Some(project);
            self.scan_root = Some(scan);
            self.css.clear();
            self.jsx.clear();
            self.boundary.clear();
            self.framework.clear();
            self.topology = None;
        }
    }
}

pub fn file_fingerprint(path: &Path) -> Option<FileFingerprint> {
    let metadata = std::fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    let modified_ns = modified.duration_since(UNIX_EPOCH).ok()?.as_nanos();

    Some(FileFingerprint {
        modified_ns,
        size: metadata.len(),
    })
}
