# server

Code that runs only on the server: the database, the IGDB client, sign-in, and the services
that every read and write goes through.

It may import `domain/` and nothing else of ours. From build step 2 each module starts with
`import 'server-only'`, so pulling one into the browser bundle is a build error.
