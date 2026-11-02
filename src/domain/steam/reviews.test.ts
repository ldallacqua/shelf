import { describe, expect, it } from 'vitest'

import { mostReviewed, reviewsMoved, steamReviewsIn, steamReviewsQuestion } from './reviews'

const seen = { app: '620', count: 1000, percent: 90, score: 8 }

describe('steamReviewsQuestion', () => {
  it('asks the store for its reviews, app by app', () => {
    expect(JSON.parse(steamReviewsQuestion(['620', '400']))).toMatchObject({
      ids: [{ appid: 620 }, { appid: 400 }],
      data_request: { include_reviews: true },
    })
  })
})

describe('steamReviewsIn', () => {
  it('reads the summary the store gives', () => {
    const answer = {
      response: {
        store_items: [
          {
            id: 620,
            success: 1,
            reviews: {
              summary_filtered: {
                review_count: 392586,
                percent_positive: 98,
                review_score: 9,
                review_score_label: 'Overwhelmingly Positive',
              },
            },
          },
        ],
      },
    }
    expect(steamReviewsIn(answer)?.get('620')).toEqual({
      app: '620',
      count: 392586,
      percent: 98,
      score: 9,
    })
  })

  it('leaves out an app with no reviews, and one the store has no page for', () => {
    const answer = {
      response: {
        store_items: [
          {
            id: 1,
            reviews: {
              summary_filtered: {
                review_count: 0,
                percent_positive: 0,
                review_score: 0,
                review_score_label: 'No user reviews',
              },
            },
          },
          { id: 2, success: 15 },
        ],
      },
    }
    expect(steamReviewsIn(answer)?.size).toBe(0)
  })

  it('says so when the answer has a new shape', () => {
    expect(steamReviewsIn({ nothing: true })).toBeUndefined()
    expect(
      steamReviewsIn({
        response: {
          store_items: [
            {
              id: 1,
              reviews: {
                summary_filtered: { review_count: 3, percent_positive: 900, review_score: 1 },
              },
            },
          ],
        },
      }),
    ).toBeUndefined()
  })
})

describe('mostReviewed', () => {
  it('takes the app of a game that most people reviewed', () => {
    const reviews = new Map([
      ['1', { ...seen, app: '1', count: 10 }],
      ['2', { ...seen, app: '2', count: 500 }],
    ])
    expect(mostReviewed(['1', '2', '3'], reviews)?.app).toBe('2')
    expect(mostReviewed(['3'], reviews)).toBeUndefined()
  })
})

describe('reviewsMoved', () => {
  it('stays still for a few more reviews, which every popular game gets each day', () => {
    expect(reviewsMoved(seen, { ...seen, count: 1040 })).toBe(false)
  })

  it('moves with the share, the words, the app, or a count a twentieth larger', () => {
    expect(reviewsMoved(seen, { ...seen, percent: 89 })).toBe(true)
    expect(reviewsMoved(seen, { ...seen, score: 7 })).toBe(true)
    expect(reviewsMoved(seen, { ...seen, app: '400' })).toBe(true)
    expect(reviewsMoved(seen, { ...seen, count: 1051 })).toBe(true)
  })

  it('moves when reviews first come, or go', () => {
    expect(reviewsMoved(null, seen)).toBe(true)
    expect(reviewsMoved(seen, undefined)).toBe(true)
    expect(reviewsMoved(null, undefined)).toBe(false)
  })
})
