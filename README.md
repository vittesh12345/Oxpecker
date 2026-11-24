# Oxpecker

An interactive pay and scheduling simulator for working out shift trades, tip splits and wage
talks before they turn into a standoff.

Each person sets **private limits** on pay and availability. Oxpecker only proposes arrangements
that sit inside everyone's limits, shows each person their **projected earnings, hours and
trade-offs** under every proposal, and reveals a deal only when everyone has said yes to it in
private.

It runs entirely in the browser. Nothing anyone enters leaves the device.

## The eight scenarios

| Scenario | Type | People | What's on the table |
| --- | --- | --- | --- |
| The Saturday swap | Shift trade | 2 coworkers | Who closes Saturday, who opens Sunday, a make-up shift |
| Holiday weekend cover | Shift trade | 3 coworkers | Three premium-pay shifts nobody wants two of |
| The last bus home | Shift trade | 2 coworkers | Weekend closes that carry a night differential |
| A share for the kitchen | Tip split | 3 coworkers | Front-of-house and back-of-house shares of a tip pool |
| The tip jar | Tip split | 3 coworkers | Equal thirds, by hours, by day, or a blend |
| Friday dinner | Tip split | 2 coworkers | Who works the high-tip dinners, and whether those tips are shared |
| Keys without the pay | Wage talk | Worker and manager | Hourly rate, guaranteed hours, keyholder closes |
| The outside offer | Wage talk | Worker and manager | Hourly rate, guaranteed hours, weekends a month |

Every scenario has a "Use your own names and numbers" panel. Replace the practice names, wages,
hours and tip totals with real ones and the same flow works for an actual disagreement.

## How a session runs

1. **Private limits.** Each person, in turn, sets the least pay they can accept, the most hours
   they can work, and the shifts they can't do. A cover screen separates turns on a shared device,
   and private screens use a distinct dark patterned background so the room can tell when to look
   away. Each person also sees how many arrangements their own limits leave open.
2. **Proposals.** Up to three arrangements that respect every limit are shown to the group as
   plain terms.
3. **Private answers.** Each person sees what every proposal means for them (pay, hours, shifts,
   what they gain and give up, all against how things stand today) and answers yes or no. A "no"
   can carry a one-tap reason such as "Pay is too low", which tightens that person's own limit for
   the next round.
4. **Outcome.** A proposal everyone accepted becomes the deal. Otherwise the group can see
   different options, revisit limits privately, or end with things as they are.

Two ways to play:

- **Together, on one device.** Everyone at the table takes their private turns in sequence.
- **Solo practice.** You speak for one person and the tool plays the rest. The simulated side has
  hidden limits of its own, starts out choosy, accepts more as rounds go on, and will give up to
  12% on a numeric limit when nothing overlaps. It never moves on availability.

## What "private" means here

- Limits, priorities and yes/no answers are held in memory for the session and are never written
  to storage.
- The only place that reads everyone's limits together is the session engine
  (`src/session/session.ts`). Screens are given one person's values at a time.
- When no arrangement fits everyone, each person is told privately whether one of *their own*
  limits is what the closest arrangement misses, and by how much. Nobody is shown anyone else's.
- When a round produces no match, who declined what is not shown.

One thing the tool cannot hide: a proposal that appears on screen is, by construction, inside
everyone's limits. That is the point of it, but it does tell the room something.

## How proposals are chosen

Every scenario is small enough to enumerate. The engine lists every valid combination of options,
projects pay and hours for each person, and drops any combination that breaks anyone's limit.

What remains is ranked by **leximin**: each person's result is scored from 0 to 1 relative to the
other feasible arrangements, using the priority they chose in private (take-home pay, time off, or
both), and the arrangement whose worst-off person does best comes first. Ties go to the higher
average, then to the arrangement that changes the least. A round offers the top options while
preferring ones that differ from each other in more than one respect, so they are real
alternatives.

## Practice log

Finishing a session offers a short debrief: how fair the result felt (1 to 5), an optional
participant code, and a note on what the tool should have handled differently. Saved entries
record the scenario, mode, outcome, rounds and duration. They never include limits or answers.

The log lives in the browser's local storage on that device, and can be exported as CSV for
analysis across sessions and participants.

## Run it

Requires Node 22.12 or newer.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

`npm run build` produces a single self-contained `dist/index.html`. Open it directly, put it on a
USB stick, or host it anywhere static. It needs no server and works offline (fonts fall back to
system ones without a connection).

### Deploying to GitHub Pages

A workflow is included at `.github/workflows/pages.yml`. In the repository settings, set
**Pages → Source** to **GitHub Actions**, then run the "Deploy to GitHub Pages" workflow from the
Actions tab.

## Project layout

```
src/engine/      Pure negotiation logic: enumeration, limits, ranking, near misses, formatting
src/scenarios/   The eight scenarios and the helpers they share
src/session/     The session state machine and the practice log
src/ui/          React screens
tests/           Vitest suites for the engine, every scenario and the session flow
```

The engine and session modules have no dependency on React or the browser, which is what lets the
tests check properties such as "no proposal ever breaks anyone's limit" across random limits in
every scenario.

## Adding a scenario

Create a file in `src/scenarios/` that exports a `ScenarioTemplate` and add it to the list in
`src/scenarios/index.ts`. A template declares its editable facts and a `build(facts)` function
that returns:

- the people involved, each with the numbers to show them, their limits and their priorities
- the issues and their options, plus which options are the status quo
- an `evaluate(choices)` function returning projected numbers and shifts for each person

The scenario tests run against every template automatically. They require a valid status quo, a
conflict under the suggested limits, and at least three arrangements that resolve it.

## Limits of the tool

- It is a practice and discussion aid, not legal or financial advice. Tip-pooling rules, overtime
  and scheduling law vary by place; check what applies before changing a real arrangement.
- Pay figures are gross estimates from hourly wage, hours, differentials and tips. Tax, deductions
  and overtime premiums are not modeled.
- Proposals are limited to the options a scenario defines. It will not invent a term nobody listed.

## The name

Oxpeckers are birds that feed on the ticks of the large animals they ride on: an arrangement both
sides get something out of.
