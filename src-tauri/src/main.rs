// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Note on trackpad pinch-zoom: confirmed not fixable in this stack. WebView2
    // consumes the precision-touchpad pinch via Windows DirectManipulation and
    // never dispatches it to page JS (a diagnostic showed zero wheel events on
    // pinch), and Wry/Tao expose no Windows magnify event to bridge it. We run
    // the webview at Edge defaults; canvas zoom is via Ctrl+scroll, the +/- keys,
    // and the on-canvas zoom control — all of which reach the page handler fine.
    palma_lib::run()
}
