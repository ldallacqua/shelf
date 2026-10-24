# fixtures

Real IGDB records, fetched once and committed. Seeds, tests and the IGDB test double all read
these files; none of them touches the network.

| File | Holds |
| --- | --- |
| `igdb/games.json` | The sample library: about 230 games, as IGDB sent them, trimmed of what Shelf never reads |
| `igdb/games-stress.json` | About 1,050 more, leaner (no storyline, two screenshots), for tests with a thousand games and more |
| `igdb/time-to-beat.json` | IGDB's time-to-beat figures for all of them |
| `igdb/ancestors.json` | The originals of ports, remasters and editions that are not themselves in a set |
| `igdb/lineage.json` | Each record's chain of originals, worked out when fetched |
| `igdb/names.json` | Names for the genre, theme, mode, perspective, franchise, series and keyword ids the records use |
| `igdb/platforms.json` | IGDB's full platform list |
| `covers.json` | For each cover: three colors and a ThumbHash, read from the image. No image is stored. |
| `library/sets.json` | Which ids make up the `default` and `stress` sets, and which are extra versions |
| `steam/owned-games.json` | What Steam's `GetOwnedGames` answers for a made-up account: 24 sample games by their real app ids, one Steam id IGDB lacks (Halo: Combat Evolved, matched by title; the app id is made up), and two nothing matches. Written by hand. |
| `nintendo/play-history.json` | What the Nintendo Store app's play history answers for a made-up account: nine Switch games, Tears of the Kingdom played on a Switch and then a Switch 2, Super Mario Odyssey on a Switch 2 alone, Mario Kart 8 Deluxe played two days before the tests' clock, and two titles IGDB's fixtures lack (Nintendo Switch Online's NES app, Mario Kart World). Written by hand. |
| `steam/store-items.json` | What Steam's store (`IStoreBrowseService/GetItems`) answers about those apps: each a game (type 0), but Wallpaper Engine software (type 6), and Halo's made-up id with no store page (success 15). Written by hand. |

**To refresh them:** edit the list of titles in `scripts/fixtures/titles.ts` if you want
different games, then run `pnpm fixtures:fetch`. It needs the Twitch settings in
`.env.local`, takes about a minute, and is the only thing in the repository that talks to the
real IGDB. Review the diff before committing.

**What "I" did with each game** (status, copies, rating, playtime) is not in these files. It
is invented by `src/server/seed/mine.ts`, the same way every time.

**Terms.** IGDB's data is used under the Twitch Developer Service Agreement, for
non-commercial use, and its FAQ allows caching. The repository is private. If it is ever made
public, these files need another look first.
