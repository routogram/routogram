/// Extracts the script blocks from Vue/Astro/Svelte single-file components.
/// Line offsets are preserved by padding removed markup with newlines.
#[derive(Debug, Clone, Default)]
pub struct SfcParts {
    pub script: String,
    pub style: String,
    pub script_line: u32,
}

pub fn extract_sfc_parts(source: &str) -> SfcParts {
    let mut script = String::new();
    let mut style = String::new();
    let mut script_line = 1;
    let mut cursor = 0;

    while let Some(start) = source[cursor..].find("<script") {
        let start = cursor + start;
        let Some(open_end) = source[start..].find('>') else {
            break;
        };
        let content_start = start + open_end + 1;
        let Some(close) = source[content_start..].find("</script>") else {
            break;
        };
        if script.is_empty() {
            script_line = source[..content_start].matches('\n').count() as u32 + 1;
        }
        append_with_line_padding(&mut script, &source[cursor..content_start]);
        script.push_str(&source[content_start..content_start + close]);
        cursor = content_start + close + "</script>".len();
    }

    cursor = 0;
    while let Some(start) = source[cursor..].find("<style") {
        let start = cursor + start;
        let Some(open_end) = source[start..].find('>') else {
            break;
        };
        let content_start = start + open_end + 1;
        let Some(close) = source[content_start..].find("</style>") else {
            break;
        };
        style.push_str(&source[content_start..content_start + close]);
        cursor = content_start + close + "</style>".len();
    }

    SfcParts {
        script,
        style,
        script_line,
    }
}

fn append_with_line_padding(target: &mut String, removed: &str) {
    target.push_str(&"\n".repeat(removed.matches('\n').count()));
}

#[cfg(test)]
mod tests {
    use super::extract_sfc_parts;

    #[test]
    fn extracts_script_and_style_blocks() {
        let source = "<template><div/></template>\n<script setup lang=\"ts\">\nconst x = ref(0)\n</script>\n<style>.a{color:red}</style>";
        let parts = extract_sfc_parts(source);
        assert!(parts.script.contains("ref(0)"));
        assert!(parts.style.contains("color:red"));
        assert_eq!(parts.script_line, 2);
    }
}
