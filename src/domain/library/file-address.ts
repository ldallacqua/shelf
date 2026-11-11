/**
 * The library file's revision (`snapshot.ts`): raised whenever the file gains something a copy
 * made before it lacks, though both still read the same, such as a field added last in a game's
 * row. A public library's file is kept a year by its address, by the edge and by the browser, and
 * the address carries the revision, so a browser holding an older copy asks again. Raising
 * `SNAPSHOT_FORMAT` instead would make a page still open from before refuse the new file.
 *
 * 2: IGDB's cover for a row's thumbnail (`smallCover`), 11 Nov 2026.
 */
export const LIBRARY_FILE_REVISION = 2

/** Where a public library's file lives for a version. The address changes when the library does. */
export const libraryFilePath = (key: string, version: number): string =>
  `/api/v1/libraries/${key}/snapshot/${version}?revision=${LIBRARY_FILE_REVISION}`
