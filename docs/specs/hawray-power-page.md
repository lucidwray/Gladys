# Hawray Power page (`/dashboard/power`)

> **Living specification — source of truth.** A fork-only "Power" page: an Emporia-app-style power
> table plus time-aligned per-circuit charts, to watch power change as appliances switch.
> **Rule: any PR that changes one of these behaviors or contracts modifies this file in the same
> diff** — spec first, code second.
>
> Status: **build spec for Phase 1 — nothing is implemented.** Owner decisions of 2026-10-13 are
> applied (§13). Citations are pinned to `hawray@d0f1964a`. **Decision** = taken by the owner on
> 2026-10-13; **Proposal** = this spec's suggestion, undecided; **UNVERIFIED** = not confirmed
> against code or a running system.

## 1. Purpose and constraints

Answer "what is drawing power right now, and what just switched on?": a usage table (§4), one large chart (§5) and one
small chart per circuit on a shared time axis (§6). Fork-only (`hawray-` naming, new files; upstream files touched
only at the wiring points of §2 and §7.1) and read-only (§12). Emporia gives a 1-minute average every 60 s (§9); the
page never claims more resolution.

## 2. Page and navigation

Wired like the Controls page (commit `bc427ec4`):

| Change | Where |
|---|---|
| Add `'power'` to `NON_DASHBOARD_SECTIONS`; without it `/dashboard/power` is read as a dashboard selector | `front/src/components/header/index.jsx:38-50`, `:52-60` |
| Add a `NAV_ITEMS` entry `{ href: '/dashboard/power', icon: 'zap', labelKey: 'hawrayPower.nav', isActive: url => url.startsWith('/dashboard/power') }` (Proposal: icon `zap`, already used at `front/src/config/demo/dashboards.js:444`) | `header/index.jsx:84-89` (Controls entry) |
| Import the page and add `<SafeAsyncRoute path="/dashboard/power" component={PowerPage} />` | `front/src/components/app.jsx:52-53`, `:446-447` |
| New page folder `front/src/routes/hawray-power/` (data loading: `connect('httpClient,session,user')` + `withIntlAsProp`) | pattern: `front/src/routes/hawray-controls/index.js:142` |
| New `hawrayPower` object in `en.json`, `fr.json`, `de.json`, `es.json`, placed after `hawrayHomekitSceneSwitches` (line 19) and before `hawrayControls` (line 7183, the last key) | `front/src/config/i18n/*.json` |

- Visible to every logged-in user, like Controls: no `adminOnly` (only Scenes has it, `:115`; the sidebar filters on
  it, `:238`) and no role guard on the route (`app.jsx:446-447`).
- Layout, Bootstrap **4.1.0** only (no `.stretched-link`, no 4.3+ utilities). Phone: one column, order A, B, C; the
  table keeps name, value, %. Desktop (`lg` and up, Proposal): A and B side by side, C full width below.
- No circuit icons in v1 (Decision); the row layout leaves room for a later icon column.

## 3. Sources: mains, Balance, circuits, plugs

**Why not the energy hierarchy.** The 5.2 hierarchy (`energy_parent_id`) links only energy source features (index,
consumption: `docs/specs/energy-hierarchy.md:44-48`), never power features, and "mains" exists only as the meter of a
consumption contract. The page identifies its sources itself.

**Emporia bridge naming.** One Gladys device per channel, `external_id` = `{prefix}{gid}:{slug}`, slug = the channel
number with every run of characters outside `[A-Za-z0-9_-]` replaced by `-`
(`maijordomo/bridges/emporia/emporia_bridge/gladys.py:36,43-49`). Each device has an `energy-sensor`/`power` feature
(watt, signed, `keep_history`) and model `"Emporia Vue channel"` (`gladys.py:81-95`). No mains/balance flag exists.
Two Vues would give two `:1-2-3` devices (the override below covers it).

