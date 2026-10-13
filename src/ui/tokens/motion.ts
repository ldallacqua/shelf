/**
 * Motion tokens for code that cannot read CSS: Motion, GSAP and the 3D scene.
 * The source of truth is motion.css; motion.test.ts fails if the two disagree.
 */
export const duration = {
  instant: 100,
  quick: 180,
  base: 280,
  slow: 480,
  cinematic: 800,
} as const

export const ease = {
  glide: [0.45, 0, 0.15, 1],
  settle: [0.16, 1, 0.3, 1],
  leave: [0.4, 0, 1, 1],
} as const

export type DurationName = keyof typeof duration
export type EaseName = keyof typeof ease
