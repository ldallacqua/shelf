import type {
  AddedGame,
  AddInput,
  AddSteamInput,
  Answer,
  Grouping,
  SearchAnswer,
  SteamLinkAnswer,
} from '@/domain/library/adding'

/**
 * The server's ways to add games, handed down from the layout. Each checks
 * on the server that the owner is asking, whoever calls it.
 */
export type AddActions = {
  search: (text: string) => Promise<Answer<SearchAnswer>>
  grouping: (igdbId: number) => Promise<Answer<Grouping>>
  add: (input: AddInput) => Promise<Answer<AddedGame>>
  undo: (added: AddedGame['undo']) => Promise<Answer<number>>
  /** What a pasted Steam link is. Only a moderator gets an answer (ADR 006). */
  steamLink: (appId: string) => Promise<Answer<SteamLinkAnswer>>
  addSteam: (input: AddSteamInput) => Promise<Answer<AddedGame>>
}
