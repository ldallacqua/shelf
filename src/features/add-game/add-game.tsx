'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { AddedGame } from '@/domain/library/adding'
import { MAX_ADDITIONS } from '@/domain/library/bulk'
import { announceChange } from '@/features/owner/library-change'
import { notify } from '@/features/shell/notices'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/ui/cn'
import { Sheet, SHEET_CENTERED, SheetContent } from '@/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs'

import type { AddActions } from './actions'
import { AddList, type AddedMany } from './add-list'
import { AddOne } from './add-one'
import { undoGames } from './list-client'

type AddGameProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: AddActions
}

type Tab = 'one' | 'list'

/**
 * Adding games (spec 4), for the owner: the sheet the Add button, `A` and
 * the empty library open. One game, or a pasted list. After an add the
 * library moves to the new game, and a notice offers Undo.
 */
export function AddGame({ open, onOpenChange, actions }: AddGameProps) {
  const t = useTranslations('Add')
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('one')

  const onAdded = (added: AddedGame, again: boolean) => {
    const undo = async () => {
      const result = await actions.undo(added.undo)
      if (!result.ok) {
        notify({ message: t(`errors.${result.reason}`) })
        return
      }
      announceChange({ version: result.value })
      notify({ message: t('undone', { title: added.title }) })
      router.refresh()
    }
    notify({
      message: t('added', { title: added.title }),
      actions: [{ label: t('undo'), run: undo }],
    })
    announceChange({ version: added.version, slug: added.slug, title: added.title, undo })
    // Every page built from the library, this one included, draws it afresh.
    router.refresh()
    if (!again) onOpenChange(false)
  }

  const onAddedMany = ({ count, undo, version }: AddedMany, all: boolean) => {
    const takeBack = async () => {
      let after = version
      // Last added first, as many at a time as the API takes.
      for (let end = undo.length; end > 0; end -= MAX_ADDITIONS) {
        const result = await undoGames(undo.slice(Math.max(0, end - MAX_ADDITIONS), end))
        if (!result.ok) {
          notify({ message: t(`errors.${result.reason}`) })
          return
        }
        after = result.value.version
      }
      announceChange({ version: after })
      notify({ message: t('list.undone', { count }) })
      router.refresh()
    }
    notify({ message: t('list.added', { count }), actions: [{ label: t('undo'), run: takeBack }] })
    announceChange({ version })
    router.refresh()
    if (all) onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={t('title')}
        description={t('help')}
        closeLabel={t('close')}
        // A list's review needs the room: a row is a game and three choices.
        className={cn(
          tab === 'list' ? 'sm:w-[44rem] lg:w-[56rem]' : 'lg:w-[34rem]',
          // In the middle of a very wide window, as a game is. One size for both tabs, so changing tab
          // moves nothing, and as wide as a list's review needs: a search needs less than a game's page.
          SHEET_CENTERED,
          'game-centered:h-[min(94dvh,60rem)] game-centered:w-[56rem]',
        )}
        onOpenAutoFocus={(event) => {
          // Straight to the field: typing is the first thing to do.
          const field = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
            '[role="tabpanel"][data-state="active"] [data-add-search]',
          )
          if (field) {
            event.preventDefault()
            field.focus()
          }
        }}
      >
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList aria-label={t('tabs')}>
            <TabsTrigger value="one">{t('one')}</TabsTrigger>
            <TabsTrigger value="list">{t('list.tab')}</TabsTrigger>
          </TabsList>
          {/* Both stay mounted, so switching tabs loses nothing typed. */}
          <TabsContent value="one" forceMount className="mt-4 data-[state=inactive]:hidden">
            <AddOne actions={actions} onAdded={onAdded} onOpenOwned={() => onOpenChange(false)} />
          </TabsContent>
          <TabsContent value="list" forceMount className="mt-4 data-[state=inactive]:hidden">
            <AddList onAdded={onAddedMany} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