| Role | Rule | Evidence |
|---|---|---|
| Mains | device with model `Emporia Vue channel` whose `external_id` ends in `:1-2-3` | Emporia channel `"1,2,3"` → slug `1-2-3` (`gladys.py:44`, `maijordomo/bridges/emporia/tests/test_gladys.py:48`) |
| Balance | same model, `external_id` ends in `:balance`, compared **case-insensitively** | **UNVERIFIED**: the slug keeps case and is derived from the channel number the Emporia cloud returns (`emporia.py:78-83`); nothing in the bridge repo or its tests names the Balance channel, so the real suffix may be `:Balance`. Check on the live device list before coding. |
| Circuit | same model, neither of the above |  |
| Plug | any other feature of type `switch`/`power` or `energy-sensor`/`power` (`server/utils/constants.js:1070`, `:1224`) |  |

- **Override (Decision).** A small settings panel on the page can override the mains device, stored in the Gladys
  variable `HAWRAY_POWER_MAINS_DEVICE` (device selector); auto-detect applies while it is empty. **Any logged-in user
  may write it** (Decision). Global variables are admin-only over HTTP (`server/api/routes.js:962-971`), so the page
  uses the `hawray/power` endpoints (§7), not `/api/v1/variable`.
- **Plugs** (the owner's 4 Zigbee plugs, any non-Emporia power feature) get a separate "Plugs" section and are
  **not** counted in any percentage: they sit downstream of a circuit (double count).

## 4. Section A: power table

Modelled on the Emporia "Home Monitor" screen. Tabs: **Live / Min / Hr / Day / Wk / Mo / Yr** (default Live). Rows,
top to bottom:

1. **Total Usage** — the **mains channel only** (Decision). Balance is already inside the mains, so it is never
   added to the Total.
2. One row per **circuit**: name, value, % of Total, sorted by displayed value descending. A row is greyed, not
   hidden (stable layout), when its displayed value is exactly 0.000 kW (Decision).
3. **Other / unmonitored** — Balance = mains − Σ circuits (Decision), a row inside the mains total. Source: the
   Emporia Balance channel (§3), shown as-is; that it equals the difference is Emporia's definition (**UNVERIFIED**,
   §13).
4. **Plugs** section below (§3): same columns, no % column.

**Zero floor (Decision, display-only).** Every displayed value (circuits, Other/Balance, plugs, Total, chart series)
is clamped to `max(0, v)` in the page; the API and the stored states stay raw (the bridge declares power signed,
`gladys.py:28-29`). The % column uses the clamped values.

| Tab | Value shown | % column |
|---|---|---|
| Live | each feature's latest value, in kW with 3 decimals (so 0.000 is visible) | value / Total value |
| Min, Hr, Day, Wk, Mo, Yr | **kWh for the current period so far**: sum over time buckets of `average power × bucket seconds`, ÷ 3.6e6 | circuit kWh / mains kWh |

- kWh comes from the time-bucketed averages of §7, not from the `index` features. A bucket without samples counts 0
  (no interpolation), so a bridge outage lowers the kWh.
- **"Period so far" (Decision)** = from the start of the *current* minute/hour/day/week/month/year until now. Min is
  the current minute, not the last complete one. **Weeks start on Monday.**
- **Boundaries use the house timezone (Decision)**: the system variable `TIMEZONE`
  (`SYSTEM_VARIABLE_NAMES.TIMEZONE`, `server/utils/constants.js:514`), set in Settings > System
  (`front/src/routes/settings/settings-system/SettingsSystemTimezone.jsx:11,29`); the house model has no timezone
  field (`server/models/house.js`). Unset, Gladys uses `DEFAULT_TIMEZONE` `'Europe/Paris'` (`constants.js:497`, as
  `server/lib/house/house.getSunState.js:60`); so does this page. The server reads it with `variable.getValue`
  (`variable.getValue.js:12`) because `GET /api/v1/variable/:key` is admin-only (`routes.js:967-971`), and returns the
  period start instants (UTC ISO) in the summary.

## 5. Section B: overall chart

