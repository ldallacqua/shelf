import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import type { SavePlace } from './saves'
import { SaveCapsView, SavePlaceView } from './save-settings'

/**
 * The limits on every game's snapshots, in Settings (ADR 008, section 4): two numbers, as Steam's and
 * Ludusavi's settings are, each with what it means under it.
 */
const meta = {
  title: 'Features/Desktop/SaveSettings',
  component: SaveCapsView,
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-6">
        <Story />
      </div>
    ),
  ],
  args: { caps: { mostMb: 500, kept: 20 }, onChange: () => undefined },
} satisfies Meta<typeof SaveCapsView>

export default meta
type Story = StoryObj<typeof meta>

export const Limits: Story = {}

export const Saved: Story = { args: { said: { tone: 'done', text: 'Saved.' } } }

export const Failed: Story = {
  args: { said: { tone: 'trouble', text: 'The limit couldn’t be saved. Try again.' } },
}

export const AskingTheApp: Story = { args: { caps: undefined } }

/** An app older than saves. */
export const Old: Story = { args: { caps: 'old' } }

/** Where the snapshots go, the section above the limits. */
const place = (over: Partial<SavePlace> = {}): SavePlace => ({
  folder: null,
  reachable: true,
  cloud: null,
  away: null,
  services: [],
  ...over,
})

/** OneDrive and Google Drive, as a build registered with both offers them, neither signed in. */
const services: SavePlace['services'] = [
  { service: 'onedrive', account: null, signingIn: false },
  { service: 'google-drive', account: null, signingIn: false },
]

export const PlaceHere: StoryObj<typeof SavePlaceView> = {
  render: (args) => <SavePlaceView {...args} />,
  args: {
    place: place(),
    onChoose: () => undefined,
    onForget: () => undefined,
    onSignIn: () => undefined,
    onUseCloud: () => undefined,
    onSignOut: () => undefined,
    onCancelSignIn: () => undefined,
  },
}

export const PlaceChosen: StoryObj<typeof SavePlaceView> = {
  ...PlaceHere,
  args: {
    ...PlaceHere.args,
    place: place({ folder: 'D:\\OneDrive\\Shelf saves' }),
    said: {
      tone: 'done',
      text: 'Backups go there now. Those made on this computer were copied there too.',
    },
  },
}

export const PlaceAway: StoryObj<typeof SavePlaceView> = {
  ...PlaceHere,
  args: {
    ...PlaceHere.args,
    place: place({ folder: 'E:\\Shelf saves', reachable: false, away: 'unreachable' }),
  },
}

/**
 * A build registered with OneDrive and Google Drive: each is a place of its own, signed in on the
 * service's page, as Windows' settings list accounts with what each can do.
 */
export const Services: StoryObj<typeof SavePlaceView> = {
  ...PlaceHere,
  args: { ...PlaceHere.args, place: place({ services }) },
}

/** The service's page is open in the browser: Shelf waits, and Cancel stops waiting. */
export const SigningIn: StoryObj<typeof SavePlaceView> = {
  ...PlaceHere,
  args: {
    ...PlaceHere.args,
    busy: true,
    signingIn: 'onedrive',
    place: place({ services }),
  },
}

/** OneDrive in use; Google Drive signed in too, and offered. */
export const InOneDrive: StoryObj<typeof SavePlaceView> = {
  ...PlaceHere,
  args: {
    ...PlaceHere.args,
    place: place({
      cloud: 'onedrive',
      services: [
        { service: 'onedrive', account: 'someone@example.com', signingIn: false },
        { service: 'google-drive', account: 'someone@example.com', signingIn: false },
      ],
    }),
    said: {
      tone: 'done',
      text: 'Signed in. Backups go to OneDrive now, and those made on this computer follow.',
    },
  },
}

/** Google Drive took the sign-in back: snapshots wait here until it is done again. */
export const SignedOut: StoryObj<typeof SavePlaceView> = {
  ...PlaceHere,
  args: {
    ...PlaceHere.args,
    place: place({
      cloud: 'google-drive',
      reachable: false,
      away: 'signed-out',
      services: [
        { service: 'onedrive', account: null, signingIn: false },
        { service: 'google-drive', account: 'someone@example.com', signingIn: false },
      ],
    }),
  },
}
