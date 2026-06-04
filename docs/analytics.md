# First-Party Analytics

Lightweight, privacy-friendly product analytics so we can learn what people
actually do during the beta — **before** building more features. No Google
Analytics, no third-party trackers, no ad pixels. Events go only to our own
Supabase database.

## What it collects

Each event row carries:

| Field        | Example                      | Notes                                    |
|--------------|------------------------------|------------------------------------------|
| `event`      | `page_view`                  | event name                               |
| `props`      | `{"min_tier":"studio"}`      | small JSON blob, event-specific          |
| `path`       | `/freeform`                  | route at the time                        |
| `anon_id`    | random uuid                  | per-device, resettable by clearing data  |
| `session_id` | random uuid                  | per browser session                      |
| `user_id`    | uuid or `null`               | account id only when signed in           |
| `tier`       | `free` / `maker` / …         | subscription tier                        |
| `ts`         | client timestamp             | when it happened on device               |
| `created_at` | server timestamp             | when Supabase stored it                  |

It deliberately does **not** record design contents, reference images, emails,
names, or IP addresses.

## Events emitted today

- `page_view` — fired on every route change (this is also our "tool opened"
  signal, since each tool is its own route: `/freeform`, `/designer`, `/erin2d`,
  `/tuner`, `/atlas`).
- `paywall_view` — a tier gate was shown (`props`: feature, min_tier,
  current_tier, mode).
- `upgrade_click` — user clicked an Upgrade button from a gate.
- `sign_in`, `sign_up`, `sign_out` — auth funnel.
- `export` — a design was exported (`props.format`: `pdf_bom`, `pdf_pattern`,
  `csv`, `glb`, `stl_per_color`, `bom_csv`, `bom_png`, `bom_print`). This is the
  strongest "got real value" signal. Tracked at handler entry (or just after the
  "nothing to export" guard for 3D), so it counts actual exports, not abandoned
  clicks.

Add more with one line: `import { track } from "../lib/analytics"; track("export", { format: "pdf" });`

## Transparency / consent (the "transparent to the user" part)

- A one-time bottom banner (`AnalyticsNotice`) tells users we use first-party
  analytics and links to the Privacy Policy.
- The **Privacy Policy** (`/privacy`) has a new section 4 plus a live **opt-out
  toggle** that flips a localStorage flag the tracker checks on every event.
- The browser **Do Not Track** signal is honored automatically.
- If Supabase env vars are missing, analytics silently no-op (same as auth).

## Setup (one time)

1. Open the Supabase project → **SQL Editor** → paste and run
   [`supabase/analytics_events.sql`](../supabase/analytics_events.sql).
   It creates the `analytics_events` table with insert-only RLS for the anon key.
2. No env vars needed — it reuses the existing `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` client.
3. Deploy. Events start flowing on the next visit.

## Reading the data

Run these in the Supabase SQL Editor (service role bypasses RLS).

```sql
-- Most-used tools / pages in the last 7 days
select path, count(*) as views, count(distinct session_id) as sessions
from analytics_events
where event = 'page_view' and created_at > now() - interval '7 days'
group by path order by views desc;

-- Paywall → upgrade funnel by tier gate
select props->>'min_tier' as gate,
       count(*) filter (where event = 'paywall_view')   as paywall_views,
       count(*) filter (where event = 'upgrade_click')  as upgrade_clicks
from analytics_events
where created_at > now() - interval '30 days'
group by 1 order by paywall_views desc;

-- Daily active sessions
select date_trunc('day', created_at) as day, count(distinct session_id) as sessions
from analytics_events
group by 1 order by 1 desc;

-- Signup funnel
select event, count(*) from analytics_events
where event in ('sign_up','sign_in') and created_at > now() - interval '30 days'
group by event;
```

## Cleanup / retention

There's no automatic purge. To trim old rows periodically:

```sql
delete from analytics_events where created_at < now() - interval '180 days';
```