- One large line chart of the mains power; optional overlay of ticked circuits (shared y-axis). Range dropdown: **15
  min, 1 h, 6 h, 24 h, 7 d, 30 d, 1 y** (default **24 h**, Decision); it drives §6 too. Y-axis minimum 0 (§4).
- The last range and tab (§4) are remembered per browser in `localStorage`, each access wrapped in `try/catch`,
  falling back to the defaults (24 h, Live).
- **Drag-to-zoom.** The shared line options hide the toolbar
  (`front/src/components/boxs/chart/ApexChartLineOptions.js:15-17`), so this chart sets `chart.toolbar.show: true` and
  `chart.zoom.enabled: true` in its own options (shared options unchanged); reset-zoom returns to the dropdown range.
- Do not reuse the Chart box (300 states, other ranges, refetch per state: `Chart.jsx:27-36,282`, §8); reuse only
  `ApexChartComponent` (`ApexChartComponent.jsx:2,241-250`).

## 6. Section C: stacked per-circuit charts

- One compact line chart per circuit (plus Other), in the table's order, sharing one time axis and the range of §5.
  Each row has **its own y-scale** (minimum 0, Zero floor §4) and shows the current value as its label.
- Synchronisation uses ApexCharts `chart.group` (same `group` string and a unique `chart.id` per chart;
  `apexcharts@3.54.1` `src/apexcharts.js:57-60,573`, pinned at `front/package-lock.json:2396-2397`). **Nothing in
  Gladys uses `chart.group` or brush yet** (no match in `components/boxs` or the energy-monitoring route), so this is
  the first use and needs a manual browser check. Zooming one chart zooms all, and §5 shares the zoom.
- Only the bottom chart shows x-axis labels (phone: rows of about 60 px).

## 7. Data API (new fork server files)

### 7.1 Wiring and naming
New files, `hawray` in every name: `server/api/controllers/hawray-power.controller.js`,
`server/lib/hawray-power/*.js`, tests mirrored in `server/test/`. Existing files are touched only to register the
routes (`server/api/routes.js`) and the controller.

### 7.2 `GET /api/v1/hawray/power/series`
`?features=<selectors, comma-separated>&from=<ISO>&to=<ISO>&bucket=<seconds, optional>`. `authenticated: true`, not
admin — the same as `aggregated_states` (`routes.js:279-282`).

- Returns, per feature, `{ t, avg_w }` points: bucket start (UTC ISO) and the average of the samples in it (raw,
  unclamped; the page clamps at 0, §4). Empty buckets are **omitted** (the chart shows a gap); all features share one
  grid.
- Source: DuckDB `t_device_feature_state` (`device_feature_id UUID, value DOUBLE, created_at TIMESTAMPTZ`;
  `server/models/index.js:349-357`), read with `time_bucket(INTERVAL …, created_at, <origin>)`, already used on this
  table by `server/lib/energy-contract/meter.intervals.js:17`. One query for all features (`device_feature_id IN (…)`,
  `GROUP BY` feature and bucket) on the serial read queue (`models/index.js:241-243`).
- **Bucket.** Auto when omitted: the smallest step of (60, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400 s)
  giving ≤ 1,500 points per series: 24 h → 60 s, 7 d → 600 s, 30 d → 1,800 s, 1 y → 21,600 s. **Minimum 60 s in Phase
  1** (the Emporia sample interval, §9), 10 s in Phase 2. A `bucket` below the minimum or above the point cap, unknown
  selectors, `from >= to` and an empty `features` are rejected with `BadParameters`, as in
  `device.getDeviceFeaturesAggregates.js:117-135`.
- **Why not `aggregated_states`.** Without `group_by` it buckets by **row count** (`NTILE(?)`,
  `device.getDeviceFeaturesAggregates.js:4-27`), so buckets of different features cover different durations and do not
  line up; with `group_by` it uses `DATE_TRUNC` over `hour|day|week|month|year` only, with no minute (`:31-48`,
  `:133-136`), and runs separate queries per selector (`device.getDeviceFeaturesAggregatesMulti.js:21-27`).

### 7.3 `GET /api/v1/hawray/power/summary`
`?scale=live|min|hr|day|wk|mo|yr`, authenticated, not admin.

