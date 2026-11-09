//! A notification when a game's saves need the person (ADR 008, section 7): a choice waiting, a backup
//! that failed, a place out of reach. Said after a session, when the window may be closed to the tray, so
//! in Windows' own notifications and Windows' language, as the tray's menu is. Nothing is said when all
//! went well. A click brings Shelf forward; the next Play of the game shows what is waiting.

use tauri::AppHandle;

use super::cloud::Service;
use super::remote::Away;
use super::{Needs, Refusal};

/// What a notification says, after the game's title, which is its heading.
pub fn words(portuguese: bool, needs: Needs) -> &'static str {
    match (portuguese, needs) {
        (false, Needs::Choice) => {
            "Its saves differ between this computer and another. Shelf asks which to keep the next time you press Play."
        }
        (true, Needs::Choice) => {
            "Os saves diferem entre este computador e outro. O Shelf pergunta qual manter na próxima vez que você apertar Jogar."
        }
        (false, Needs::Waiting) => {
            "Its saves were backed up on this computer only: where your saves go can’t be reached. They go there once it can."
        }
        (true, Needs::Waiting) => {
            "O backup dos saves ficou só neste computador: o lugar dos seus saves não pode ser acessado. Ele vai para lá quando puder."
        }
        (false, Needs::SignedOut) => {
            "Its saves were backed up on this computer only: Shelf is signed out of where your saves go. Sign in again in Shelf’s Settings, under Saves."
        }
        (true, Needs::SignedOut) => {
            "O backup dos saves ficou só neste computador: o Shelf saiu da conta onde ficam seus saves. Entre de novo nas Configurações do Shelf, em Saves."
        }
        (false, Needs::Full) => {
            "Its saves were backed up on this computer only: where your saves go is full. They go there once it has room."
        }
        (true, Needs::Full) => {
            "O backup dos saves ficou só neste computador: o lugar dos seus saves está cheio. Ele vai para lá quando houver espaço."
        }
        (false, Needs::Failed(Refusal::Large)) => {
            "Its saves weren’t backed up: they’re larger than a snapshot may be. Raise the limit in Shelf’s Settings, under Saves."
        }
        (true, Needs::Failed(Refusal::Large)) => {
            "O backup dos saves não foi feito: eles passam do tamanho que um snapshot pode ter. Aumente o limite nas Configurações do Shelf, em Saves."
        }
        (false, Needs::Failed(_)) => {
            "Its saves weren’t backed up. Open Saves in Play’s menu on its page to try again."
        }
        (true, Needs::Failed(_)) => {
            "O backup dos saves não foi feito. Abra Saves no menu do Jogar, na página do jogo, para tentar de novo."
        }
    }
}

/// What a notification says when this PC's service needs the person, with no game in it (ADR 008, section
/// 8): its heading, and its words.
pub fn place_words(portuguese: bool, service: Service, away: Away) -> (String, &'static str) {
    let name = service.name();
    match (portuguese, away) {
        (false, Away::Full) => (
            format!("{name} is full"),
            "Saves stay on this computer until it has room, and your other computers won’t see what you play here meanwhile.",
        ),
        (true, Away::Full) => (
            format!("O {name} está cheio"),
            "Os saves ficam só neste computador até haver espaço nele, e enquanto isso seus outros computadores não veem o que você jogar aqui.",
        ),
        (false, _) => (
            format!("Shelf is signed out of {name}"),
            "Saves stay on this computer until you sign in again, in Shelf’s Settings under Saves, and your other computers won’t see what you play here meanwhile.",
        ),
        (true, _) => (
            format!("O Shelf saiu do {name}"),
            "Os saves ficam só neste computador até você entrar de novo, nas Configurações do Shelf, em Saves, e enquanto isso seus outros computadores não veem o que você jogar aqui.",
        ),
    }
}

/// Shows it, headed by the game's title.
pub fn show(app: &AppHandle, title: &str, needs: Needs) {
    let heading = if title.trim().is_empty() {
        "Shelf"
    } else {
        title
    };
    say(app, heading, words(crate::language::portuguese(), needs));
}

/// Shows what this PC's service needs (`place_words`).
pub fn place(app: &AppHandle, service: Service, away: Away) {
    let (heading, body) = place_words(crate::language::portuguese(), service, away);
    say(app, &heading, body);
}

fn say(app: &AppHandle, heading: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let shown = app
        .notification()
        .builder()
        .title(heading)
        .body(body)
        .show();
    if let Err(error) = shown {
        eprintln!("could not show a notification: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_need_is_said_in_both_languages_and_a_large_save_says_what_to_do() {
        for needs in [
            Needs::Choice,
            Needs::Waiting,
            Needs::SignedOut,
            Needs::Full,
            Needs::Failed(Refusal::Large),
            Needs::Failed(Refusal::Changed),
        ] {
            assert_ne!(words(false, needs), words(true, needs));
        }
        assert!(words(false, Needs::Failed(Refusal::Large)).contains("Settings"));
        assert!(words(true, Needs::Failed(Refusal::Large)).contains("Configurações"));
        assert_eq!(
            words(false, Needs::Failed(Refusal::Failed)),
            words(false, Needs::Failed(Refusal::Damaged))
        );
    }

    #[test]
    fn a_service_s_trouble_names_it_and_says_what_to_do_in_both_languages() {
        let (heading, body) = place_words(false, Service::GoogleDrive, Away::SignedOut);
        assert_eq!(heading, "Shelf is signed out of Google Drive");
        assert!(body.contains("sign in again"));
        let (heading, body) = place_words(true, Service::GoogleDrive, Away::SignedOut);
        assert_eq!(heading, "O Shelf saiu do Google Drive");
        assert!(body.contains("entrar de novo"));
        assert_eq!(
            place_words(true, Service::OneDrive, Away::Full).0,
            "O OneDrive está cheio"
        );
        assert_ne!(
            place_words(false, Service::OneDrive, Away::Full).1,
            place_words(false, Service::OneDrive, Away::SignedOut).1
        );
    }
}
