# Hawray Power page (`/dashboard/power`)

> **Living specification — source of truth.** A fork-only "Power" page: an Emporia-app-style power
> table plus time-aligned per-circuit charts, to watch power change as appliances switch.
> **Rule: any PR that changes one of these behaviors or contracts modifies this file in the same
> diff** — spec first, code second.
>
> Status: **Phase 1 built and reviewed.** Server API (§7) merged on `hawray-power-page` (`83de3364`); front on branch
> `hawray-power-page-front` (`f5280c28`), not merged. Other citations: `hawray@d0f1964a`. Front files are `F:<file>:line`,
> `F` = `hawray-power-page-front:front/src/routes/hawray-power/`; §7 server files are `<file>:line` in
> `server/lib/hawray-power/`. **Decision** = taken by the owner on 2026-10-13; **Proposal** = undecided
> (Phase 2 only); **UNVERIFIED** = not confirmed against code or a running system.

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
| Add a `NAV_ITEMS` entry `{ href: '/dashboard/power', icon: 'zap', labelKey: 'hawrayPower.nav', isActive: url => url.startsWith('/dashboard/power') }` (as built, `hawray-power-page-front:front/src/components/header/index.jsx:91-96`) | `header/index.jsx:84-89` (Controls entry) |
| Import the page and add `<SafeAsyncRoute path="/dashboard/power" component={PowerPage} />` | `front/src/components/app.jsx:52-53`, `:446-447` |
| New page folder `front/src/routes/hawray-power/` (data loading: `connect('httpClient,session,user')` + `withIntlAsProp`) | pattern: `front/src/routes/hawray-controls/index.js:142` |
| New `hawrayPower` object in `en.json`, `fr.json`, `de.json`, `es.json`, placed after `hawrayHomekitSceneSwitches` (line 19) and before `hawrayControls` (line 7183, the last key) | `front/src/config/i18n/*.json` |

- Visible to every logged-in user, like Controls: no `adminOnly` (only Scenes has it, `:115`; the sidebar filters on
  it, `:238`) and no role guard on the route (`app.jsx:446-447`).
- Layout, Bootstrap **4.1.0** only (no `.stretched-link`, no 4.3+ utilities). Phone: one column, order A, B, C; the
  table keeps name, value, %. Desktop (`lg` and up): A (5/12) and B (7/12) side by side, C full width below (`hawray-power-page-front:front/src/routes/hawray-power/PowerPage.jsx:102-105,124`).
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
- **Drag-to-zoom.** The shared line options hide the toolbar (`front/src/components/boxs/chart/ApexChartLineOptions.js:15-17`),
  so the page builds its own (`F:powerChartOptions.js:32-140`; shared options unchanged). The mains chart has a zoom and
  reset toolbar (`F:powerChartOptions.js:63-75`, `PowerMainChart.jsx:58`), the rows none (`F:PowerStackedCharts.jsx:50`).
  Reset returns to the pinned window (§8).
- The **mains chart is outside `chart.group`** (§6), because the group sync copies one chart's height to all of them. Its zoom
  reaches the rows, and theirs reaches it, through page state (`F:powerChartOptions.js:9-12`, `index.js:175-178`,
  `PowerLineChart.jsx:9-12`).
- Not the Chart box (`Chart.jsx:27-36,282`, §8): the page drives ApexCharts directly (`F:powerChartOptions.js:1,143-147`).

## 6. Section C: stacked per-circuit charts

- One compact line chart per circuit (plus Other) on the range of §5, each with **its own y-scale** (minimum 0, Zero floor
  §4) and the current value as its label.
- The rows share `chart.group` `hawray-power`, each with a unique `chart.id` (`F:powerChartOptions.js:13,30,49`;
  `PowerStackedCharts.jsx:52`; `apexcharts@3.54.1` `src/apexcharts.js:57-60,573`, pinned at
  `front/package-lock.json:2396-2397`). Nothing else in Gladys uses `chart.group` or brush (no match in `components/boxs` or
  the energy-monitoring route). A zoom or reset on any chart reaches the page (`F:powerChartOptions.js:81-87`,
  `index.js:175-178`), which sets the x range of every chart and of the axis strip; charts update with
  `updateSyncedCharts=false`, keeping their own height and labels (`F:PowerLineChart.jsx:63-64`).
- Each row is a 64 px sparkline with the current W as its label (`F:powerChartOptions.js:54-57`,
  `PowerStackedCharts.jsx:36-46`). Order: circuits as sorted at the last summary fetch, **fixed until the next one** so live
  values do not reorder the rows (`F:index.js:74`, `helpers.js:199-206`, `PowerPage.jsx:58-62`), then Other.
