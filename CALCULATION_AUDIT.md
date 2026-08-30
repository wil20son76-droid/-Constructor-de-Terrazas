# Calculation audit

This document records the technical audit performed on every calculation
engine in the app: what formula was in place before, what was wrong with
it (if anything), the corrected formula, a manually-derived worked
example, and the expected vs. actual result. Every claim below is backed
by an automated test — see the "Test" column/reference for each section.

Expected values in the referenced tests are derived by hand from the
formulas documented here, never copied from running the application.

---

## 1. Geometry (`src/geometry/`)

**Status: no formula defects found.** Area (shoelace formula) and
perimeter were already correct and are covered by
`src/geometry/geometry.test.ts`. One usability gap was closed: editing an
edge's length on an arbitrary (non-rectangular) polygon via
`editEdgeLength` is well-defined but can skew adjacent edges — a rectangle
now uses the dedicated `resizeRectangleEdge`, which keeps it a clean
rectangle. Not a bug in the original function, just a UX-correctness
addition, documented in its own doc comment.

## 2. Reglar CC (centre-to-centre) spacing — **BUG FOUND AND FIXED**

**Previous formula:** `computeRowPositions` (edge-to-edge mode) placed a
member every `spacing` mm starting from one edge, then added one final
member exactly at the far edge — leaving the *last* bay a different
(possibly much shorter) length than every other bay.

**Problem found:** the spec requires the *real* CC to never exceed the
configured maximum, and to reflect actual carpentry practice: an even
number of equal bays, not N-1 full bays plus one odd leftover bay. The
previous algorithm technically never exceeded the max either, but its
"real CC" was ambiguous (all bays were exactly `spacing` except the last,
which could be anywhere from 0 to `spacing` mm) — there was no single "CC
verklig" value to report, and the UI had no way to show one.

**Correct formula** (`computeUniformSpacing`, `src/structural/memberLayout.ts`):

```
numberOfSpaces = ceil(span / maxSpacing)
realSpacing    = span / numberOfSpaces      // always <= maxSpacing
numberOfMembers = numberOfSpaces + 1
```

Because `numberOfSpaces` is rounded **up**, dividing the span by it can
only ever produce a `realSpacing` less than or equal to `maxSpacing` —
this is a mathematical guarantee, not a runtime check (though a runtime
safety-net assertion was still added in `validation/index.ts`, in case a
future change breaks the invariant).

**Manual example:** span = 14 000 mm, maxCC = 600 mm.
`numberOfSpaces = ceil(14000/600) = ceil(23.333) = 24`.
`realSpacing = 14000/24 = 583.333... mm` (≤ 600 mm ✓).
`numberOfMembers = 25`.

**Expected vs actual:** `numberOfSpaces=24`, `realSpacingMm≈583.33`,
`numberOfMembers=25` — **PASS** (`src/structural/joists.test.ts`,
`src/integration-14x7.test.ts`).

### 2b. Second bug found while wiring the above into `computeReglar`

**Problem found:** the CC-info span for reglar was computed with
`rotatedBoundingBox(points, angle)` — the *board* direction's rotation —
when it needed `rotatedBoundingBox(points, angle + 90)` to match the
rotation `computePerpendicularMemberLines` actually uses internally to
place the joists. This silently reported the CC plan for the *wrong axis*
(the board-length direction instead of the board-width/CC direction) —
for a rectangular deck the reported "CC verklig" would have been computed
against the wrong span entirely.

**Fix:** use `angle + 90` for reglar's CC bbox (matching bärlinor's use of
`angle`, which was already correct because `computeBarlinor` places beams
directly along `angle`). See the comments in `computeReglar` /
`computeBarlinor` in `src/structural/index.ts`.

**Test:** `src/structural/joists.test.ts` (`computeReglar` places joists
edge-to-edge... with uniform CC) and `src/integration-14x7.test.ts` fail
without the fix (CC span comes out as the depth instead of the width) and
pass with it. **PASS**.

## 3. Trall (deck board) row layout — **BUG FOUND AND FIXED**

**Previous formula:** boards were laid out "centered" — rows started at
`min + boardWidth/2` and stopped once the next centre would exceed
`max - boardWidth/2`. This never reported whether the last row needed
cutting, never reported the effective width used, and (more importantly)
is not how a crew actually lays decking: boards are laid flush from one
edge, and the **last** row is the one that gets ripped to fit, not
silently left with an oversized gap.

