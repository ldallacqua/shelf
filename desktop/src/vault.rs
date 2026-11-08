//! Where a sign-in is kept (Real-Debrid's, and a cloud's for saves): Windows' Credential Manager, under a
//! name of its own, or in a development build run with a profile of its own, a file there, so
//! `pnpm desktop:check` never touches the real one. What is kept never reaches a page.

/// A sign-in's text, kept and given back.
pub trait Vault: Send + Sync {
    fn load(&self) -> Option<String>;
    fn save(&self, text: &str) -> bool;
    fn clear(&self);
}

/// Windows' Credential Manager, the entry named `name` of the app's.
#[cfg(windows)]
pub struct CredentialManager(pub &'static str);

#[cfg(windows)]
impl CredentialManager {
    fn entry(&self) -> Option<keyring::Entry> {
        keyring::Entry::new("com.ldallacqua.shelf", self.0).ok()
    }
}

#[cfg(windows)]
impl Vault for CredentialManager {
    fn load(&self) -> Option<String> {
        self.entry()?.get_password().ok()
    }
    fn save(&self, text: &str) -> bool {
        self.entry()
            .is_some_and(|entry| entry.set_password(text).is_ok())
    }
    fn clear(&self) {
        if let Some(entry) = self.entry() {
            let _ = entry.delete_credential();
        }
    }
}

/// A file in a development build's own profile.
#[cfg(debug_assertions)]
pub struct FileVault(pub std::path::PathBuf);

#[cfg(debug_assertions)]
impl Vault for FileVault {
    fn load(&self) -> Option<String> {
        std::fs::read_to_string(&self.0).ok()
    }
    fn save(&self, text: &str) -> bool {
        std::fs::write(&self.0, text).is_ok()
    }
    fn clear(&self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// Nothing kept: what a test starts with.
#[cfg(test)]
#[derive(Default)]
pub struct Memory(pub std::sync::Mutex<Option<String>>);

#[cfg(test)]
impl Vault for std::sync::Arc<Memory> {
    fn load(&self) -> Option<String> {
        self.0.lock().unwrap().clone()
    }
    fn save(&self, text: &str) -> bool {
        *self.0.lock().unwrap() = Some(text.to_string());
        true
    }
    fn clear(&self) {
        *self.0.lock().unwrap() = None;
    }
}
