import 'server-only'

import type { LinkProblem } from '@/domain/sync/link'

/** Why a source could not be read, in the link's own words. Every adapter throws this and nothing else. */
export class SourceError extends Error {
  readonly problem: LinkProblem

  constructor(problem: LinkProblem, message: string) {
    super(message)
    this.name = 'SourceError'
    this.problem = problem
  }
}
