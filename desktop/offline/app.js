// Asks the app to open Shelf. The app answers with Shelf's address once its
// server takes a connection; this page then gives the window to it, without
// leaving itself in the history, so Back never comes here.
const words = navigator.language.toLowerCase().startsWith('pt')
  ? {
      lang: 'pt-BR',
      opening: 'Abrindo o Shelf…',
      title: 'Não foi possível abrir o Shelf',
      why: 'Confira a conexão com a internet e tente de novo.',
      again: 'Tentar de novo',
      minimize: 'Minimizar',
      close: 'Fechar',
    }
  : {
      lang: 'en',
      opening: 'Opening Shelf…',
      title: "Shelf can't be reached",
      why: 'Check the internet connection, then try again.',
      again: 'Try again',
      minimize: 'Minimize',
      close: 'Close',
    }

const opening = document.getElementById('opening')
const unreachable = document.getElementById('unreachable')
const again = document.getElementById('again')

document.documentElement.lang = words.lang
opening.textContent = words.opening
document.getElementById('title').textContent = words.title
document.getElementById('why').textContent = words.why
again.textContent = words.again
document.getElementById('minimize').setAttribute('aria-label', words.minimize)
document.getElementById('close').setAttribute('aria-label', words.close)

const invoke = window.__TAURI__.core.invoke
document
  .getElementById('minimize')
  .addEventListener('click', () => invoke('plugin:window|minimize'))
document.getElementById('close').addEventListener('click', () => invoke('plugin:window|close'))

async function open() {
  again.disabled = true
  try {
    const address = await invoke('open_shelf')
    window.location.replace(address)
  } catch {
    opening.hidden = true
    unreachable.hidden = false
    again.disabled = false
    again.focus()
  }
}

again.addEventListener('click', open)
open()
