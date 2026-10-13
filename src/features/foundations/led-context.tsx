'use client'

import { createContext, use, useState, type ReactNode } from 'react'

export const ledColors = [
  { key: 'violet', value: '#7c5cff' },
  { key: 'orange', value: '#ff7a3d' },
  { key: 'cyan', value: '#22c8ee' },
  { key: 'pink', value: '#f0409b' },
  { key: 'green', value: '#7ddc3c' },
] as const

export type LedKey = (typeof ledColors)[number]['key']

type LedState = { led: LedKey; setLed: (led: LedKey) => void }

const LedContext = createContext<LedState | null>(null)

/** Shares one LED color between the control that picks it and the shelves that show it. */
export function LedProvider({ children }: { children: ReactNode }) {
  const [led, setLed] = useState<LedKey>('violet')
  return <LedContext value={{ led, setLed }}>{children}</LedContext>
}

export function useLed(): LedState & { color: string } {
  const state = use(LedContext)
  if (!state) throw new Error('useLed must be used inside <LedProvider>')
  const color = ledColors.find((option) => option.key === state.led)?.value ?? ledColors[0].value
  return { ...state, color }
}
