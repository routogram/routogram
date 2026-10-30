pub mod backend;
pub mod react;
pub mod vue;

use crate::analyzer::sfc_extractor::extract_sfc_script;

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameworkSignals {
    pub side_effects: Vec<String>,
    pub state_management: Vec<String>,
}

pub fn detect_for_source(framework: &str, source: &str) -> FrameworkSignals {
    match framework {
        "vue" | "nuxt" | "astro" | "svelte" | "sveltekit" => {
            let parts = extract_sfc_script(source, framework);
            let script = if parts.script_source.trim().is_empty() {
                source
            } else {
                parts.script_source.as_str()
            };
            vue::detect(script)
        }
        "hono" | "nest" | "express" => FrameworkSignals::default(),
        _ => react::detect(source),
    }
}
