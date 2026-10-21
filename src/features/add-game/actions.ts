import type { AddedGame, AddInput, Answer, Grouping, SearchAnswer } from '@/domain/library/adding'

/**
 * The server's ways to add games, handed down from the layout. Each checks
 * on the server that the owner is asking, whoever calls it.
 */
export type AddActions = {
  search: (text: string) => Promise<Answer<SearchAnswer>>
  grouping: (igdbId: number) => Promise<Answer<Grouping>>
  add: (input: AddInput) => Promise<Answer<AddedGame>>
  undo: (added: AddedGame['undo']) => Promise<Answer<number>>
}
