import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { imageScript } from './image-script'

/** An image as the browser would report it: on its way, or already here. */
const image = (state: {
  complete: boolean
  naturalWidth?: number
  decode?: () => Promise<void>
}) => {
  const element = document.createElement('img')
  Object.defineProperty(element, 'complete', { value: state.complete, configurable: true })
  Object.defineProperty(element, 'naturalWidth', { value: state.naturalWidth ?? 0 })
  Object.defineProperty(element, 'decode', { value: state.decode ?? (() => Promise.resolve()) })
  return element
}

const settled = () => new Promise((resolve) => setTimeout(resolve))

describe('every image fading in as it arrives (spec 14)', () => {
  beforeAll(() => {
    new Function(imageScript)()
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it('says it is at work, so that an image is held back only where something will let it go', () => {
    expect(document.documentElement).toHaveAttribute('data-images', 'fade')
  })

  it('leaves an image on its way alone', async () => {
    const coming = image({ complete: false })
    document.body.append(coming)
    await settled()
    expect(coming).not.toHaveAttribute('data-loaded')
  })

  it('lets it fade once it has arrived and been decoded, not before', async () => {
    let decoded = () => {}
    const coming = image({
      complete: false,
      decode: () => new Promise<void>((resolve) => (decoded = resolve)),
    })
    document.body.append(coming)
    coming.dispatchEvent(new Event('load'))
    await settled()
    expect(coming).not.toHaveAttribute('data-loaded')
    decoded()
    await settled()
    expect(coming).toHaveAttribute('data-loaded', '')
  })

  it('does not keep back one the browser could not decode', async () => {
    const coming = image({ complete: false, decode: () => Promise.reject(new Error('no')) })
    document.body.append(coming)
    coming.dispatchEvent(new Event('load'))
    await settled()
    expect(coming).toHaveAttribute('data-loaded', '')
  })

  it('lets one that failed go, so its alt text can be read', () => {
    const broken = image({ complete: false })
    document.body.append(broken)
    broken.dispatchEvent(new Event('error'))
    expect(broken).toHaveAttribute('data-loaded', '')
  })

  it('shows at once one the browser already has, however deep it joins the page', async () => {
    const known = image({ complete: true, naturalWidth: 300 })
    const row = document.createElement('div')
    row.append(known)
    document.body.append(row)
    await settled()
    expect(known).toHaveAttribute('data-loaded', 'at-once')
  })

  it('holds an image back again when it is given another file', async () => {
    const shown = image({ complete: false })
    shown.setAttribute('src', 'a.jpg')
    document.body.append(shown)
    shown.dispatchEvent(new Event('load'))
    await settled()
    expect(shown).toHaveAttribute('data-loaded', '')
    shown.setAttribute('src', 'b.jpg')
    await settled()
    expect(shown).not.toHaveAttribute('data-loaded')
  })

  it('does not start over when the same file is set again, as React does on mounting', async () => {
    const shown = image({ complete: false })
    shown.setAttribute('src', 'a.jpg')
    document.body.append(shown)
    shown.dispatchEvent(new Event('load'))
    await settled()
    shown.setAttribute('src', 'a.jpg')
    await settled()
    expect(shown).toHaveAttribute('data-loaded', '')
  })
})
