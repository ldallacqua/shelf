# Shelf: setup checklist

- **Date:** 12 Oct 2026
- **Reads with:** [the architecture](architecture.md)

These are the things only you can do: accounts, a few clicks, and pasting secret values. There
are four short sessions, each tied to a build step. Nothing here is needed before you approve
this phase.

Three rules I keep throughout:

- I never ask for a secret value in chat, and never print one.
- You paste values straight into Vercel or into `.env.local` on this computer.
- The repository holds names only (`.env.example`).

## At a glance

| Session | You do | Needed before | Time |
| --- | --- | --- | --- |
| [A](#a-vercel-project) | Create the Vercel project | Reviewing build step 1 | 5 min |
| [B](#b-turso-databases) | Create two Turso databases, paste 2 settings | Build step 7 (sooner if you like) | 10 min |
| [C](#c-sign-in) | Choose your email address and password, paste 5 settings | Build step 7 | 5 min |
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

1. In a terminal on this computer, run `vercel login` and finish the sign-in in the browser it
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
| Functions, Function Region | São Paulo (`gru1`), set by `vercel.json` |
| Deployment Protection | Vercel Authentication on, Standard Protection |

---

## B. Turso databases

**Production's database was made on 21 Oct 2026**, as `shelf-ldallacqua`, in AWS São Paulo
(`aws-sa-east-1`); the functions moved to São Paulo with it (`gru1`, in `vercel.json`). Its
two settings are for **Production only**. The preview database is not made yet, so previews
keep the sample built into them, which cannot be written to.

**When:** any time before I start build step 7. Nothing before that needs it.

Local work and CI use a file on disk and need none of this. The databases are for the
deployed previews and for production.

**Until you do this**, previews still work: each one is built with the sample library inside
it, and production shows an empty library. That is enough to review steps 2 to 6. It is not
enough for step 7, because a library added through sign-in has to be kept somewhere, and
Shelf refuses to save into the built-in sample.

1. Go to [turso.tech](https://turso.tech) and sign up with GitHub. The free plan needs no
   card.
2. Create a database named **`shelf`**. For location choose **AWS South America (São
   Paulo)**, `aws-sa-east-1`. That puts it next to the Vercel function.
3. Create a second database named **`shelf-preview`** in the same location. Never give
   previews production's database: a preview build fills an empty database with the sample
   games.
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

## C. Sign-in

**When:** before signing in on the site. Changed on 21 Oct 2026: sign-in was going to be
GitHub, and is now one account with an email address and password, made from the settings
below. Nobody can make another account.

### Settings in Vercel

For **Production** only (previews have no database to keep a session in yet). Mark all of
them **Sensitive**.

| Name | Value |
| --- | --- |
| `BETTER_AUTH_SECRET` | A random value, 32 characters or more |
| `OWNER_EMAIL` | The email address you will sign in with |
| `OWNER_PASSWORD` | Your password: 12 to 128 characters. A long one from a password manager is best. |
| `TWITCH_CLIENT_ID` | From `.env.local` in this project (searching IGDB needs it) |
| `TWITCH_CLIENT_SECRET` | From `.env.local` in this project |

From a terminal in the project folder, each of these asks for its value:

```sh
vercel env add BETTER_AUTH_SECRET production --sensitive
vercel env add OWNER_EMAIL production --sensitive
vercel env add OWNER_PASSWORD production --sensitive
vercel env add TWITCH_CLIENT_ID production --sensitive
vercel env add TWITCH_CLIENT_SECRET production --sensitive
```

To make a random value, run `openssl rand -base64 32`, or, where there is no `openssl`,
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Use a terminal
of your own, not the one in the Claude app: I can read that one.

The account is made the first time you sign in. **To change the password,** change
`OWNER_PASSWORD` and redeploy: the next sign-in takes the new one, and every session signed in
with the old one ends. Five wrong tries a minute from one address, and sign-in waits.

### Settings on this computer

Not needed: the browser tests make up an owner of their own. To sign in on `pnpm dev`, add
`BETTER_AUTH_SECRET`, `OWNER_EMAIL` and `OWNER_PASSWORD` to `.env.local` yourself, with any
values; I can generate the secret into the file without displaying it.

**Check it worked:** on production, **Sign in** asks for your email address and password, and
the **Add** button appears once you are in. A wrong password is turned away with a plain
message. To let an assistant in, add `https://shelf-ldallacqua.vercel.app/api/mcp/owner` to
it as an MCP server: it sends you to sign in, then asks you to say yes.

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
- **A custom domain later** is added in Vercel. Nothing in the code changes.
- **Free limits** are in [the architecture, section 3](architecture.md#3-services-and-their-free-limits).
  None of these services can bill you on its free plan as set up here.

## Every setting in one place

| Name | Local | Preview | Production | Session |
| --- | --- | --- | --- | --- |
| `TWITCH_CLIENT_ID` | Set already | Not yet | Paste | C |
| `TWITCH_CLIENT_SECRET` | Set already | Not yet | Paste | C |
| `TURSO_DATABASE_URL` | Not used | Not yet (`shelf-preview`) | Set (`shelf-ldallacqua`) | B |
| `TURSO_AUTH_TOKEN` | Not used | Not yet (`shelf-preview`) | Set (`shelf-ldallacqua`) | B |
| `SHELF_MOCKS` | Tests set it | Never | Never | none |
| `BETTER_AUTH_SECRET` | Optional | Not yet | Paste, random | C |
| `OWNER_EMAIL` | Optional | Not yet | Paste | C |
| `OWNER_PASSWORD` | Optional | Not yet | Paste | C |
| `CRON_SECRET` | Not used | Not used | Paste, random | D |
