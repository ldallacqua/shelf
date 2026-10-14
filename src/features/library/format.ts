import type { Day } from '@/domain/library/values'

/** A calendar day as a date at midnight UTC, so no time zone can move it to the day before. */
export const dateOf = (day: Day): Date => new Date(`${day}T00:00:00Z`)

/** Whole hours from minutes, rounded to the nearest; under half an hour is zero. */
export const hoursOf = (minutes: number): number => Math.round(minutes / 60)

/** My rating is kept out of 100 and shown out of ten, in half steps. */
export const outOfTen = (rating: number): number => Math.round(rating / 5) / 2