**Correct formula** (`planBoardRows`, `src/deck/boardLayout.ts`):

```
pitch = boardWidth + gap
fullRowCount = floor((span + gap) / pitch)
usedWidth    = fullRowCount * pitch - gap
remaining    = span - usedWidth
if remaining > gap:
    lastRowWidth = remaining - gap   // a cut/ripped board
    needsCut = true
else:
    // remaining <= gap is left as a small margin, not a sliver board
```

**Manual example:** span = 7000 mm, boardWidth = 120 mm, gap = 5 mm.
`pitch = 125`. `fullRowCount = floor(7005/125) = 56`.
`usedWidth = 56*125 - 5 = 6995`. `remaining = 5`, which is **not** > gap
(5), so no cut row: exactly 56 full-width rows, matching the spec's
14 000×7 000 mm worked example.

Second example with a genuine cut: span = 7050 mm (all else equal).
`fullRowCount = floor(7055/125) = 56`. `usedWidth = 6995`.
`remaining = 55 > gap(5)` → `lastRowWidth = 55 - 5 = 50 mm`, `needsCut = true`.

**Test:** `src/deck/boardLayout.test.ts` (`planBoardRows`,
`computeBoardLayout`). **PASS**.

## 4. Cut-length optimisation — **CRITICAL BUG FOUND AND FIXED**

**Previous formula:** `chooseBestStockLength` tried each available stock
length as one *uniform* bin size for the whole job and picked whichever
minimised `binCount * length`. Any piece longer than the candidate length
was silently placed in its own "bin" flagged with **zero waste**, even
though it is physically impossible to cut that piece from that stock
length.

**Problem found:** for the mandatory example `5.0 m + 4.0 m + 3.0 m`
against stock `[3600, 4200, 4800, 5400]`, trying the uniform candidate
`4800 mm`: the `5000 mm` piece (which cannot fit in *any* candidate ≤
5400 either, but especially not 4800) was reported as fitting with 0
waste, corrupting the "cheapest" comparison — the algorithm would have
picked the impossible 4800 mm-uniform plan as "best" purely because its
naive per-bin accounting undercounted the impossible piece's true cost.
More generally, forcing **one uniform stock length for an entire cutting
job** is itself wrong whenever pieces of very different lengths are mixed
— real purchasing mixes stock lengths.

**Correct algorithm** (`packSegments`, `src/materials/cutOptimization.ts`):
best-fit-decreasing over a **mixed** set of stock lengths, with one-step
lookahead when a new board must be opened:

1. Sort pieces largest→smallest.
2. For each piece, first try every **already-open** board and use the one
   with the least remaining capacity that still fits (reuses offcuts).
3. If none fits, open a new board. Instead of always buying the shortest
   length that fits the current piece (which starves a piece that could
   have shared a longer board with what comes next), simulate greedily
   packing the next not-yet-placed pieces into each candidate length and
   pick whichever leaves the least waste.

**Manual examples (the 3 mandatory cases):**

