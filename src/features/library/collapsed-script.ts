/**
 * Where the shelves folded away on this device are kept (`collapsed.ts`),
 * and the part of the head script that hides them before the first paint.
 * Apart from the hook, so the server can write the script.
 */

export const COLLAPSED_KEY = 'shelf:collapsed'

/** What a shelf key looks like: nothing that could break out of a style. */
const SHELF_KEY = /^[a-z0-9:-]+$/

/**
 * Hides each folded shelf's games until the page comes alive, wider than a
 * phone. It must stand alone and never throw: storage can be blocked.
 */
export const collapsedScript = (): string =>
  `try{var c=JSON.parse(localStorage.getItem(${JSON.stringify(COLLAPSED_KEY)})||"[]"),r="";` +
  `if(Array.isArray(c))c.forEach(function(k){if(typeof k=="string"&&${SHELF_KEY.toString()}.test(k))` +
  `r+='html:not([data-ready]) [data-shelf="'+k+'"] [data-shelf-body]{display:none}'});` +
  `if(r){var s=document.createElement("style");s.textContent="@media (min-width:40rem){"+r+"}";` +
  `document.head.appendChild(s)}}catch(e){}`
