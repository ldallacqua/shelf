import { z } from 'zod'

/**
 * Zod, for code that may run in the browser. Zod compiles its object checks
 * with `new Function` where it can, and first tries whether it can. The
 * site's content security policy refuses `new Function` (architecture,
 * section 20), and the browser reports even a refusal that Zod catches.
 * `jitless` skips the compiling, and the trying: checks are a little slower,
 * and allowed everywhere.
 */
z.config({ jitless: true })

export { z }
