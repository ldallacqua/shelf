import { describe, expect, it } from 'vitest'

import { isPhone } from '@/server/device'

const from = (headers: Record<string, string>) => new Headers(headers)

const agents = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  androidPhone:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  firefoxPhone: 'Mozilla/5.0 (Android 14; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
}

describe('telling a phone from the request', () => {
  it('believes the header browsers built on Chromium send', () => {
    expect(isPhone(from({ 'sec-ch-ua-mobile': '?1', 'user-agent': agents.desktop }))).toBe(true)
    expect(isPhone(from({ 'sec-ch-ua-mobile': '?0', 'user-agent': agents.androidPhone }))).toBe(
      false,
    )
  })

  it('reads the user agent when there is no such header', () => {
    expect(isPhone(from({ 'user-agent': agents.iphone }))).toBe(true)
    expect(isPhone(from({ 'user-agent': agents.androidPhone }))).toBe(true)
    expect(isPhone(from({ 'user-agent': agents.firefoxPhone }))).toBe(true)
  })

  it('does not take a tablet or a desktop for a phone', () => {
    expect(isPhone(from({ 'user-agent': agents.ipad }))).toBe(false)
    expect(isPhone(from({ 'user-agent': agents.androidTablet }))).toBe(false)
    expect(isPhone(from({ 'user-agent': agents.desktop }))).toBe(false)
  })

  it('says no when the request says nothing', () => {
    expect(isPhone(from({}))).toBe(false)
  })
})
