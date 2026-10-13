import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Eyebrow, Page } from '@/features/shell/page'
import { ThemePicker } from '@/features/theme/theme-picker'

import { blankCases } from './blank-cases'
import { ColorRoles } from './color-roles'
import { ControlsDemo } from './controls-demo'
import { DemoShelf } from './demo-shelf'
import { LedProvider } from './led-context'
import { LedPicker } from './led-picker'
import { LightScenes } from './light-scenes'
import { MotionDemo } from './motion-demo'
import { TypeSpecimen } from './type-specimen'

// Where the build stands. This page is replaced by the landing page at step 8.
const BUILD_STEP = 1
const BUILD_STEPS = 10

function Section({
  id,
  title,
  body,
  aside,
  children,
}: {
  id: string
  title: string
  body: string
  /** Extra content under the description, for example a control. */
  aside?: ReactNode
  children: ReactNode
}) {
  const headingId = `${id}-title`
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-x-12 gap-y-8 border-t border-line/70 py-12 sm:py-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,9fr)]"
    >
      <div>
        <h2 id={headingId} className="title text-2xl sm:text-3xl">
          {title}
        </h2>
        <p className="mt-4 max-w-[46ch] text-pretty text-muted">{body}</p>
        {aside}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

/** The design foundations in place: light, color, type, motion and controls. */
export function Foundations() {
  const t = useTranslations('Foundations')

  return (
    <Page>
      <div className="pt-12 sm:pt-20">
        <Eyebrow>{t('eyebrow', { step: BUILD_STEP, total: BUILD_STEPS })}</Eyebrow>
        <h1 className="mt-4 title text-4xl sm:text-7xl">{t('title')}</h1>
        <p className="mt-5 max-w-[54ch] text-lg text-pretty text-muted">{t('lead')}</p>
      </div>

      <div className="pt-10 pb-16 sm:pt-14 sm:pb-20">
        <DemoShelf
          cases={blankCases}
          narrowCount={4}
          description={t('hero.description')}
          label={t('hero.shelfLabel')}
        />
        <p className="mt-10 text-sm text-muted">{t('hero.hint')}</p>
      </div>

      <LedProvider>
        <Section
          id="light"
          title={t('light.title')}
          body={t('light.body')}
          aside={
            <div className="mt-6 grid gap-5">
              <div>
                <ThemePicker />
                <p className="mt-2 text-sm text-muted">{t('light.choose')}</p>
              </div>
              <div>
                <LedPicker />
                <p className="mt-2 text-sm text-muted">{t('light.led.hint')}</p>
              </div>
            </div>
          }
        >
          <LightScenes />
        </Section>
      </LedProvider>

      <Section id="color" title={t('color.title')} body={t('color.body')}>
        <ColorRoles />
      </Section>

      <Section id="type" title={t('type.title')} body={t('type.body')}>
        <TypeSpecimen />
      </Section>

      <Section id="motion" title={t('motion.title')} body={t('motion.body')}>
        <MotionDemo />
      </Section>

      <Section id="controls" title={t('controls.title')} body={t('controls.body')}>
        <ControlsDemo />
      </Section>
    </Page>
  )
}