- **Time axis.** An HTML strip under the last row (`F:PowerTimeAxis.jsx:10-37`), not a chart axis, so labels line up with the
  plots at any width and after a zoom. It takes the shown x range (`F:PowerStackedCharts.jsx:23,61`), recomputes on resize
  (`F:PowerTimeAxis.jsx:13-19`) and snaps ticks to "nice" local-time boundaries from a per-span ladder, **at most one label
  per 70 px** (`F:helpers.js:220,229-238,306-326`).

## 7. Data API (new fork server files)

### 7.1 Wiring and naming
New files, `hawray` in every name: `server/api/controllers/hawray-power.controller.js`, `server/lib/hawray-power/*.js`,
tests mirrored in `server/test/`. Existing files only register the routes (`server/api/routes.js:1182-1194`).

### 7.2 `GET /api/v1/hawray/power/series`
`?features=<selectors, comma-separated>&from=<ISO>&to=<ISO>&bucket=<seconds, optional>`. `authenticated: true`, not
admin (`routes.js:1183-1186`) — the same as `aggregated_states` (`routes.js:279-282`). Response:
`{ bucket_seconds, series: { "<feature selector>": [ { t, avg_w } ] } }` (`series.js:174-177`).

- `t` is the bucket start (UTC ISO, `series.js:165`); `avg_w` the average of the samples in it, raw and unclamped (the page
  clamps at 0, §4); the window is `[from, to)` (`series.js:23-24`). Every requested selector has a key, `[]` when it has no
  samples (`series.js:162,171-173`); empty buckets are **omitted** (a gap); points are ordered by time (`:26`).
- Buckets are **aligned on the Unix epoch** (`constants.js:28`, `series.js:156`), so all features share one grid.

Validation, each failure a `BadParameters`:

| Parameter | Rule | Source |
|---|---|---|
| `features` | required, comma-separated, trimmed and de-duplicated; **≤ 64**; each selector must exist and be a **power feature** (`energy-sensor/power` or `switch/power`) | `series.js:69-97`, `roles.js:19-25`, `constants.js:19` |
| `from`, `to` | required ISO dates; `from` < `to`; **span ≤ 400 days** | `series.js:52-58,143-150`, `constants.js:20` |
| `bucket` | optional; an **integer from 60 to 31,536,000** seconds; the epoch-aligned grid of `[from, to]` must hold **≤ 1,500 points** | `series.js:111-130`, `constants.js:13,15,18` |

- Source: DuckDB `t_device_feature_state` (`device_feature_id UUID, value DOUBLE, created_at TIMESTAMPTZ`;
  `server/models/index.js:349-357`), read with `time_bucket(INTERVAL …, created_at, <origin>)`, already used on this table by
  `server/lib/energy-contract/meter.intervals.js:17`. One query for all features (`device_feature_id IN (…)`, `GROUP BY`
  feature and bucket, `series.js:15-27,154-160`) on the serial read queue (`models/index.js:241-243`).
- **Bucket.** Auto when omitted: the smallest step of (60, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400 s) giving ≤
  1,500 points per series (`series.js:113`, `constants.js:14-15`): 24 h → 60 s, 7 d → 600 s, 30 d → 1,800 s, 1 y → 21,600 s.
  No step fits → `BadParameters` (`series.js:114-116`). **Minimum 60 s in Phase 1** (the Emporia sample interval, §9), 10 s in
  Phase 2.
- **Why not `aggregated_states`.** Without `group_by` it buckets by **row count** (`NTILE(?)`,
  `device.getDeviceFeaturesAggregates.js:4-27`), so buckets of different features cover different durations and do not
  line up; with `group_by` it uses `DATE_TRUNC` over `hour|day|week|month|year` only, with no minute (`:31-48`,
  `:133-136`), and runs separate queries per selector (`device.getDeviceFeaturesAggregatesMulti.js:21-27`).

### 7.3 `GET /api/v1/hawray/power/summary`
`?scale=live|min|hr|day|wk|mo|yr`, `authenticated: true`, not admin (`routes.js:1187-1190`). `scale` defaults to `live`
(`hawray-power.controller.js:32`); another value is `BadParameters` (`summary.js:69-71`). Response
(`summary.js:109-116`): `{ scale, timezone, period_starts, mains_override, roles }`.

- `timezone`: the house IANA zone of §4 (`period.js:13-16`). `period_starts`: `{ min, hr, day, wk, mo, yr }`, UTC ISO
  instants, all six on every call (`period.js:46`). **Min and Hr are computed from the UTC instant**, since a local wall-clock
  lookup picks the first pass of the repeated hour on a DST fall-back day (`period.js:29-35`); **day, wk, mo and yr are local
  midnights in the house timezone**, weeks from Monday (`period.js:36-44`).
