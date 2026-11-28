# LagLens design rationale (redesign of 2026-10-27, final state of 2026-11-28)

The first version had five views, about ten hues and a number in every heatmap cell. Users found it
cluttered. The redesign removed encodings rather than adding them; later rounds (proposal feedback,
independent reviews, re-runs, longer horizons) changed what is compared and how chance is shown.
Every remaining channel and mark is chosen for one task and justified by visualization research.
The four tasks T1–T4 are unchanged.

## 1 What the interface must make visible: sync vs. async

Every strategy pays a different cost for inference latency *d*. The views are built so that each cost has one visible signature.

| Strategy | What happens during inference | Cost it pays | Measured (PushT, d = 4, h = 4, run 0) | Signature in LagLens |
|---|---|---|---|---|
| **Sync** | The robot holds still for *d* steps, then executes *h* actions of the new chunk. | **Time.** The idle share is about d/(h+d). The observation is old but the world did not move, so the plan still fits. | idle 51 %, jump 5.4 px, success 13 % | **E:** *think* and *act* alternate, with hatched idle gaps. **D:** card "idle: waiting for the plan". |
| **Naive async** | The robot keeps executing the old chunk. The new chunk replaces it after *d* steps, skipping its first *d* actions. | **Outdated plan and jumps.** The new plan comes from a picture taken before the robot moved and can choose another way of pushing, so jumps are large. | idle 2 %, outdated plan 43.9 px, jump 40.3 px, success 43 % | **E:** *think* overlaps *act*, with tall magenta jump bars. **D:** magenta jump segment. |
| **Inpaint async** | Same timing as naive. The new chunk is sampled with the committed actions clamped, so it continues the old plan. | **Outdated plan only.** Like naive, the robot keeps moving while the policy thinks, but jumps stay small. | idle 2 %, outdated plan 30.9 px, jump 7.8 px, success 67 % | **E:** jump bars about as high as an ordinary step. **D:** dotted outline of what the policy saw, away from the robot. |

The header asks one question for A, B and C (*show*: Success · Idle · Outdated plan · Jump), so each cost can also be compared across schedules and start states. How much each cost matters depends on the task and the horizon: with *h* = 11 sync stands still only 27 % of the time and in PushT the strategies no longer differ beyond chance, while in Catch (the ball rolls on) sync at *d* = 4 stays clearly behind at every *h* (report, Findings 1–2).