- **2.1 m + 2.1 m**, stock `[3600,4200,4800,5400]`: opening a bin for the
  first 2100 mm piece, simulating the second 2100 mm piece against it:
  3600→waste 1500 (doesn't fit), **4200→waste 0 (fits exactly)**,
  4800→waste 600, 5400→waste 1200. Picks 4200. **Result: 1 board × 4.2 m,
  0 waste.**
- **3.0 m + 1.8 m**: simulating 1800 against each candidate's leftover
  after 3000: 3600→600 (no fit, waste 600), 4200→1200 (no fit, waste
  1200), **4800→1800 (fits exactly, waste 0)**, 5400→600. Picks 4800.
  **Result: 1 board × 4.8 m, 0 waste.**
- **5.0 m + 4.0 m + 3.0 m**: 5000 only fits 5400 (offcut 400). 4000 needs
  a new board; simulating 3000 against the leftover of each candidate:
  4200→200, 4800→800, 5400→1400 → picks 4200 (offcut 200). 3000 needs a
  new board, nothing left to simulate against → shortest sufficient
  length wins, 3600 (offcut 600). **Result: 3 boards (5400+4200+3600 =
  13 200 mm total, 1 200 mm waste)** — strictly better than forcing one
  uniform length (e.g. all-5400 → 3×5400 = 16 200 mm) and never treats an
  over-length piece as fitting a too-short board.

**Test:** `src/materials/cutOptimization.test.ts` (`packSegments — the 3
mandatory worked examples`). **PASS** for all three.

### 4b. Splicing a run longer than the longest available stock length

**Problem found (related):** before this audit, a continuous run longer
than every available stock length (e.g. a 14 m board row with only 5.4 m
boards on hand) fell into the same "own bin, zero waste" trap described
above — the app would report needing only 1 impossible board instead of
the several real, spliced boards a crew would actually cut and buy.

**Correct formula** (`buildPieceSegments`): split each run into
`ceil(length / maxAvailableLength)` **equal** segments before handing them
to the packer (equal, not "as long as possible + one short leftover", to
match the common practice of staggering butt joints evenly across a run).

**Manual example:** a 14 000 mm trall row, longest stock 5 400 mm.
`segments = ceil(14000/5400) = 3`, each `14000/3 = 4666.667 mm`. Only
4800 mm and 5400 mm stock is ≥ 4666.667 mm; since two 4666.667 mm segments
can never share one board (`2 × 4666.667 = 9333.3 > 6000`, the largest
stock in this example set), every segment gets its own board, and 4800 mm
(offcut 133.33 mm) always beats 5400 mm (offcut 733.33 mm). **Result: 3
boards × 4800 mm per row.** For the full 14×7 m deck (56 rows): **168
boards × 4.8 m = 806.4 m purchased, 22.4 m (2.78%) waste.**

**Test:** `src/materials/cutOptimization.test.ts` ("prices a too-long run
as the multiple spliced boards..."), `src/integration-14x7.test.ts`
(trall section). **PASS**.

## 5. Structural member geometry (reglar / bärlinor / plintar)

**Status: already correct, extended with explicit fields.** Each joist
and beam already carried real `start`/`end`/`lengthMm` (not just a count);
`dimension` (e.g. `"45x120"`) and, for footings, `beamId` (which bärlina
each plint supports) were added so the debug inspector and BOM can trace
every element back to its real geometry and its purchased stock.

**Test:** `src/structural/joists.test.ts`, `beams.test.ts`,
`footings.test.ts`. **PASS**.

## 6. Fasteners (tornillos) — **BUG FOUND AND FIXED**

**Previous formula:** `countBoardJoistIntersections` used a strict
interior-crossing test (`t`, `u` strictly between `0` and `1`, excluding
the endpoints) between every board segment and every joist segment.

**Problem found:** a board's end frequently lands **exactly on** a joist
— most obviously the two outermost joists, which sit flush with the
deck's edge, exactly where every board's endpoint is. The strict-interior
test excluded these touch points as "not crossing", undercounting real
fastening points. On the 14×7 m worked example this undercounted by
`2 joists × 56 boards = 112` intersections (1288 found vs. 1400 real),
which cascaded into buying one fewer screw package and a ~249 kr error in
the material total.

**Correct formula:** boards and joists are always perpendicular (joist
run direction is `boardAngle + 90`), so they can never be collinear —
there is no touching-without-crossing ambiguity to guard against. The
crossing test was changed to be **inclusive** of the segment endpoints
(`t`, `u` in `[0,1]` with a small epsilon), so an edge joist flush with a
board's end is correctly counted.

**Manual example:** 14×7 m deck, 56 boards (each spanning the full 14 m)
× 25 joists (each spanning the full 7 m), no notches. Every board crosses
every joist exactly once → `56 × 25 = 1400` intersections. (This equals
the naive `boards.length * joists.length` shortcut *only* because this
particular deck is a plain, un-notched rectangle — see below for cases
where it must NOT equal that shortcut.)

**Test:** `src/integration-14x7.test.ts` ("counts REAL board/joist segment
intersections..."). **PASS** (2800 screws = 1400 × 2, purchased 14
packages of 200 = 3486 kr).

### 6b. L-shape / U-shape: real intersections vs. the naive shortcut

For a notched (concave) polygon, `boards.length * joists.length` is
**wrong** — it assumes every joist crosses every board row, which is
false wherever the notch removes material one of them occupies.

**Manual example (U-shape, notch in the middle of one edge):** 10 000 ×
6 000 mm deck, 4 000 × 2 000 mm notch cut from the middle of one edge.
80 board segments (40 full-width rows below the notch + 20 rows split
into 2 segments each within the notch band), 18 joists (CC 600 mm), of
which 6 fall inside the notch's x-range and are shortened.

- Full-width rows (40): crossed by all 18 joists → `40 × 18 = 720`.
- Notch-band rows (20): crossed only by the 12 joists **outside** the
  notch x-range (the 6 inside ones are clipped away from that band) →
  `20 × 12 = 240`.
- **Real total: 960.**
- **Naive shortcut: `80 × 18 = 1440`** — 480 too many.

**Test:** `src/integration-ushape.test.ts` ("matches the hand-derived
real intersection count of 960 (not the naive 1440)"),
`src/integration-lshape.test.ts` ("real intersection count is strictly
less than the naive boards*joists shortcut"). **PASS**.

Step-Clip / T-clip systems remain fully independent and configurable
(`clipsPerIntersection`, `clipMaterialId` on `FastenerSystem`) — confirmed
unchanged by `src/materials/fasteners.test.ts`.

## 7. Kantbrädor — edge classification added

**Previous behaviour:** any polygon edge listed in an `EdgeBoardRun`'s
`edgeIndices` was priced, with no distinction between an external edge, a
wall edge, a stair edge, or one the user deliberately left untrimmed.

**Fix:** `classifyEdges` (`src/deck/edgeClassification.ts`) classifies
every edge as `external | wall | stair | open` (a stair edge is detected
automatically from `Stair.edgeIndex`; wall/open edges are explicit lists
on `DeckLevel`), and `computeLevelBom` filters every edge-board run
through `filterEdgeBoardEligible`, which keeps only `external` edges.

**Manual example:** a 2000×1000 mm rectangle, edge 1 (1000 mm, the right
side) marked as a wall, edge 3 (1000 mm, the left side) carrying a stair.
An edge-board run listing all 4 edges (0,1,2,3 — lengths 2000, 1000,
2000, 1000 mm) must only count edges 0 and 2: `2000 + 2000 = 4000 mm`,
**not** `2000+1000+2000+1000 = 6000 mm`.

**Test:** `src/integration-14x7.test.ts` ("only counts EXTERNAL edges — a
wall edge and a stair edge are excluded from the same run"). **PASS**
(4.00 m computed, not 6.00 m).

## 8. BOM — technical vs. purchase quantity

**Previous behaviour:** a single `quantity`/`subtotal` per line conflated
"what the design needs" with "what must be bought", and cost was computed
from a value that mixed both concepts inconsistently across lumber vs.
unit-priced lines.

**Fix:** every `BomLine` now separates `technicalQuantity` /
`technicalLinearMeters` / `technicalCost` (informational — matches the
plan) from `purchaseQuantity` / `purchaseLinearMeters` /
`purchaseBreakdown` / `purchaseTotal` (what is actually bought and
billed). `computeMaterialCost` and the cost summary use **purchase**
values only; the plan/quantities views use **technical** values.

**Manual example (per the spec):** Technical 73.4 lm needing, say, 18
boards of 4.8 m → Purchase = 18 × 4.8 = 86.4 lm. Cost must use 86.4 lm,
never 73.4 lm.

**Test:** `src/materials/bom.test.ts` ("keeps technical (design) quantity
separate from purchase (buyable) quantity" — asserts `purchaseTotal` is
computed from `purchaseLinearMeters`, not `technicalLinearMeters`).
**PASS**.

## 9. Kund tillhandahåller (client-supplied material)

**Status: already correct**, formalised with an explicit test. A material
marked `suppliedByClient` (via `clientSuppliedMaterialIds`) still appears
in the BOM with its full technical and purchase quantities (so the
quantity list stays accurate for the customer to buy/provide), but
`computeMaterialCost` filters it out of the priced total — its
`purchaseTotal` never reaches the contractor's cost subtotal.

**Test:** `src/materials/bom.test.ts` ("keeps a client-supplied material
in the BOM and quantities, but at zero contractor cost"),
`src/pricing/pricing.test.ts` ("excludes client-supplied lines..., using
PURCHASE quantity"). **PASS**.

## 10. Pricing — påslag (markup), not margin

**Status: the formula was already a markup calculation, but mislabeled.**
`sellingPrice = cost * (1 + rate/100)` **is** the markup formula
(`marginAmount = subtotal * rate/100`, `priceExVat = subtotal +
marginAmount`) — it was simply presented in the UI as "Marginal", which
mathematically means something different
(`sellingPrice = cost / (1 - rate/100)`, e.g. cost 100 at a 20% *margin*
→ 125, not 120).

**Fix:** renamed throughout (`MarginConfig`→`MarkupConfig`,
`marginPercent`→`markupPercent`, `marginAmount`→`markupAmount`,
`Project.margin`→`Project.markup`) and the UI label changed to
"Påslag %". No calculation changed — cost 100, markup 20% → 120,
confirmed still correct.

**Test:** `src/pricing/pricing.test.ts` ("applies markup ON TOP of cost:
cost=100, markup=20% -> 120 (not a margin calculation)"). **PASS**.

## 11. Moms (VAT) — full precision, presentation-only rounding

**Status: already correct.** VAT is computed on the full floating-point
`priceExVat`, never on a pre-rounded intermediate value; rounding only
happens in the UI's `formatSek`. Default 25%, fully configurable per
project (`ProjectSettings.vatPercent`). Confirmed unchanged by
`src/pricing/pricing.test.ts` and `src/integration-14x7.test.ts`.

## 12. ROT — configurable eligibility per cost category

**Previous behaviour:** ROT was hard-wired to apply to `labourCost` only,
with no way to configure it if the rules changed (or a specific
municipality/case allowed materials, say).

**Fix:** added `RotEligibility` (`materialEligible`, `labourEligible`,
`machinesEligible`, `transportEligible`) to `ProjectSettings`, defaulting
to **only labour eligible** (matching current common practice), but fully
user-editable. `computeCostSummary` sums exactly the cost categories
flagged eligible into `rotEligibleAmount`, applies `rotPercent`, and caps
at `rotMaxDeduction`. No tax rule is hard-coded — the percent, cap, and
eligibility are all project settings.

**Manual example:** material 10 000, labour 20 000, only labour eligible,
ROT 50%, cap 5 000: `rotEligibleAmount = 20000`,
`raw = 20000*0.5 = 10000`, capped at `5000`. **PASS**
(`src/pricing/pricing.test.ts`).

## 13. Labour — configurable productivity, no hidden constants

**Status: already correct.** Every rate (`stommeHoursPerM2`,
`trallHoursPerM2`, `plintHoursPerUnit`, `stairHoursPerUnit`,
`kantbradaHoursPerMeter`, `hourlyRate`) is a user-editable
`LabourRates` field; `workerCount` affects only the estimated project
duration (`estimateDurationDays`), never the total labour cost (a bigger
crew changes the timeline, not the total person-hours billed) — confirmed
by `src/labour/labour.test.ts` ("total cost does not scale with crew
size").

## 14. Quotation

**Status: already correct.** `assembleQuotation` bundles info/BOM/labour/
costs verbatim (no transformation); `quotationGroups` maps the cost
summary to the Arbete/Material/Maskiner/Transport/Övrigt breakdown the
offert view shows. **PASS** (`src/quotation/quotation.test.ts`).

---

## Summary table

| Engine | Bug found | Fixed | Test file |
|---|---|---|---|
| Geometry | No | — | geometry.test.ts |
| Reglar CC | Yes — uneven last bay + wrong rotation axis | Yes | joists.test.ts, integration-14x7 |
| Bärlinor spacing | No (but re-verified against the same formula) | — | beams.test.ts, integration-14x7 |
| Plintar spacing | No (inherits the fixed uniform-spacing formula) | — | footings.test.ts, integration-14x7 |
| Trall row layout | Yes — no cut-row handling | Yes | boardLayout.test.ts |
| Cut optimisation | Yes — uniform-length bug undercounted impossible pieces | Yes | cutOptimization.test.ts |
| Splicing long runs | Yes — priced as one impossible board | Yes | cutOptimization.test.ts, integration-14x7 |
| Structural geometry | No (extended with dimension/beamId) | — | joists/beams/footings.test.ts |
| Fasteners | Yes — strict interior test undercounted edge joists | Yes | integration-14x7, -lshape, -ushape |
| Kantbrädor | Missing edge classification | Added | integration-14x7 |
| BOM technical/purchase | Conflated | Separated | bom.test.ts |
| Kund tillhandahåller | No | — (test added) | bom.test.ts, pricing.test.ts |
| Pricing (markup) | Mislabeled only | Renamed | pricing.test.ts |
| Moms | No | — | pricing.test.ts |
| ROT | Hard-coded to labour only | Configurable eligibility | pricing.test.ts |
| Labour | No | — | labour.test.ts |
| Quotation | No | — | quotation.test.ts |

**114/114 automated tests pass** as of this audit (`npm test`), including
the full hand-derived `integration-14x7.test.ts`,
`integration-lshape.test.ts` and `integration-ushape.test.ts`.
