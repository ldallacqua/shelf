//! Reading a source through a window the person can see (ADR 007, decision 9), for an address that only
//! answers a browser. It is a browser, with the person in front of it, who answers whatever the address asks:
//! the app doesn't answer for them, keep it out of sight, or take what it was given to use elsewhere. So it
//! opens only when they have just asked for a reading. Once the address shows a file, the page hands it over.
//! That is all a page in this window may do, and what it hands over is read as any other source.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tokio::sync::oneshot;

use crate::sources::{self, MOST_BYTES, Refusal};

pub const LABEL: &str = "source-reader";

/// How long a window waits for the person before it gives up.
const MOST_WAITING: Duration = Duration::from_secs(5 * 60);

/// Run in the window's pages: a web page may be the address asking something, which is the person's to
/// answer, and anything else is the file. Plain text and JSON are shown in a `pre` that holds them exactly.
const HAND_OVER: &str = r#"
if (window === window.top) {
  addEventListener('load', () => {
    if ((document.contentType || '').includes('html')) return
    const text = document.querySelector('pre')?.textContent ?? document.body?.innerText ?? ''
    window.__TAURI_INTERNALS__.invoke('deliver_source', { text })
  })
}
"#;

/// How a window ended.
#[derive(Debug, PartialEq, Eq)]
enum Ended {
    Delivered(String),
    Closed,
}

/// How far along Read all is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct ReadingAll {
    pub done: usize,
    pub total: usize,
}

#[derive(Default)]
pub struct SourceWindow {
    /// One window at a time, as there is one label.
    turn: tokio::sync::Mutex<()>,
    waiting: Mutex<Option<oneshot::Sender<Ended>>>,
    pub reading_all: Mutex<Option<ReadingAll>>,
}

impl SourceWindow {
    /// What a page handed over, for the reading that is waiting. Nothing waiting, it goes nowhere.
    pub fn deliver(&self, text: String) {
        self.end(Ended::Delivered(text));
    }

    fn end(&self, ended: Ended) {
        if let Some(waiting) = self.waiting.lock().unwrap().take() {
            let _ = waiting.send(ended);
        }
    }

    /// Opens the address in a window, and waits until it shows a file or the person closes it.
    pub async fn read(&self, app: &AppHandle, url: &Url, title: &str) -> Result<Vec<u8>, Refusal> {
        if !sources::allowed(url) {
            return Err(Refusal::Invalid);
        }
        let _turn = self.turn.lock().await;
        let (sender, answer) = oneshot::channel();
        *self.waiting.lock().unwrap() = Some(sender);
        let window = match open(app, url, title) {
            Ok(window) => window,
            Err(error) => {
                eprintln!("could not open a window for a source: {error}");
                self.waiting.lock().unwrap().take();
                return Err(Refusal::Failed);
            }
        };
        let closing = app.clone();
        window.on_window_event(move |event| {
            if matches!(event, WindowEvent::Destroyed) {
                closing.state::<SourceWindow>().end(Ended::Closed);
            }
        });
        let _ = window.set_focus();
        let ended = tokio::time::timeout(MOST_WAITING, answer).await;
        self.waiting.lock().unwrap().take();
        let _ = window.close();
        match ended {
            Ok(Ok(Ended::Delivered(text))) if text.len() as u64 > MOST_BYTES => Err(Refusal::Large),
            Ok(Ok(Ended::Delivered(text))) => Ok(text.into_bytes()),
            _ => Err(Refusal::Closed),
        }
    }
}

fn open(app: &AppHandle, url: &Url, title: &str) -> tauri::Result<tauri::WebviewWindow> {
    let mut window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(url.clone()))
        .title(title)
        .inner_size(760.0, 600.0)
        .center()
        .initialization_script(HAND_OVER)
        // Only where a source may be read from, and what a page may draw in itself.
        .on_navigation(|to| sources::allowed(to) || matches!(to.scheme(), "about" | "blob"))
        .on_new_window(|_, _| NewWindowResponse::Deny);
    if let Some(dir) = crate::data_dir() {
        window = window.data_directory(dir);
    }
    window.build()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn waiting(window: &SourceWindow) -> oneshot::Receiver<Ended> {
        let (sender, answer) = oneshot::channel();
        *window.waiting.lock().unwrap() = Some(sender);
        answer
    }

    #[test]
    fn what_a_page_hands_over_reaches_the_reading_waiting_for_it() {
        let window = SourceWindow::default();
        let answer = waiting(&window);
        window.deliver("the list".into());
        assert_eq!(
            tauri::async_runtime::block_on(answer),
            Ok(Ended::Delivered("the list".into()))
        );
    }

    #[test]
    fn with_no_reading_waiting_it_goes_nowhere() {
        let window = SourceWindow::default();
        window.deliver("the list".into());
        assert!(window.waiting.lock().unwrap().is_none());
    }

    #[test]
    fn only_the_first_end_counts() {
        let window = SourceWindow::default();
        let answer = waiting(&window);
        window.end(Ended::Closed);
        window.deliver("too late".into());
        assert_eq!(tauri::async_runtime::block_on(answer), Ok(Ended::Closed));
    }
}