- Returns the detected roles (§3; each with device selector, name, power feature selector), the effective mains
  override, the period start instants in the house timezone (§4), and the table values: `live` → each feature's
  `last_value` and `last_value_changed`; other scales → `kwh` for the current period so far (§4, raw, unclamped).
- Writing the override: `POST /api/v1/hawray/power/settings` (Proposal for the path). Routes declare `authenticated:
  true` **without `admin: true`**: any logged-in user may write (Decision). Compare the admin-only variable routes at
  `routes.js:962-971`.
- `yr` scans up to ~9.5 M rows (~18 features, 1-minute data); speed **UNVERIFIED**, so measure before choosing
  on-demand computation or a cache.

## 8. Live updates in the page

- On mount: fetch summary and series, then add a `DEVICE.NEW_STATE` listener with
  `session.dispatcher.addListener(WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STATE, fn)`; remove it on unmount; refetch on
  `websocket.connected` (reconnect). Pattern: `hawray-controls/index.js:99-120`.
- `saveState` emits it for every state to every connected user, with no role filter, payload `{
  device_feature_selector, last_value, last_value_changed }` (`device.saveState.js:48-54`,
  `server/api/websockets/index.js:11,42-46`).
- The page **appends** the payload in place: it updates the Live column and pushes a point onto the chart series,
  ignoring selectors it does not display. It never refetches per event; `Chart.jsx:441-450` does, and that must not be
  copied (17 circuits would mean 17 refetches a minute). The right-edge point is a raw sample until the next series
  fetch replaces it with server buckets. The Min..Yr kWh is refetched at most once a minute (Proposal). The appended
  value is clamped at 0 for display (§4).

## 9. Resolution, and Phase 2 live mode

**Facts (Phase 1).** The bridge asks Emporia for the last complete minute and publishes its average every
`EMPORIA_POLL_INTERVAL`, default 60 s, minimum 30 s (`maijordomo/bridges/emporia/emporia_bridge/emporia.py:12-13,71`,
`config.py:15-16,168`). Gladys stamps the state at receipt (the float-state branch carries no `created_at`:
`server/services/mqtt/lib/handler/handleGladysMessage.js:41-47`) and `saveState` stores every state, no dedup or
throttle (`device.saveState.js:16-64`). So **Live is at best per-minute today** and anything shorter than a minute is
averaged away; the page labels Live "last minute average" until Phase 2.

### Phase 2 — pending trial result (Decision: trial first, then ~10 s on-demand)

Gate: a one-hour trial polling the 1-second scale and logging the returned `instant` against the wall clock
(`maijordomo/.claude/scratch/2026-10-13-emporia-resolution.md` §7). Go only if p95 lag ≤ ~30 s **and** channel
coverage is good (the 1-second scale often returns null for sub-channels while mains work, same file §2). Otherwise
Phase 2 is dropped.

Cross-repo contract (**all a Proposal**; nothing exists in either repo):

| Item | Proposal |
|---|---|
| Page → fork server | `POST /api/v1/hawray/power/live` every 60 s while the page is open and visible |
| Fork server → bridge | MQTT message on `maijordomo/emporia/live`, payload `{ "until": "<ISO UTC>" }` |
| Bridge behaviour | polls the 1-second scale about every 10 s until `until`; at most 15 minutes per request |
| Daily cap | about 2,000 extra calls per day |
| Output | normal `power` states on the existing features (history is finer while watched); the `index` feature is **not** touched, since a 1-second sample times a 10 s gap would alias the energy |

Prerequisite: the Phase 0 bridge fix (§10). Consequences: minimum bucket 10 s (§7.2); §4 energy from mixed 60 s and 10
s samples (to be tested).

## 10. Rollout

