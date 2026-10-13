import { setupServer } from 'msw/node'

/**
 * The one network every unit test shares, and it is closed: a request with no
 * test double fails the test that made it. A test that needs IGDB adds the
 * doubles with `network.use(...)`; they are removed again after each test.
 */
export const network = setupServer()
