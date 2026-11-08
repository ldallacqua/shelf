//! A notification when a game's saves need the person (ADR 008, section 7): a choice waiting, a backup
//! that failed, a place out of reach. Said after a session, when the window may be closed to the tray, so
//! in Windows' own notifications and Windows' language, as the tray's menu is. Nothing is said when all
//! went well. A click brings Shelf forward; the next Play of the game shows what is waiting.

use tauri::AppHandle;

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
            "Its saves were backed up on this computer only: the saves folder can’t be reached. They go there once it can."
        }
        (true, Needs::Waiting) => {
            "O backup dos saves ficou só neste computador: a pasta de saves não pode ser acessada. Ele vai para lá quando ela puder."
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

/// Shows it, headed by the game's title.
pub fn show(app: &AppHandle, title: &str, needs: Needs) {
    use tauri_plugin_notification::NotificationExt;
    let heading = if title.trim().is_empty() {
        "Shelf"
    } else {
        title
    };
    let shown = app
        .notification()
        .builder()
        .title(heading)
        .body(words(crate::language::portuguese(), needs))
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
}
