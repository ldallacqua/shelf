import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { SideAppGroup } from '@/features/desktop/settings-links'
import { StartWithWindowsView } from '@/features/desktop/start-with-windows'
import { accountChanged, forgetAccount } from '@/features/owner/account'
import {
  PlatformSettings,
  PrivacySettings,
  ProfileSettings,
  SecuritySettings,
} from '@/features/owner/account-settings'

import { AppOnly, AppPageGhost } from './app-only'
import { AppearanceSettings } from './appearance'
import { Scope } from './scope'
import { SettingsFrame, SettingsHub, SettingsNav } from './settings-frame'

/**
 * Settings (issue 152): one area, a page each, grouped by whose the choices are. The account's
 * hold wherever I sign in; this device's, only in this browser; Shelf for Windows' own pages show
 * only in the app. A wide window lists the pages beside each one; a phone starts from the list.
 */

const ANA = { handle: 'ana', name: 'Ana', shelfPublic: true }
const signedIn = () => {
  accountChanged(ANA)
}
const signedOut = () => {
  forgetAccount()
}

const meta = {
  title: 'Features/Settings',
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj

/** Whose a setting is, beside its title. */
export const Scopes: Story = {
  render: () => (
    <div className="flex gap-6">
      <Scope of="account" />
      <Scope of="device" />
    </div>
  ),
}

/** The side list, on Profile. Shelf for Windows' group is drawn only in the app. */
export const SideList: Story = {
  render: () => (
    <div className="w-52">
      <SettingsNav current="profile" />
    </div>
  ),
}

/** The side list in Shelf for Windows, on one of its own pages. */
export const SideListInTheApp: Story = {
  render: () => (
    <div className="grid w-52 gap-6">
      <SettingsNav current="download-sources" />
      <SideAppGroup current="download-sources" />
    </div>
  ),
}

/** Every page, by whose it is: where a phone starts. */
export const EveryPage: Story = { render: () => <SettingsHub /> }

/** A page in its frame: the side list on a wide window, the way back on a phone. */
export const Frame: Story = {
  beforeEach: signedIn,
  render: () => (
    <SettingsFrame current="profile" title="Profile">
      <ProfileSettings />
    </SettingsFrame>
  ),
}

export const Profile: Story = { beforeEach: signedIn, render: () => <ProfileSettings /> }

/** Who can see the shelf is the account's; adult games are this device's. */
export const PrivacyAndContent: Story = {
  beforeEach: signedIn,
  render: () => <PrivacySettings />,
}

/** Its cards ask the server; here nothing answers, so they say so. */
export const Platforms: Story = { beforeEach: signedIn, render: () => <PlatformSettings /> }

/** Deleting the account comes last, in a box of its own. */
export const Security: Story = { beforeEach: signedIn, render: () => <SecuritySettings /> }

/** The account's pages, for nobody signed in. */
export const SignedOut: Story = { beforeEach: signedOut, render: () => <ProfileSettings /> }

/** This device's: whole for anyone. */
export const Appearance: Story = { render: () => <AppearanceSettings /> }

/** One of Shelf for Windows' pages, opened in a browser. */
export const AppPageInABrowser: Story = { render: () => <AppOnly page="app" /> }

export const AppPageOnItsWay: Story = { render: () => <AppPageGhost page="app" /> }

export const DownloadServicesOnTheirWay: Story = {
  render: () => <AppPageGhost page="download-services" />,
}

const startWithWindows = { onChange: () => undefined }

/** Asking the app. */
export const StartWithWindowsAsking: Story = {
  render: () => <StartWithWindowsView {...startWithWindows} state={undefined} />,
}

export const StartWithWindowsOn: Story = {
  render: () => (
    <StartWithWindowsView {...startWithWindows} state={{ available: true, on: true }} />
  ),
}

export const StartWithWindowsOff: Story = {
  render: () => (
    <StartWithWindowsView {...startWithWindows} state={{ available: true, on: false }} />
  ),
}

/** A development build never writes to the registry. */
export const StartWithWindowsUnavailable: Story = {
  render: () => (
    <StartWithWindowsView {...startWithWindows} state={{ available: false, on: false }} />
  ),
}

/** An app older than the command: the tray's menu still has it. */
export const StartWithWindowsOldApp: Story = {
  render: () => <StartWithWindowsView {...startWithWindows} state="old" />,
}

export const StartWithWindowsRefused: Story = {
  render: () => (
    <StartWithWindowsView {...startWithWindows} state={{ available: true, on: true }} failed />
  ),
}