- `mains_override`: the stored selector only while in effect, else `null` (`summary.js:113-114`, `roles.js:121-128`). **An
  invalid stored override** (device gone or no power feature) **falls back to auto-detect** (`roles.js:121-132`).
- `roles[]`: mains, balance, circuits, plugs, in that order, the first two only if found (`summary.js:79-84`). Each entry is
  `{ role, device_selector, name, power_feature_selector, last_value, last_value_changed, kwh }` (`summary.js:98-106`); `role`
  is `mains|balance|circuit|plug` (§3, `roles.js:110-158`), `name` the device name.
- `last_value` and `last_value_changed` come back on **every scale**, as held by the state manager (`summary.js:103-104`).
  `kwh` is `null` on `live`, otherwise a number, 0 without samples (`summary.js:105`): Σ over 1-minute buckets of the bucket
  average × 60 s ÷ 3.6e6, over [period start, now), raw (`summary.js:9-28,53,89-93`, `constants.js:22-25`).
- **Speed.** Measured 2026-10-13 on 9.46 M rows: `yr` summary 147-184 ms, 1 y series 93-111 ms; on demand, no cache.

### 7.4 `POST /api/v1/hawray/power/settings`
Body `{ mains_device_selector: string | null }`, response `{ mains_override }` (`hawray-power.controller.js:43-44`,
`settings.js:16-28`; route `routes.js:1191-1194`). `null`, absent or `""` clears the override (`{ mains_override: null }`,
`settings.js:18-21`); a non-string is `BadParameters` (`:22-24`); **the device must exist and have a power feature**, else
`BadParameters` (`roles.js:88-97`). Stored in the variable `HAWRAY_POWER_MAINS_DEVICE` (`constants.js:4`,
`settings.js:19,26`). `authenticated: true` **without `admin: true`**: any logged-in user may write (Decision), unlike the
variable routes (`routes.js:962-971`).

## 8. Live updates in the page

- On mount: fetch the summary, then the series (`F:index.js:125-128`); add `DEVICE.NEW_STATE` and `websocket.connected`
  listeners, removed on unmount (`F:index.js:216-228`); a reconnect refetches both (`F:index.js:134-142`). Pattern:
  `hawray-controls/index.js:99-120`.
- `saveState` emits it for every state to every connected user, with no role filter, payload `{
  device_feature_selector, last_value, last_value_changed }` (`device.saveState.js:48-54`,
  `server/api/websockets/index.js:11,42-46`).
- **Append.** A payload for a displayed feature updates the Live column (`F:helpers.js:123-138`) and pushes the raw point
  `{ t: last_value_changed, avg_w: last_value }` onto the series (`F:helpers.js:187-197`); other selectors are ignored
  (`F:index.js:147-149`). No refetch per event: `Chart.jsx:441-450` does, and that must not be copied. **No raw append when
  the bucket is over 60 s** (`F:helpers.js:143-152,189`). The appended value is clamped at 0 for display (§4).
- **Live window.** The x range is pinned to [now − range, now] (`F:index.js:250-251`, `helpers.js:150`). `now` advances on
  each displayed sample (`F:index.js:150-152`) and on a 60 s timer (`F:helpers.js:148`, `index.js:182-187,217`); points older
  than the window start are trimmed (`F:helpers.js:160-183`). A manual zoom is preserved: while zoomed the charts use the zoom
  range (`F:PowerLineChart.jsx:9-12`, `index.js:175-178`); changing the range drops it (`F:index.js:170`).
- **Refetch.** Each 60 s tick refetches the series once the last fetch is older than `min(bucket_seconds, 900 s)` (900 s for
  a 60 s bucket): at least every 15 min, which corrects missed events (`F:helpers.js:146,154-157`, `index.js:188-191`).
  The Min..Yr summary is refetched on a sample at most once a minute (`F:helpers.js:24`, `index.js:156-158`).

## 9. Resolution, and Phase 2 live mode

**Facts (Phase 1).** The bridge asks Emporia for the last complete minute and publishes its average every
`EMPORIA_POLL_INTERVAL`, default 60 s, minimum 30 s (`maijordomo/bridges/emporia/emporia_bridge/emporia.py:12-13,71`,
`config.py:15-16,168`). Gladys stamps the state at receipt (the float-state branch carries no `created_at`:
`server/services/mqtt/lib/handler/handleGladysMessage.js:41-47`) and `saveState` stores every state, no dedup or
throttle (`device.saveState.js:16-64`). So **Live is at best per-minute today** and anything shorter than a minute is
averaged away; the page labels Live "last minute average" until Phase 2.

