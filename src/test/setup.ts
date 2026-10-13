import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { setDevice } from './device'

/**
 * jsdom leaves out a few browser features that Radix and the theme module
 * use. These stand-ins are enough for component tests; real browsers are
 * covered by the Playwright tests.
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => {}
Element.prototype.releasePointerCapture = () => {}

setDevice({ dark: false, reducedMotion: false })

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  for (const name of [...document.documentElement.attributes].map((attribute) => attribute.name)) {
    if (name.startsWith('data-')) document.documentElement.removeAttribute(name)
  }
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove())
  setDevice({ dark: false, reducedMotion: false })
})