## Changes after the proposal (Nov 2026)
| Change | Why |
|---|---|
| Pair chosen from an overview (A) instead of header drop-downs; later also the header chips and ⇄ were removed | Choosing a pair from drop-downs assumes a *lookup* and invites trying every combination (instructor's feedback); the overview supports *explore*. |
| Only pairs with one reading are compared (same latency; same strategy and *h* at two latencies; any schedule against *d* = 0 at the same *h*); the others are hatched and cannot be chosen | A pair that differs in latency **and** in strategy or *h* mixes two causes; a difference there cannot be attributed. 102 of the 210 pairs per task are compared. |
| Significance corrected with Benjamini–Hochberg over the compared pairs (FDR 5 %) | With 102 tests per task, uncorrected *p* < 0.05 would frame about five pairs by chance if no difference were real. |
| Every schedule run three times (run 0 + two re-runs with other sampling noise) | One run of 30 start states is noisy (a plain re-run flips 4–17 PushT outcomes); the re-runs put the size of chance next to every difference. The test stays on run 0; the re-runs are the yardstick. |
| One question for A, B and C in the header; B's outcome matrix of all schedules, C's still-computing path, D's movement area and usage strip removed | Each removed element duplicated another view or served no main question. |
| Ranking strip in A | Answers "which schedule is best at my latency?" directly, with the three runs of each schedule. |
| *h* = 11 added; A opens at *d* = 4 | *h* = 11 is the longest horizon that fits the 16-action chunk at every latency (1 + *d* + *h* ≤ 16). A 21 × 21 matrix is too dense to read at once, so A opens on the analyst's latency (12 × 12); all latencies remain one click away. |

## 2 Views, marks and channels

Channel rankings follow Munzner [1] (based on Cleveland & McGill [2] and Heer & Bostock [3]).
- Magnitude: position on a common scale > length > … > luminance > hue.
- Identity: spatial region > hue > shape.

### A Pair Overview (T1 compare, T2 explore which pairs differ)
| Decision | Why | Source |
|---|---|---|
| Matrix of ordered pairs: rows = baseline, columns = candidate, ordered strategy → *h* → *d*, with strategy bands on both axes | One mark per comparison shows every pair at once, so no combination has to be tried blindly; spatial region separates sync→async from within-strategy comparisons. | [1] |
| Cell colour = paired difference candidate − baseline over the same start states | The paired difference is the quantity the tool is built around. | [8] |
| Diverging purple ↔ grey with a white midpoint, signed so that purple always means "candidate better" (higher success, lower cost); scale capped at the 75th percentile of the compared differences for costs | Polarity needs a diverging scale; blue–red would collide with the strategy hues, so the "better" arm uses purple, which is otherwise unused. The cap keeps one extreme schedule (Catch naive *d*4 *h*4 jumps) from washing out the rest. | [16] |
| Dark frame = unlikely to be chance: for success, exact McNemar test on the flipping start states with Benjamini–Hochberg over the compared pairs (on all 30 start states; off for a selection made in C); for the costs, the 95 % interval of the paired difference excludes 0 | McNemar is the standard test for paired binary outcomes; the correction matches the number of comparisons the matrix invites. | [5] |
| Hatched = not compared (with the reason in the tooltip) | Keeps the matrix complete while making clear which cells have no single reading. | |
| Latency filter (all · *d* = 2 · *d* = 4), default 4 | The analyst's question is "at my latency"; the filter keeps the *d* = 0 reference of the same *h*. | [17] |
| Ranking strip: the 9 schedules at that latency, sorted by the mean of three runs; filled = run 0, hollow = re-runs, tick = mean | Position on a common scale for the ranking, with the spread of the runs visible so a close ranking is not over-read. | [1][7] |
| Click a cell = load that pair everywhere; click a ranking row = candidate; hover = rates, rescued / lost start states, *q*, whether the re-runs agree | Details on demand, then drill-down into B–E. | [17] |

### B Latency Response (T1 compare trends)
| Decision | Why | Source |
|---|---|---|
| Line + point marks; x = latency *d* on its true scale; y = metric minus the baseline's on the same start states (0 = baseline) | Position on a common scale is the most accurate magnitude channel, and drawing relative to the baseline is Gleicher's explicit-difference strategy. | [1][2][4][5] |
| Strategy = hue + shape, horizon = dash (solid 4, dashed 8, dash-dot 11) | All schedules in one frame so baseline and candidate are always comparable; shape is redundant so identity never depends on hue alone. | [1][13][14] |
| Filled = unlikely chance (same test as A); dashed outline = not compared with this baseline; small hollow marks = re-runs | Fill encodes only significance, the outline only comparability, so the two never mix. | [5][7] |
| Band = my latency; click = candidate, shift-click = baseline; legend hover highlights one strategy | Direct manipulation instead of pickers. | [15] |

### C Paired Seed Table (T2 locate flips, T4 discover correlation)
| Decision | Why | Source |
|---|---|---|
| One row per start state with outcome cells (baseline black, candidate orange; filled = success) and two narrow cells for the re-runs; ≈ where a schedule's runs disagree | Flips are visible as cells that break their band's pattern; the re-run cells show directly whether a flip repeats. | [1][11] |
| Rows grouped by baseline → candidate change (rescued, lost, both ✓, both ✗) | Spatial region is the top-ranked channel for a categorical attribute; each band answers "which start states flip?". | [1] |
| Dumbbell ● baseline → ● candidate of the header's question (idle, outdated plan or jump; for Success, the cost that separates the pair), band ticks = medians | T4: do failures come with larger costs? The outcome is already in the cells. | [4] |
| Footer: rescued / lost, how many flips repeat in all runs of both schedules, how many a plain re-run flips | An explicit reference for chance next to the counts. | [5] |
| Brush rows → A and B recompute on the selected start states; click a row → D and E replay it | Cross-filtering checks whether a trend holds for a subset. | [12][15] |

### D Workspace Replay (T3 identify where)
| Decision | Why | Source |
|---|---|---|
| One map at true geometry with both runs superposed (baseline black, candidate orange) | Superposition in the same frame supports close comparison of two spatial states. | [4][6] |
| Executed path solid, planned but not executed dashed, latest jump magenta; dotted outline of block/ball and pusher in the picture the current plan came from | Only what explains the move at time t; the outline makes the cost of async visible in space. | [9] |
| Two cards in plain words ("idle: waiting for the plan", "plan from a picture 4 steps old · robot moved N px since then") | States the situation at t in the strategy vocabulary, so it never has to be decoded from marks. | |

### E Execution Timeline (T3 identify when)
| Decision | Why | Source |
|---|---|---|
| Gantt lanes on a linear time axis; baseline and candidate share the axis | A chronological scale suits "when" questions; aligned lanes enable comparison. | [19][20] |
| Per run: *think* track, *act* track (chunks, hatched = idle), *jump* track (magenta bar per switch, grey = ordinary step) | Alternation (sync) vs. overlap (async) is the defining difference; jumps are read against an ordinary step. | [1][19] |
| Outcome curve (coverage or distance) with the success line | Position channel for the outcome over time, on the same x-axis. | [1] |
| Brush a window → D highlights that path; hover a chunk → its plan in D; click → cursor | Linked navigation from time to space. | [12][15] |

## 3 Whole-interface decisions
- **Overview first, then filter, then details on demand**, in reading order: A, B (overview) → C (filter start states) → D, E (episode details). [17]
- **Two tasks, one encoding.** The task switch reloads all views with the same marks and channels; only the outcome attribute changes (coverage of the goal ↔ pusher–ball distance) and D draws the ball instead of the T. Catch is the case in which async's advantage is plain to see; PushT is the case where the costs compete and depend on *h*.
- **Grid.** *d* ∈ {0, 2, 4} × *h* ∈ {4, 8, 11}, 21 schedules × 3 runs × 30 start states per task; the first, larger grid (46 schedules × 50 seeds) was too dense to read.
- **Parsimony and consistency** across multiple views: each hue has a single meaning everywhere. [9]
- **Hue budget, chosen by job:**
  - identity: baseline `#222222`, candidate `#E69F00`
  - strategy: sync `#0072B2`, naive `#D55E00`, inpaint `#009E73`
  - event: jump `#c2185b`; "candidate better" in A: purple
  - everything else neutral grey; selection is drawn in ink
- **Colour-vision-deficiency check.** Colour differences were computed with Machado et al.'s simulation [13] in OKLab (×100):
  - Strategy hues: smallest difference 9 (tritan, blue–green) and 11 (deutan, vermillion–green). Shape is redundant there.
  - baseline vs candidate: ≥ 48 for every deficiency.
  - candidate vs naive: 13–17. These two only meet in A and B, where the candidate is additionally marked by a labelled ring.
- **Interaction set**, after Heer & Shneiderman's taxonomy [15]: *select* (a cell, a ranking row, a point, a start state), *filter* (latency filter; start-state brush → A, B), *navigate* (time brush, play), *coordinate* (one shared state; every view listens), *record* (URL parameters reproduce any state).
- **Self-explaining encodings.** Every term is defined where it is encoded (one-line keys and tooltips); the guide defines chunk, *d*, *h*, the strategies and the comparison rule. [15][18]
- **Few controls.** The header has only the task and the question; everything else is direct manipulation (click, shift-click, brush, hover).

## References
1. T. Munzner. *Visualization Analysis and Design*. CRC Press, 2014.
2. W. S. Cleveland, R. McGill. Graphical perception: Theory, experimentation, and application to the development of graphical methods. *JASA* 79(387), 1984.
3. J. Heer, M. Bostock. Crowdsourcing graphical perception: Using Mechanical Turk to assess visualization design. *ACM CHI* 2010.
4. M. Gleicher, D. Albers, R. Walker, I. Jusufi, C. D. Hansen, J. C. Roberts. Visual comparison for information visualization. *Information Visualization* 10(4), 2011.
5. M. Gleicher. Considerations for visualizing comparison. *IEEE TVCG* 24(1) (Proc. VIS 2017), 2018.
6. B. Ondov, N. Jardine, N. Elmqvist, S. Franconeri. Face to face: Evaluating visual comparison. *IEEE TVCG* 25(1) (Proc. VIS 2018), 2019.
7. M. Correll, M. Gleicher. Error bars considered harmful: Exploring alternate encodings for mean and error. *IEEE TVCG* 20(12) (Proc. VIS 2014), 2014.
8. R. Rao, S. K. Card. The Table Lens. *ACM CHI* 1994.
9. M. Q. Wang Baldonado, A. Woodruff, A. Kuchinsky. Guidelines for using multiple views in information visualization. *AVI* 2000.
10. W. Javed, N. Elmqvist. Exploring the design space of composite visualization. *IEEE PacificVis* 2012.
11. J. Bertin. *Semiology of Graphics*, 1967 (English ed. 1983).
12. C. Weaver. Cross-filtered views for multidimensional visual analysis. *IEEE TVCG* 16(2), 2010.
13. G. M. Machado, M. M. Oliveira, L. A. F. Fernandes. A physiologically-based model for simulation of color vision deficiency. *IEEE TVCG* 15(6) (Proc. VIS 2009), 2009.
14. D. A. Szafir. Modeling color difference for visualization design. *IEEE TVCG* 24(1) (Proc. VIS 2017), 2018.
15. J. Heer, B. Shneiderman. Interactive dynamics for visual analysis. *Communications of the ACM* 55(4), 2012.
16. E. B. Wilson. Probable inference, the law of succession, and statistical inference. *JASA* 22(158), 1927.
17. B. Shneiderman. The eyes have it: A task by data type taxonomy for information visualizations. *IEEE Symp. Visual Languages* 1996.
18. E. R. Tufte. *The Visual Display of Quantitative Information*, 1983.
19. M. Brehmer, B. Lee, B. Bach, N. H. Riche, T. Munzner. Timelines revisited: A design space and considerations for expressive storytelling. *IEEE TVCG* 23(9), 2017.
20. C. Plaisant, B. Milash, A. Rose, S. Widoff, B. Shneiderman. LifeLines: Visualizing personal histories. *ACM CHI* 1996.