### Phase 2 — live mode: unblocked, pending its own design

**Trial result (Decision: trial first, then ~10 s on-demand).** The step test of 2026-10-13 measured Emporia 1 s data
freshness at ~2-3 s through the API; the 1-hour trial at 10 s polling had 359/359 HTTP 200, all 17 channels present
(gate: `maijordomo/.claude/scratch/2026-10-13-emporia-resolution.md` §7, §2; raw logs not in this repo).

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
| 1 | The page with per-minute data: §2-§6, series and summary API (§7), websocket updates (§8) | server API merged on `hawray-power-page`; front on branch `hawray-power-page-front` |
| 2 | Live mode (§9) | unblocked by the trial; needs its own design |

Retention: `DEVICE_STATE_HISTORY_IN_DAYS` is one global value for **all** features (`-1` keeps forever, a non-integer
disables the purge), purged daily at 04:00 (`server/lib/device/device.purgeStates.js:13-35`,
`server/config/scheduler-jobs.js:10-12`). A 1 y chart needs ≥ 365 days, hence ~400. Emporia data alone: 17 circuits ×
(power + index) × 1,440 polls/day ≈ 49 k rows/day at 32 B raw → ~0.5-0.6 GB per year uncompressed. Compressed size:
**UNVERIFIED**. The ~400 days apply to all devices (accepted, §13).

## 11. Demo mode and testing

- **Demo fixtures**: `hawray-power-page-front:front/src/config/demo/power.js:177-179` answers the three routes (spread in at
  `config/demo/index.js:585`). The demo has power features (`config/demo/home.js:255-265,613`) but **no
  `energy_parent_id` link**, and its session never emits websocket events (`front/src/utils/DemoSession.js:7-19`), so the
  fixtures define a mains, a Balance and ~6 circuits and generate series from `from`/`to`/`bucket`; the live append path
  (§8) is covered by unit tests.
- **Server** (as built): 74 tests (`grep it(`) in `server/test/lib/hawray-power/` and
  `server/test/controllers/hawray-power/`, run by `npm run coverage`; 100 % patch coverage as reported at review.
- **Front unit tests** (as built): 26 tests of the pure helpers (live append and trimming, refresh timing, stack order,
  time-axis ticks). From `front/`, Node 22.7+ or 24: `node --test src/routes/hawray-power/helpers.test.js`
  (`F:helpers.test.js:1-3`). **Not wired into any npm script; CI does not run them.**
- **Playwright smoke** in `DEMO_MODE`: 13 checks, 13/13 in the last recorded run (table, tabs, range, best-effort zoom
  propagation, reload persistence, 390 px layout, live window and zoom across the tick, chart sizes and axis
  alignment after a tick, and no axis-label overlap at 390 and 1280 px for every range). **The script is not in the
  repo**: it sits in the gitignored `.claude/scratch/` of the author's machine; CI does not run it.
- In `front/` also `npm run prettier`, `eslint`, `compare-translations` (4 locales), `build` (AGENTS.md).

## 12. Non-goals

No cost or tariff display (the energy-monitoring integration owns prices); no device control from this page; no change
to the upstream energy-monitoring pages, the Chart box, `aggregated_states` or the energy hierarchy.

## 13. Decisions (2026-10-13)

1. Min = the current minute so far; Hr..Yr likewise; weeks start on Monday (§4).
2. Period boundaries use the house timezone, the `TIMEZONE` system variable (§4).
3. Total Usage = mains only; Balance = mains − Σ circuits, the "Other / unmonitored" row (§4).
4. Any logged-in user may write the mains override (§3, §7.4).
5. Retention ~400 days accepted: an owner setting in the UI, applies to all devices (§10).
6. Zero floor: never-negative display, grey at exactly 0.000 kW, charts y-min 0, raw values unchanged (§4-§6).
7. No circuit icons in v1; a later option stays open (§2).
8. Default range 24 h; last range and tab remembered per browser (§5).

**Remaining open questions:** the Balance suffix case (`:balance` vs `:Balance`) and whether the channel equals mains
− Σ circuits, both **UNVERIFIED** until checked on live data (§3, §4). **Phase 2 live mode:** unblocked by the 2026-10-13
trial, pending its own design (§9).

## 14. Not verified

Marked **UNVERIFIED** where they occur (§3, §4, §9, §10). Also unconfirmed: that Gladys has no instantaneous-power or
%-of-total view (grep-level only); the timings of §7.3 and the trial of §9 (no raw logs here); `chart.group` zoom
propagation (a best-effort Playwright check only, §11).
