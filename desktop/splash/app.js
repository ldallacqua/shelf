// The splash: asks the app to start, and shows each step it reports. The app
// looks for an update and installs one (then the app starts again, new), or
// opens Shelf in its main window and closes this one once Shelf is there. If
// Shelf cannot be reached, this says so, with Try again and Close.
const words = navigator.language.toLowerCase().startsWith('pt')
  ? {
      lang: 'pt-BR',
      checking: 'Procurando atualizações',
      downloading: 'Baixando a atualização',
      installing: 'Instalando a atualização',
      opening: 'Abrindo o Shelf',
      title: 'Não foi possível abrir o Shelf',
      why: 'Confira a conexão com a internet e tente de novo.',
      again: 'Tentar de novo',
      close: 'Fechar',
    }
  : {
      lang: 'en',
      checking: 'Checking for updates',
      downloading: 'Downloading the update',
      installing: 'Installing the update',
      opening: 'Opening Shelf',
      title: "Shelf can't be reached",
      why: 'Check the internet connection, then try again.',
      again: 'Try again',
      close: 'Close',
    }

const { invoke, Channel } = window.__TAURI__.core
const working = document.getElementById('working')
const status = document.getElementById('status')
const bar = document.getElementById('bar')
const fill = document.getElementById('fill')
const unreachable = document.getElementById('unreachable')
const again = document.getElementById('again')

document.documentElement.lang = words.lang
document.getElementById('title').textContent = words.title
document.getElementById('why').textContent = words.why
again.textContent = words.again
document.getElementById('close').textContent = words.close
document.getElementById('close').addEventListener('click', () => invoke('plugin:window|close'))

/** A step the app reports: checking, downloading (done of total bytes), installing, opening. */
function show(step) {
  if (step.step === 'downloading' && step.total) {
    const share = Math.min(100, Math.round((step.done / step.total) * 100))
    status.textContent = `${words.downloading} · ${share}%`
    bar.removeAttribute('data-waiting')
    fill.style.width = `${share}%`
    return
  }
  status.textContent = words[step.step] ?? words.opening
  bar.setAttribute('data-waiting', '')
  fill.style.width = ''
}

async function start() {
  again.disabled = true
  unreachable.hidden = true
  working.hidden = false
  show({ step: 'opening' })
  const steps = new Channel()
  steps.onmessage = show
  try {
    // Answers once Shelf is in the main window, which then closes this one.
    await invoke('start', { onStep: steps })
  } catch {
    working.hidden = true
    unreachable.hidden = false
    again.disabled = false
    again.focus()
  }
}

again.addEventListener('click', start)
start()
