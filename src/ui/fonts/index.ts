import { Archivo, Martian_Mono } from 'next/font/google'
import localFont from 'next/font/local'

/**
 * Three small font files, downloaded or bundled at build time and served from
 * our own domain. Each exposes a CSS variable that the Tailwind theme reads.
 * Together they are well under half the size of Archivo with its full width
 * axis, which is what the page would otherwise wait for.
 */

// The interface: Archivo at its normal width, every weight.
export const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
})

// Titles: Archivo cut to one wide, heavy style. See README.md in this folder.
export const archivoTitle = localFont({
  src: './archivo-title.woff2',
  weight: '800',
  style: 'normal',
  variable: '--font-archivo-title',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

// Numbers, counts and small labels: one weight.
export const martianMono = Martian_Mono({
  subsets: ['latin'],
  weight: '500',
  variable: '--font-martian-mono',
  display: 'swap',
})

export const fontVariables = `${archivo.variable} ${archivoTitle.variable} ${martianMono.variable}`
