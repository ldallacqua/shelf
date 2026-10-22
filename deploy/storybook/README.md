# Storybook on Vercel

The component workshop, built from `main` at https://shelf-storybook.vercel.app.

It is a second Vercel project, `shelf-storybook`, on the same repository, with this folder
as its root directory: the app's own `vercel.json` at the top of the repository says Next.js,
and a project reads the `vercel.json` in its root directory. `vercel.json` here installs and
builds from the top of the repository, and builds only for production, so a push to a branch
costs no build: the free plan builds one thing at a time, and the app's previews come first.

In the project's settings, "skip deployments when there are no changes to the root directory"
is off. Vercel turns it on for a new project, and this folder holds no code, so it skipped
every build (21 Oct 2026).
