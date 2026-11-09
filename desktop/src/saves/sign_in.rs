//! Signing in to a service of mine for saves (ADR 008, phase 5), as an app on a computer should (RFC 8252):
//! the service's own page, in the default browser, with PKCE, coming back to an address on this computer
//! that listens for that one answer. Shelf never sees a password, and no page sees what the sign-in gives.

use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Notify, mpsc};

/// How long the browser has to come back.
pub const WAITS_FOR: Duration = Duration::from_secs(10 * 60);

/// Why a sign-in ended without one.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Ended {
    /// This build has no registration with the service.
    Unavailable,
    /// The person said no on the service's page, or Cancel here, or it took too long.
    Cancelled,
    /// The service refused, or answered what can't be read.
    Refused,
    /// The service no longer takes what it gave (OAuth's `invalid_grant`): the sign-in was ended there, or
    /// ran out. The only refusal that means signing in again.
    Expired,
    /// No connection to the service.
    Unreachable,
}

/// Random text for PKCE's verifier and the state: 32 bytes, from two version 4 UUIDs' randomness.
pub fn random() -> String {
    let mut bytes = Vec::with_capacity(32);
    bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    URL_SAFE_NO_PAD.encode(bytes)
}

/// PKCE's challenge for a verifier (S256).
pub fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// Where the browser comes back to: a port on this computer, on IPv4 and, for `localhost`, on IPv6 too, as
/// a browser may try either.
pub struct Listening {
    listeners: Vec<TcpListener>,
    pub port: u16,
}

pub async fn listen(host: &str) -> std::io::Result<Listening> {
    let first = TcpListener::bind("127.0.0.1:0").await?;
    let port = first.local_addr()?.port();
    let mut listeners = vec![first];
    if host == "localhost"
        && let Ok(six) = TcpListener::bind(("::1", port)).await
    {
        listeners.push(six);
    }
    Ok(Listening { listeners, port })
}

/// What came back to the address: the code, once the state is the one sent.
#[derive(Debug, PartialEq, Eq)]
pub enum Came {
    Code(String),
    Refused,
    /// Something else asked: a browser's icon, or a state not ours.
    Other,
}

/// Reads what a request's first line says.
pub fn came(line: &str, state: &str) -> Came {
    let Some(target) = line.split_whitespace().nth(1) else {
        return Came::Other;
    };
    let Ok(url) = url::Url::parse(&format!("http://localhost{target}")) else {
        return Came::Other;
    };
    let mut code = None;
    let mut error = false;
    let mut ours = false;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "error" => error = true,
            "state" => ours = value == state,
            _ => {}
        }
    }
    match (ours, code, error) {
        (true, Some(code), false) => Came::Code(code),
        (true, _, true) => Came::Refused,
        _ => Came::Other,
    }
}

/// The page the browser shows once it is back, in Windows' language.
fn page(signed_in: bool) -> String {
    let portuguese = crate::language::portuguese();
    let (title, body) = match (signed_in, portuguese) {
        (true, false) => ("Signed in", "You can close this tab and go back to Shelf."),
        (true, true) => ("Pronto", "Você pode fechar esta aba e voltar para o Shelf."),
        (false, false) => (
            "Not signed in",
            "Nothing was changed. You can close this tab and go back to Shelf.",
        ),
        (false, true) => (
            "Nada feito",
            "Nada mudou. Você pode fechar esta aba e voltar para o Shelf.",
        ),
    };
    format!(
        "<!doctype html><html lang=\"{}\"><meta charset=\"utf-8\"><title>Shelf</title>\
         <style>body{{font:16px system-ui,sans-serif;margin:15vh auto;max-width:28rem;padding:0 1rem;\
         color:#e8e6f0;background:#14131a}}h1{{font-size:1.5rem}}</style>\
         <h1>{title}</h1><p>{body}</p></html>",
        if portuguese { "pt-BR" } else { "en" }
    )
}

async fn answer(stream: &mut TcpStream, status: &str, body: &str) {
    let text = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\
         Cache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(text.as_bytes()).await;
    let _ = stream.shutdown().await;
}

/// Waits for the browser to come back with the code, Cancel, or the time to run out.
pub async fn wait(listening: Listening, state: &str, cancel: Arc<Notify>) -> Result<String, Ended> {
    let (sender, mut streams) = mpsc::channel::<TcpStream>(8);
    let mut accepting = Vec::new();
    for listener in listening.listeners {
        let sender = sender.clone();
        accepting.push(tokio::spawn(async move {
            while let Ok((stream, _)) = listener.accept().await {
                if sender.send(stream).await.is_err() {
                    return;
                }
            }
        }));
    }
    drop(sender);
    let deadline = tokio::time::sleep(WAITS_FOR);
    tokio::pin!(deadline);
    let result = loop {
        let mut stream = tokio::select! {
            stream = streams.recv() => match stream {
                Some(stream) => stream,
                None => break Err(Ended::Cancelled),
            },
            () = cancel.notified() => break Err(Ended::Cancelled),
            () = &mut deadline => break Err(Ended::Cancelled),
        };
        let mut head = vec![0u8; 8 * 1024];
        let read = tokio::time::timeout(Duration::from_secs(10), stream.read(&mut head)).await;
        let Ok(Ok(size)) = read else {
            continue;
        };
        let text = String::from_utf8_lossy(&head[..size]);
        match came(text.lines().next().unwrap_or(""), state) {
            Came::Code(code) => {
                answer(&mut stream, "200 OK", &page(true)).await;
                break Ok(code);
            }
            Came::Refused => {
                answer(&mut stream, "200 OK", &page(false)).await;
                break Err(Ended::Cancelled);
            }
            Came::Other => answer(&mut stream, "404 Not Found", "").await,
        }
    };
    for task in accepting {
        task.abort();
    }
    result
}

