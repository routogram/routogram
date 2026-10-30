#[derive(Debug, Clone)]
pub struct ExtractedSfc {
    pub script_source: String,
    pub is_ts: bool,
}

/// Extract the TypeScript/JavaScript portion of a Vue, Svelte, or Astro file
/// while preserving newline offsets for AST error locations.
pub fn extract_sfc_script(raw_source: &str, ext: &str) -> ExtractedSfc {
    if ext == "astro" {
        if let Some(rest) = raw_source.strip_prefix("---") {
            if let Some(end_idx) = rest.find("\n---") {
                let frontmatter = &rest[..end_idx];
                return ExtractedSfc {
                    script_source: format!("\n{frontmatter}"),
                    is_ts: true,
                };
            }
        }
    }

    let mut output = String::with_capacity(raw_source.len());
    let mut is_ts = false;
    let mut cursor = 0;
    let bytes = raw_source.as_bytes();

    while cursor < raw_source.len() {
        if let Some(open_rel) = raw_source[cursor..].find("<script") {
            let open_start = cursor + open_rel;
            for &byte in &bytes[cursor..open_start] {
                if byte == b'\n' {
                    output.push('\n');
                }
            }
            if let Some(tag_close_rel) = raw_source[open_start..].find('>') {
                let tag_end = open_start + tag_close_rel + 1;
                let tag_header = &raw_source[open_start..tag_end];
                if tag_header.contains("lang=\"ts\"") || tag_header.contains("lang='ts'") {
                    is_ts = true;
                }
                for &byte in &bytes[open_start..tag_end] {
                    if byte == b'\n' {
                        output.push('\n');
                    }
                }
                if let Some(close_rel) = raw_source[tag_end..].find("</script>") {
                    let script_end = tag_end + close_rel;
                    output.push_str(&raw_source[tag_end..script_end]);
                    cursor = script_end + "</script>".len();
                    continue;
                }
            }
        }
        for &byte in &bytes[cursor..] {
            if byte == b'\n' {
                output.push('\n');
            }
        }
        break;
    }

    ExtractedSfc {
        script_source: output,
        is_ts,
    }
}