| Phase | Content | Status |
|---|---|---|
| 0 | **Bridge**: fix the silent-throttle bug (`pyemvue` never raises on 4xx and returns `{}`, which the bridge reads as a good poll; analyst report §4, `pyemvue.py:132-166`, **not re-checked here**). **Gladys**: raise state-history retention from the default 90 days (`front/src/actions/signup/signupSetPreferences.js:15`) to **~400 days**, set by the owner in the Gladys UI (accepted, §13). **Decision** | decided |
| 1 | The page with per-minute data: §2-§6, series and summary API (§7), websocket updates (§8) | this spec |
| 2 | Live mode (§9) | only if the trial passes |

Retention: `DEVICE_STATE_HISTORY_IN_DAYS` is one global value for **all** features (`-1` keeps forever, a non-integer
disables the purge), purged daily at 04:00 (`server/lib/device/device.purgeStates.js:13-35`,
`server/config/scheduler-jobs.js:10-12`). A 1 y chart needs ≥ 365 days, hence ~400. Emporia data alone: 17 circuits ×
(power + index) × 1,440 polls/day ≈ 49 k rows/day at 32 B raw → ~0.5-0.6 GB per year uncompressed. Compressed size:
**UNVERIFIED**. The ~400 days apply to all devices (accepted, §13).

## 11. Demo mode and testing

- **Demo fixtures** (`front/src/config/demo/`, keyed `"<method> <url>"`, values may be functions of the query:
  `config/demo/README.md`): add the series, summary and settings routes beside `aggregated_states` etc.
  (`config/demo/index.js:562-565`). The demo has power features (`config/demo/home.js:255-265,613`) but **no
  `energy_parent_id` link**, and its session never emits websocket events (`front/src/utils/DemoSession.js:7-19`). So
  the fixtures (a) define a mains, a Balance and ~6 circuits in the summary, (b) generate series from
  `from`/`to`/`bucket`, and (c) leave the live append path (§8) to a unit test of the append function.
- **Server**: tests for both endpoints and the lib at **100 % patch coverage** (AGENTS.md; CI runs `npm run
  coverage`): rejected without a session, bucket auto-selection per range, rejected parameters, gaps omitted, shared
  grid, negative values passed through raw (the clamp is front-side), kWh = Σ avg × seconds on a fixed fixture, period
  starts in a non-UTC timezone (weeks from Monday, `Europe/Paris` fallback), role detection (suffix, case, override),
  override write by a non-admin.
- **Playwright smoke test** in `DEMO_MODE`: `/dashboard/power` renders, the sidebar entry is present, a tab switch
  changes the column, the range dropdown re-renders C, range and tab survive a reload. In `front/` also `npm run
  prettier`, `eslint`, `compare-translations` (all 4 locales), `build`.

## 12. Non-goals

No cost or tariff display (the energy-monitoring integration owns prices); no device control from this page; no change
to the upstream energy-monitoring pages, the Chart box, `aggregated_states` or the energy hierarchy.

## 13. Decisions (2026-10-13)

1. Min = the current minute so far; Hr..Yr likewise; weeks start on Monday (§4).
2. Period boundaries use the house timezone, the `TIMEZONE` system variable (§4).
3. Total Usage = mains only; Balance = mains − Σ circuits, the "Other / unmonitored" row (§4).
4. Any logged-in user may write the mains override (§3, §7.3).
5. Retention ~400 days accepted: an owner setting in the UI, applies to all devices (§10).
6. Zero floor: displayed values never negative; grey at exactly 0.000 kW; charts y-min 0; raw values unchanged
   (§4-§6).
7. No circuit icons in v1; a later option stays open (§2).
8. Default range 24 h; last range and tab remembered per browser (§5).

**Remaining open questions:** the Balance suffix case (`:balance` vs `:Balance`) and whether the channel equals mains
− Σ circuits, both **UNVERIFIED** until checked on live data (§3, §4); the zap icon, the `lg` layout split, the
bucket-step list and the endpoint paths stay Proposals.

## 14. Not verified

Marked **UNVERIFIED** where they occur (§3, §4, §7.3, §9, §10). Also unconfirmed: `chart.group` with this app's zoom
in a browser (§6); that Gladys has no instantaneous-power or %-of-total view (grep-level only).