/// What a service's token address answers.
#[derive(Deserialize)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
    pub id_token: Option<String>,
}

/// Asks the token address, with a form. A grant it no longer takes is `Expired`, any other refusal
/// `Refused`; no answer, `Unreachable`.
pub async fn tokens(
    client: &reqwest::Client,
    address: &str,
    form: &[(&str, &str)],
) -> Result<Tokens, Ended> {
    let body = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(form)
        .finish();
    let answer = client
        .post(address)
        .header(
            reqwest::header::CONTENT_TYPE,
            "application/x-www-form-urlencoded",
        )
        .body(body)
        .send()
        .await
        .map_err(|_| Ended::Unreachable)?;
    let status = answer.status();
    let bytes = answer.bytes().await.map_err(|_| Ended::Unreachable)?;
    if status.is_server_error() {
        return Err(Ended::Unreachable);
    }
    if !status.is_success() {
        #[derive(Deserialize)]
        struct Said {
            error: String,
        }
        // RFC 6749, section 5.2: what was given is no longer good.
        let expired =
            serde_json::from_slice::<Said>(&bytes).is_ok_and(|said| said.error == "invalid_grant");
        return Err(if expired {
            Ended::Expired
        } else {
            Ended::Refused
        });
    }
    serde_json::from_slice(&bytes).map_err(|_| Ended::Refused)
}

/// The account an ID token names, for Settings to show: its email, or the name it signs in with. The
/// token came straight from the service over TLS, so its signature isn't checked: nothing is decided by it.
pub fn account_of(id_token: &str) -> Option<String> {
    #[derive(Deserialize)]
    struct Claims {
        email: Option<String>,
        preferred_username: Option<String>,
    }
    let payload = id_token.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).ok()?;
    let claims: Claims = serde_json::from_slice(&bytes).ok()?;
    claims
        .email
        .or(claims.preferred_username)
        .map(|name| name.chars().take(200).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_s_challenge_is_the_verifier_s_hash() {
        // RFC 7636, appendix B.
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        let verifier = random();
        assert_eq!(verifier.len(), 43);
        assert_ne!(verifier, random());
    }

    #[test]
    fn only_the_answer_with_our_state_counts() {
        assert_eq!(
            came("GET /?code=abc&state=s1 HTTP/1.1", "s1"),
            Came::Code("abc".into())
        );
        assert_eq!(came("GET /?code=abc&state=s2 HTTP/1.1", "s1"), Came::Other);
        assert_eq!(
            came("GET /?error=access_denied&state=s1 HTTP/1.1", "s1"),
            Came::Refused
        );
        assert_eq!(came("GET /favicon.ico HTTP/1.1", "s1"), Came::Other);
        assert_eq!(came("", "s1"), Came::Other);
    }

    #[test]
    fn an_id_token_names_the_account() {
        let claims = URL_SAFE_NO_PAD.encode(br#"{"email":"someone@example.com","sub":"1"}"#);
        assert_eq!(
            account_of(&format!("header.{claims}.signature")).as_deref(),
            Some("someone@example.com")
        );
        let microsoft = URL_SAFE_NO_PAD.encode(br#"{"preferred_username":"someone@outlook.com"}"#);
        assert_eq!(
            account_of(&format!("h.{microsoft}.s")).as_deref(),
            Some("someone@outlook.com")
        );
        assert_eq!(account_of("not a token"), None);
    }

    #[test]
    fn the_browser_comes_back_with_the_code_and_is_told_it_can_close() {
        tauri::async_runtime::block_on(async {
            let listening = listen("localhost").await.unwrap();
            let port = listening.port;
            let cancel = Arc::new(Notify::new());
            let waiting = tokio::spawn(async move { wait(listening, "s1", cancel).await });
            // A browser asking for an icon first, then coming back.
            for target in ["/favicon.ico", "/?code=made-up-code&state=s1"] {
                let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
                stream
                    .write_all(
                        format!("GET {target} HTTP/1.1\r\nHost: localhost\r\n\r\n").as_bytes(),
                    )
                    .await
                    .unwrap();
                let mut said = String::new();
                stream.read_to_string(&mut said).await.unwrap();
                if target.contains("code") {
                    assert!(said.starts_with("HTTP/1.1 200"));
                    assert!(said.contains("Shelf"));
                } else {
                    assert!(said.starts_with("HTTP/1.1 404"));
                }
            }
            assert_eq!(waiting.await.unwrap(), Ok("made-up-code".into()));
        });
    }

    #[test]
    fn cancel_ends_the_wait() {
        tauri::async_runtime::block_on(async {
            let listening = listen("127.0.0.1").await.unwrap();
            let cancel = Arc::new(Notify::new());
            let waiting = tokio::spawn(wait(listening, "s1", cancel.clone()));
            cancel.notify_one();
            assert_eq!(waiting.await.unwrap(), Err(Ended::Cancelled));
        });
    }
}
