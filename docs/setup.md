# Shelf: setup checklist

- **Date:** 12 Oct 2026
- **Reads with:** [the architecture](architecture.md)

These are the things only you can do: accounts, a few clicks, and pasting secret values. There
are four short sessions, each tied to a build step. Nothing here is needed before you approve
this phase.

Three rules I keep throughout:

- I never ask for a secret value in chat, and never print one.
- You paste values straight into Vercel or into `.env.local` on this Mac.
- The repository holds names only (`.env.example`).

## At a glance

| Session | You do | Needed before | Time |
| --- | --- | --- | --- |
| [A](#a-vercel-project) | Create the Vercel project | Reviewing build step 1 | 5 min |
| [B](#b-turso-databases) | Create two Turso databases, paste 2 settings | Build step 7 (sooner if you like) | 10 min |
| [C](#c-github-sign-in) | Create two GitHub OAuth apps, paste 7 settings | Build step 7 | 15 min |
| [D](#d-daily-refresh) | Paste 1 setting | Build step 9 | 2 min |

Steps 2, 3, 4, 5, 6, 8 and 10 need nothing from you but review.

I will remind you at the start of each step that has a session.

---

## A. Vercel project

**Done on 13 Oct 2026**, by option 1. The project is `shelf-ldallacqua` under "dallacqua's
projects", connected to `ldallacqua/shelf`.

**When:** after I open the pull request for build step 1. I will say so.

There are two ways. The first is less clicking.

### Option 1: you sign in, I do the rest

1. In a terminal on this Mac, run `vercel login` and finish the sign-in in the browser it
   opens. Use your GitHub account, `ldallacqua`.
2. Tell me it is done.

I then create the project as `shelf-ldallacqua`, connect it to the GitHub repository, and
push, which produces the first preview. You may see a prompt from GitHub asking to let Vercel
read the `shelf` repository; allow it for that one repository.

### Option 2: the dashboard

1. Go to [vercel.com](https://vercel.com) and sign in **with GitHub**, as `ldallacqua`.
2. **Add New**, then **Project**, then **Import Git Repository**. Pick `ldallacqua/shelf`.
   If it is not listed, choose **Adjust GitHub App Permissions** and grant access to that one
   repository.
3. **Project name:** `shelf-ldallacqua`.
4. **Framework preset:** choose **Next.js** by hand.
5. Leave everything else. Add no environment variables yet. **Deploy.**
6. Tell me it is done, and I push a commit so the pull request gets its preview.

With option 2, the very first deployment will fail. It builds `main`, which has no app until
the step 1 pull request merges. That is expected. The preview on the pull request is the one
to open.

### Either way

- **The address** will be `https://shelf-ldallacqua.vercel.app`. It was free when I checked on
  12 Oct 2026. If you prefer another name, tell me before session C, because the GitHub
  sign-in addresses below contain it.
- **Why "with GitHub" matters.** On the free plan Vercel only deploys commits whose author is
  the account owner, and it checks that through the linked GitHub account. Commits in this
  repository are authored as `ldallacqua`.
- **On your phone:** sign in to vercel.com once in the phone's browser. Preview links then
  open. Previews are private to you; the production address is public.

**Check it worked:** the pull request shows a comment from Vercel with a **Visit Preview**
link, and the link opens on your phone.

**Nothing to change, for reference** (Project, then Settings; Vercel's labels may differ a
little from these):

| Setting | Should read |
| --- | --- |
| Build and Deployment, Node.js Version | 24.x |
| Functions, Function Region | Washington, D.C. (`iad1`) |
| Deployment Protection | Vercel Authentication on, Standard Protection |

---

## B. Turso databases

**When:** any time before I start build step 7. Nothing before that needs it.

Local work and CI use a file on disk and need none of this. The databases are for the
deployed previews and for production.

**Until you do this**, previews still work: each one is built with the sample library inside
it, and production shows an empty library. That is enough to review steps 2 to 6. It is not
enough for step 7, because a library added through sign-in has to be kept somewhere, and
Shelf refuses to save into the built-in sample.

1. Go to [turso.tech](https://turso.tech) and sign up with GitHub. The free plan needs no
   card.
2. Create a database named **`shelf`**. For location choose **AWS US East (Virginia)**,
   `aws-us-east-1`. That puts it next to the Vercel function.
3. Create a second database named **`shelf-preview`** in the same location.
4. For each database, copy its **URL** (it starts with `libsql://`) and create a **token**
   with read and write access.
5. In Vercel: your project, **Settings**, **Environment Variables**. Add these, marked
   **Sensitive**:

| Name | Environment | Value from |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | Production | `shelf` |
| `TURSO_AUTH_TOKEN` | Production | `shelf` |
| `TURSO_DATABASE_URL` | Preview | `shelf-preview` |
| `TURSO_AUTH_TOKEN` | Preview | `shelf-preview` |

6. Tell me it is done. I push, and the preview builds against `shelf-preview`.

Turso's screens may be worded a little differently from the steps above; I have read its
documentation, not clicked through its dashboard.

**Why two databases:** previews get the 200 sample games and can be reset freely. Nothing a
preview does can touch your real library.

**Check it worked:** the next preview's build log says "Migrated the Turso database" where it
used to warn that no database is connected, and the preview still shows the sample library.

---

## C. GitHub sign-in

**When:** before I start build step 7.

### Two OAuth apps

On GitHub: your profile picture, **Settings**, **Developer settings**, **OAuth Apps**, **New
OAuth App**. Create two.

| Field | App 1 | App 2 |
| --- | --- | --- |
| Application name | `Shelf` | `Shelf (local)` |
| Homepage URL | `https://shelf-ldallacqua.vercel.app` | `http://localhost:3300` |
| Authorization callback URL | `https://shelf-ldallacqua.vercel.app/api/auth/callback/github` | `http://localhost:3300/api/auth/callback/github` |
| Enable Device Flow | Off | Off |

For each, press **Generate a new client secret** and keep the page open; GitHub shows the
secret once.

Preview deployments need no app of their own. They sign in through production.

### Settings in Vercel

Mark all of them **Sensitive**. To make a random value, run `openssl rand -base64 32` in a
terminal.

| Name | Environment | Value |
| --- | --- | --- |
| `GITHUB_CLIENT_ID` | Production and Preview | App 1's client id |
| `GITHUB_CLIENT_SECRET` | Production and Preview | App 1's client secret |
| `BETTER_AUTH_SECRET` | Production | A random value |
| `BETTER_AUTH_SECRET` | Preview | A different random value |
| `OAUTH_PROXY_SECRET` | Production and Preview | One random value, the same in both |
| `OWNER_GITHUB_ID` | Production and Preview | `186446537` |
| `TWITCH_CLIENT_ID` | Production and Preview | From `.env.local` in this project |
| `TWITCH_CLIENT_SECRET` | Production and Preview | From `.env.local` in this project |

`186446537` is your GitHub account's numeric id. It is public, not a secret; `gh api user
--jq .id` prints it. Shelf uses the number and not the username because a username can be
changed and then claimed by someone else.

### Settings on this Mac

Open `.env.local` in the project folder. I will have added the names; you fill in two:

| Name | Value |
| --- | --- |
| `GITHUB_CLIENT_ID` | App 2's client id |
| `GITHUB_CLIENT_SECRET` | App 2's client secret |

I generate the local `BETTER_AUTH_SECRET` myself, into the file, without displaying it.

**Check it worked:** on the step 7 preview, **Sign in** takes you to GitHub and back, and the
**Add** button appears. Signing in with any other GitHub account is turned away with a plain
message.

---

## D. Daily refresh

**When:** before I start build step 9.

| Name | Environment | Value |
| --- | --- | --- |
| `CRON_SECRET` | Production | A random value (`openssl rand -base64 32`) |

Vercel sends this value with its once-a-day call, so nobody else can trigger the refresh.

---

## Good to know

- **A changed setting takes effect on the next deployment.** After pasting values, tell me and
  I push, or press **Redeploy** in Vercel.
- **If a deployment is refused over the commit author,** tell me. The fix is on my side.
- **A custom domain later** needs two changes: add it in Vercel, and add
  `https://your-domain/api/auth/callback/github` as a second callback on App 1 (GitHub allows
  up to ten). Nothing in the code changes.
- **Free limits** are in [the architecture, section 3](architecture.md#3-services-and-their-free-limits).
  None of these services can bill you on its free plan as set up here.

## Every setting in one place

| Name | Local | Preview | Production | Session |
| --- | --- | --- | --- | --- |
| `TWITCH_CLIENT_ID` | Set already | Paste | Paste | C |
| `TWITCH_CLIENT_SECRET` | Set already | Paste | Paste | C |
| `TURSO_DATABASE_URL` | Not used | Paste (`shelf-preview`) | Paste (`shelf`) | B |
| `TURSO_AUTH_TOKEN` | Not used | Paste (`shelf-preview`) | Paste (`shelf`) | B |
| `SHELF_MOCKS` | Tests set it | Never | Never | none |
| `GITHUB_CLIENT_ID` | Paste (App 2) | Paste (App 1) | Paste (App 1) | C |
| `GITHUB_CLIENT_SECRET` | Paste (App 2) | Paste (App 1) | Paste (App 1) | C |
| `BETTER_AUTH_SECRET` | I generate it | Paste, random | Paste, a different random | C |
| `OAUTH_PROXY_SECRET` | Not used | Paste, random | Paste, the same value | C |
| `OWNER_GITHUB_ID` | I add it | `186446537` | `186446537` | C |
| `CRON_SECRET` | Not used | Not used | Paste, random | D |
