#[cfg(not(target_arch = "wasm32"))]
#[tokio::main]
async fn main() {
    let mut root = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let mut index = 0;
    while index < args.len() {
        if args[index] == "--root" {
            if let Some(value) = args.get(index + 1) {
                root = std::path::PathBuf::from(value);
            }
            index += 1;
        }
        index += 1;
    }
    if let Err(error) = routogram_core::lsp::run_stdio(root).await {
        eprintln!("routogram-lsp: {error}");
        std::process::exit(1);
    }
}

#[cfg(target_arch = "wasm32")]
fn main() {}
