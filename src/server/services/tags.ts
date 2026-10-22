/**
 * The cache tags (ADR 004). Every cached read is tagged with the library it
 * reads, and every write to that library expires the tag. Here on their own
 * so sign-in can expire them too, when an account is deleted, without
 * reaching for the services that read with them.
 */

/** Everything that depends on one library's contents, or its account's name, handle and visibility. */
export const libraryTag = (libraryId: string): string => `library:${libraryId}`

/** Everything that depends on one library's smart shelves. */
export const shelvesTag = (libraryId: string): string => `shelves:${libraryId}`

/** What a handle names, expired when an account takes it or gives it up. */
export const handleTag = (handle: string): string => `handle:${handle}`

/** What a file key names, expired when a library goes private and gets a new one. */
export const keyTag = (key: string): string => `key:${key}`
