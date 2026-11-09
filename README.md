# supabase-keepalive

Keeps your Free-plan Supabase projects from being paused for inactivity.

Supabase pauses a Free project when it gets
[too little database activity over a week](https://supabase.com/docs/guides/platform/free-project-pausing). supabase-keepalive runs on
Cloudflare once a day and writes a timestamp to each of your projects' databases, which counts as activity. It runs on Cloudflare's free
Workers plan.

## How it works

1. Every day at 12:00 UTC, Cloudflare starts the Worker.
2. The Worker reads your list of projects from a secret stored in your Cloudflare account.
3. For each project, it calls a small `keepalive()` function, which records the current time in a one-row table.
4. If a project can't be reached, the run shows as failed in the Cloudflare dashboard.

Your project list stays in your Cloudflare account. It isn't part of the code.

## Before you start

You need:

- **A Cloudflare account.** The free plan is enough.
- **Supabase projects that use the new API keys.** You'll need each project's publishable key (it starts with `sb_publishable_`). Older
  `anon` keys aren't supported.
- **[pnpm](https://pnpm.io/installation).** The project pins its pnpm and Node versions, and pnpm downloads them if yours differ. npm won't
  run it.

## Setting it up

### 1. Install

In the project folder:

```bash
pnpm install
```

Then sign in to Cloudflare. A browser window opens for you to approve access:

```bash
pnpm exec wrangler login
```

### 2. Prepare each Supabase project

In every project you want kept awake, open the **SQL Editor**, paste in the contents of [`supabase/keepalive.sql`](supabase/keepalive.sql),
and run it. It's safe to run more than once. It adds:

- **A `keepalive_heartbeats` table** holding one row: the time of the last ping. Row-level security keeps your app's publishable key from
  reading or changing it.
- **A `keepalive()` function** that updates that row. This is what the Worker calls.

### 3. List your projects

Copy the example file to create your own list:

```bash
cp config.example.json config.json
```

Then edit `config.json` with one entry per project:

```json
{
	"projects": [
		{ "name": "my-app", "url": "https://abcdefgh.supabase.co", "key": "sb_publishable_..." },
		{ "name": "side-project", "url": "https://ijklmnop.supabase.co", "key": "sb_publishable_..." }
	]
}
```

| Field  | What to put there                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| `name` | Any label you like. It's how the project appears in logs, so make each one unique.                              |
| `url`  | The project URL from **Project Settings → API**, such as `https://abcdefgh.supabase.co`, with nothing after it. |
| `key`  | The **publishable** key from **Project Settings → API Keys**.                                                   |

Only publishable keys are accepted. They're designed to be public, the same key your app gives to every visitor, so they're safe to use
here. Secret keys (`sb_secret_…`) are refused: they give full access to your data, and supabase-keepalive doesn't need it.

`config.json` stays on your computer. Git ignores it, so it won't be committed by accident.

### 4. Upload your list to Cloudflare

```bash
pnpm wrangler secret put CONFIG < config.json
```

This stores the list as an encrypted secret named `CONFIG` in your Cloudflare account. It works before your first deploy too.

### 5. Deploy

```bash
pnpm run deploy
```

Type `pnpm run deploy`, not `pnpm deploy`. `pnpm deploy` is a different pnpm command.

The deploy checks your list first. If something's wrong, it stops and tells you what, for example:

```
Invalid CONFIG:
  - projects[0].tabel must be removed
  - projects[1].url must be an https:// URL (was "http://b.supabase.co")
```

`projects[0]` is the first entry in your list, `projects[1]` the second, and so on. Fix `config.json`, upload it again (step 4) and deploy
again. Error messages never show your keys.

That's it. The first ping happens at the next 12:00 UTC.

## Adding, removing or changing projects

1. For a new project, prepare it first (setup step 2).
2. Edit `config.json`. To stop pinging a project, delete its entry. The list can't be empty.
3. Upload the list again:

```bash
pnpm wrangler secret put CONFIG < config.json
```

The new list takes effect immediately. You don't need to deploy again.

You can also edit `CONFIG` in the Cloudflare dashboard under **Workers & Pages → supabase-keepalive → Settings → Variables and Secrets**.
Paste the whole list as JSON, then select **Deploy**.

## Checking that it works

- **In Supabase:** run this in a project's SQL Editor to see when it was last pinged:

    ```sql
    select pinged_at from public.keepalive_heartbeats;
    ```

- **Live logs:** this shows each run as it happens:

    ```bash
    pnpm run logs
    ```

- **Past runs:** in the Cloudflare dashboard under **Workers & Pages → supabase-keepalive → Logs**. Each project gets one entry per run,
  whose message starts with `ok` or `FAILED`.

Nothing notifies you when a ping fails, so check now and then. A ping that keeps failing for a week means that project will be paused.

## When it runs

Once a day at 12:00 UTC. Supabase allows a week of inactivity, so a missed day or two is fine.

If a ping fails because of a timeout, a network problem or a temporary error on Supabase's side, it's retried once a few seconds later.
Problems that won't fix themselves, like a wrong key, aren't retried.

To run it at a different time, change `"0 12 * * *"` in `wrangler.jsonc` to another
[cron schedule](https://developers.cloudflare.com/workers/configuration/cron-triggers/#supported-cron-expressions), then run
`pnpm run deploy`. Anything more often than every 6 days works.

## Troubleshooting

### `npm error EBADDEVENGINES`

The project only runs with pnpm. Use the `pnpm` commands shown here.

### The deploy stops with `Invalid CONFIG:` and a list of problems

Fix each listed entry in `config.json`, upload it again and redeploy. Duplicate names are only checked once everything else is valid, so a
second round of errors is possible.

### The deploy says `CONFIG` is missing

Upload your list first (setup step 4).

### The logs show `FAILED my-app: HTTP 404` with `PGRST202`

`keepalive.sql` hasn't been run in that project, or was run in a different one. Run it there (setup step 2).

### The logs show `FAILED my-app: HTTP 401`

The key is wrong or belongs to another project. Copy the publishable key from that project's **API Keys** page, update `config.json` and
upload it again.

### The logs show `request timed out` or a network error

Usually temporary, and already retried once. If it happens every day, check that the project's `url` is right and that the project isn't
paused.

### Runs fail with `Invalid CONFIG:` after you changed the list

The list you uploaded or saved in the dashboard is invalid, and the logs say why. Fix `config.json` and upload it again.

### A project got paused anyway

Restore it from the Supabase dashboard; supabase-keepalive can't wake a paused project. Then look in the logs for failed pings before the
pause.

## Limits

- **Projects that are already paused** have to be restored from the Supabase dashboard first. supabase-keepalive keeps them awake from then
  on.
- **About 25 projects** at most. A free Cloudflare account allows 50 requests per run, and each project can use two (a ping and a retry). A
  `CONFIG` secret also holds at most 5 KB, which fits about as many.
- **Supabase doesn't publish its exact inactivity rules,** and they could change. A daily database write is what its documentation describes
  as counting.

## Removing it

To stop pinging and delete the Worker, its schedule and its stored list from Cloudflare:

```bash
pnpm wrangler delete
```

To remove the table and function from a Supabase project, run this in its SQL Editor:

```sql
drop function if exists public.keepalive();
drop table if exists public.keepalive_heartbeats;
```

After that, your projects can be paused again after a week of inactivity.

## License

[MIT](LICENSE)
