use base64::Engine;
use std::fs;
use std::path::Path;

// Create a project's folder scaffold on disk: <project>/assets and
// <project>/assets/frames. Called when a project with a folder is created.
#[tauri::command]
fn ensure_project(dir: String) -> Result<(), String> {
    for sub in ["assets", "assets/frames"] {
        fs::create_dir_all(Path::new(&dir).join(sub)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Decode a base64 payload and write it into the project's folder at `rel`,
// creating parent directories as needed. Returns the absolute path written so
// the frontend can reference the real file. This is what makes "export to
// project" put actual files on disk under the desktop build.
#[tauri::command]
fn save_asset(dir: String, rel: String, b64: String) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.as_bytes())
        .map_err(|e| e.to_string())?;
    let full = Path::new(&dir).join(&rel);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&full, &bytes).map_err(|e| e.to_string())?;
    Ok(full.to_string_lossy().to_string())
}

// Mirror a project's session JSON into its own folder as palma.json. This is
// the durable on-disk copy of the project (the localStorage copy stays as a
// fast working cache). Written through on every save.
#[tauri::command]
fn save_session(dir: String, json: String) -> Result<String, String> {
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let full = Path::new(&dir).join("palma.json");
    fs::write(&full, json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(full.to_string_lossy().to_string())
}

// Read a project's session JSON back from <dir>/palma.json. Returns None when
// the file doesn't exist yet (a brand-new project). The on-disk copy is the
// source of truth when opening a project.
#[tauri::command]
fn read_session(dir: String) -> Result<Option<String>, String> {
    let full = Path::new(&dir).join("palma.json");
    match fs::read_to_string(&full) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

// Project discovery: find palma.json files in `root` itself and one level of
// subfolders, returning each project's JSON. Lets the dashboard repopulate from
// disk on a fresh machine (localStorage holds only summaries otherwise).
#[tauri::command]
fn scan_projects(root: String) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    let base = Path::new(&root);
    let mut take = |p: &Path| {
        let f = p.join("palma.json");
        if f.is_file() {
            if let Ok(s) = fs::read_to_string(&f) {
                out.push(s);
            }
        }
    };
    take(base);
    if let Ok(entries) = fs::read_dir(base) {
        for e in entries.flatten() {
            let path = e.path();
            if path.is_dir() {
                take(&path);
            }
        }
    }
    Ok(out)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            // Pinch-zoom: we intentionally DON'T touch WebView2's zoom settings
            // anymore. WebView2 is the Edge engine, and the user confirmed pinch
            // zooms the canvas correctly in Edge on this exact machine/touchpad —
            // i.e. Edge forwards the trackpad pinch to the page as a cancelable
            // ctrl+wheel event, which useCanvas preventDefaults + turns into
            // canvas zoom. Forcing IsPinchZoomEnabled / IsZoomControlEnabled off
            // was suppressing that forwarding (and the post-set Reload() blanked
            // the window). Running at Edge defaults is what matches the browser.
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ensure_project,
            save_asset,
            save_session,
            read_session,
            scan_projects
        ])
        .run(tauri::generate_context!())
        .expect("error while running Palma");
}
