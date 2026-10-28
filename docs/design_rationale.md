# LagLens design rationale (redesign of 2026-10-27)

The first version had five views, about ten hues and a number in every heatmap cell. Users found it
cluttered. The redesign removes encodings rather than adding them. Every remaining channel and mark
is chosen for one task and justified by visualization research.
The data and the four tasks T1–T4 are unchanged.

## 1 What the interface must make visible: sync vs. async

Every strategy pays a different cost for inference latency *d*. The views are built so that each cost has one visible signature.

| Strategy | What happens during inference | Cost it pays | Measured (d = 4, h = 4) | Signature in LagLens |
|---|---|---|---|---|
| **Sync** | The robot holds still for *d* steps, then executes *h* actions of the new chunk. | **Time.** The idle share is about d/(h+d). The observation is old but the world did not move, so the plan still fits. | idle 51 %, discontinuity 5.4 px, success 14 % | **D:** *think* and *act* alternate, with hatched idle gaps.<br>**A:** the blue curve falls steadily with *d*. |
| **Naive async** | The robot keeps executing the old chunk. The new chunk replaces it after *d* steps, skipping its first *d* actions. | **Discontinuity.** The new plan comes from an observation taken before the robot moved and can choose another mode, so discontinuities are large. | idle 2 %, discontinuity 43.5 px, success 38 % | **D:** *think* overlaps *act*, with tall magenta discontinuity bars far above its normal motion.<br>**C:** magenta discontinuity segment.<br>**A:** discontinuity curve rises as *h* shrinks. |
| **Inpaint async** | Same timing as naive. The new chunk is sampled with the committed actions clamped, so it continues the old plan. | **Outdated plans only.** Like naive, the robot keeps moving while the policy thinks (motion while thinking 30.8 px vs. 47.7 px naive and 11.5 px sync), but discontinuities stay small. | idle 2 %, discontinuity 8.0 px, success 60 % | **D:** *think* overlaps *act*, with discontinuity bars about as high as its normal motion.<br>**A:** the green curve stays roughly level up to *d* = 4 (58–66 % at *h* = 8), then drops at *d* = 6. |

These are exactly the four questions offered in A's question bar: Success, Idle (cost of sync), Outdated (cost of async: how far the robot moved between the camera picture a chunk was planned from and the moment the chunk was ready). It replaced an earlier *Staleness* question: the age of that picture averages d + (h−1)/2 and is identical for all three strategies at equal d and h, so its curves overlapped and could not separate the strategies, Discontinuity (cost of naive async). The *think / act* tracks in D show each schedule's timing directly instead of describing it in text.

## 2 Views, marks and channels

Channel rankings follow Munzner [1] (based on Cleveland & McGill [2] and Heer & Bostock [3]).
- Magnitude: position on a common scale > length > … > luminance > hue.
- Identity: spatial region > hue > shape.

### A Latency Response (T1 compare trends)
| Decision | Why | Source |
|---|---|---|
| Line + point marks; x = latency *d* on its true ratio scale (0, 1, 2, 4, 6 steps); y = metric | The old heatmap encoded the metric with luminance, a low-ranked magnitude channel, and needed a number in every cell. Position on a common scale is the most accurate magnitude channel, and the slope directly shows how quickly a strategy degrades. | [1][2][3] |
| One panel per horizon *h* (small multiples, shared y) | Juxtaposition for the secondary comparison across *h*. A shared y-scale keeps panels comparable. | [4][5] |
| Strategies superposed in each panel | Superposition supports direct, close comparison of a few series, here sync vs. the two async variants. Async lines start from the sync *d* = 0 point with a dotted segment because the strategies are identical without latency. | [4][6] |
| Strategy = hue + shape (circle, square, diamond) | Hue is the strongest identity channel after region. Shape is added redundantly so identity never depends on hue alone (Okabe–Ito hues; colour-vision-deficiency check below). | [1][13][14] |
| Thin 95 % interval lines (Wilson for success, t for means) | With 30 seeds a 15-point difference can be chance. Points with thin interval lines avoid the "within-the-bar" bias of bar + error-bar charts. | [7][16] |
| Δ vs baseline = paired difference over the same seeds, in the hover | Explicit encoding of the difference (Gleicher's third comparison strategy), with a paired interval that matches the paired design. Shown on demand instead of as a separate mode, so there is one less control to learn. | [4][5][17] |
| One always-visible question bar (4 buttons, each named after who pays the cost) instead of a 6-item dropdown | The choice is the main question of the tool, so it is shown, not hidden in a menu; dropping final coverage and jerk removed metrics that repeated success and boundary discontinuity. The same choice sets B's dumbbell attribute, so A and B never disagree. | [9][15] |
| Baseline and candidate as word-labelled rings | The selection is shown without recolouring marks: colour follows the entity, not the selection. | [4] |

### B Paired Seed Table (T2 locate flips, T4 discover correlation)
| Decision | Why | Source |
|---|---|---|
| One row per seed shared by an outcome matrix and a dumbbell strip (composite view, Table-Lens style) | The old flip matrix (B) and the dumbbell plot (E) were two views over the same seeds and forced the eye to match rows across panels. Juxtaposed components on one shared row axis remove that matching step and one view. | [8][9][10] |
| Matrix cell: filled = success, empty = failure (luminance) | Success is binary, so one luminance step suffices. The old four-hue loss/gain scheme reused the candidate orange and vermillion. Flips are now visible as cells that break their band's pattern. | [1][11] |
| baseline column black, candidate column orange; others grey | Identity hues appear only where baseline and candidate are, as in every other view. | [4] |
| Rows grouped by baseline→candidate change (lost, gained, both ✓, both ✗), robust seeds first inside a band; no sort or attribute controls | Spatial region is the top-ranked channel for a categorical attribute. Each band directly answers "which seeds flip?". Alternative orders were rarely needed and added controls. | [1] |
| "re-run" column (same schedule, new noise) | An explicit reference for chance: 8/30 PushT seeds flip with no schedule change (Catch: 4/30). | [5] |
| Dumbbell: ● baseline → ● candidate on a common position axis of the attribute that belongs to A's question (final coverage, idle share, motion while thinking, largest discontinuity); symlog for discontinuities; band medians as ticks | Position on a common scale. Rows never cross (unlike the earlier paired scatter). | [1][2] |
| Vertical brush on the dumbbells, or click a band → selected seeds re-aggregate A | Cross-filtering checks whether a trend holds for a subset ("are the failures driven by these seeds?"). | [12][15] |

### C Workspace Replay (T3 identify where)
| Decision | Why | Source |
|---|---|---|
| baseline and candidate side by side at the same scale and seed | Juxtaposition of two spatial states. True geometry is used because the data is spatial. | [4][6] |
| Four overlays: executed part of the current chunk (filled dots, solid), thrown-away part (hollow, dashed), the chunk still being computed (grey, dotted), plus the latest discontinuity (magenta) for 10 steps | Removes the full-path trace, the previous-chunk tail, per-index luminance and the start-pose ghost: data-ink that did not serve T3. Details (when planned, when executed, staleness) are on demand via hover. | [17][18] |
| What the policy saw: dotted outline of block and pusher at the time of the camera picture the shown chunk was planned from (t_obs), with an arrow to the pusher now and the label "seen at t=… · moved N px since" | Makes the cost of async visible in space, in the same frame as the plan: sync waits, so the outline and the robot nearly coincide; under async the robot keeps moving and the plan is made for a scene that no longer exists. Also makes the claim "every executed move is traced back to the picture it came from" literal. | [4] |
| Status line in the strategy vocabulary ("idle: waiting for inference", "acting … picture 4 steps old · thinking") | States the sync vs. async situation at t in words, so it never has to be decoded from marks. | |

### D Execution Timeline (T3 identify when)
| Decision | Why | Source |
|---|---|---|
| Gantt lanes on a linear, chronological time axis; baseline and candidate on one shared axis | A linear representation with a chronological scale suits "when" questions, and aligned lanes enable comparison. | [19][20] |
| Two tracks per run: *think* (inference intervals) and *act* (executed chunk spans, alternating tints; hatched = idle) | Shows the defining difference between the strategies: alternation (sync) vs. overlap (async). | [19] |
| Discontinuity = magenta bar in D's motion track, on the same px scale as the grey movement-per-step area (shared baseline/candidate scale) | Height on a common baseline is a top magnitude channel, and the grey area gives the reference: a jump is judged against how far the robot normally moves per step. It replaced lollipops above the act track, which showed the jump without that reference. The magenta hue means "discontinuity" here and in C only. | [1] |
| Provenance of the chunk at the cursor (or hovered): ○ at the time of its camera picture, its think interval and its act span outlined in ink and linked | In async, think and act bars overlap and it is not obvious which inference produced which span; the link shows picture → think → act for one chunk without adding a hue. | |
| Use of the current chunk's 16 planned moves: a strip of 16 cells under each lane label (light grey = skipped because their time passed while the policy was thinking, lane colour = executed, white = discarded) | Shows why async jumps: naive skips the first *d* moves and jumps to the move planned for now, inpaint makes the skipped part match the old plan. Within a schedule the pattern is the same for every chunk (checked: ≥ 97 % of chunks per schedule, the rest are cut short at the episode end), so it is drawn once per lane for the current chunk instead of on every chunk. | [1] |
| Coverage lines (baseline black, candidate orange) with the 95 % success threshold | Position channel for the outcome over time. Shares the x-axis with the tracks. | [1] |
| Brush a window → C highlights that part of the path; hover a chunk → its plan in C; click → cursor | Linked navigation from time to space. | [12][15] |

## 3 Whole-interface decisions
- **Overview first, then filter, then details on demand**, in reading order: A (overview) → B (filter seeds) → C/D (episode details). [17]
- **Two tasks, one encoding.** A task switch in the header (PushT · Catch the ball) reloads all four views with the same marks and channels; only the outcome attribute changes (coverage of the goal ↔ pusher–ball distance) and C draws the ball and its rolled path instead of the T, with the ball's position in the planning picture as the dotted outline. Catch is the case in which async's advantage is plain to see (the ball rolls on while sync waits); PushT is the harder case where the costs compete.
- **Fewer schedules and seeds.** The interface shows d ∈ {0, 2, 4} × h ∈ {4, 8} and 30 seeds: A has 3 latency points per panel and B 15 columns × 30 rows, readable without scrolling.
- **Parsimony and consistency** across multiple views. Five views became four, and each hue has a single meaning everywhere. [9]
- **Hue budget, chosen by job:**
  - identity: baseline `#222222`, candidate `#E69F00`
  - strategy: sync `#0072B2`, naive `#D55E00`, inpaint `#009E73`
  - event: discontinuity `#c2185b`
  - everything else neutral grey; selection is drawn in ink
- **Colour-vision-deficiency check.** Colour differences were computed with Machado et al.'s simulation [13] in OKLab (×100):
  - Strategy hues: smallest difference 9 (tritan, blue–green) and 11 (deutan, vermillion–green). Shape is redundant there.
  - baseline vs candidate: ≥ 48 for every deficiency.
  - candidate vs naive: 13–17. These two only meet in A, where the candidate is additionally marked by a labelled ring.
- **Interaction set**, after Heer & Shneiderman's taxonomy [15]:
  - *select* (baseline/candidate, seed)
  - *filter* (seed brush → A)
  - *derive* (Δ vs baseline, on hover)
  - *navigate* (time brush, play)
  - *coordinate* (one shared state; every view listens)
  - *record* (URL parameters reproduce any state)
- **Self-explaining encodings.** Every term is defined where it is encoded, not only in the guide: "compare two schedules: Baseline / Candidate" in the header; *h*, *d*, the three strategies and the y metric under A; rows, cells (✓/✗), baseline/candidate columns and the dumbbell attribute above B; line styles, the discontinuity and "steps stale" under C; think/act/idle and the motion track (jump bars) above D. [15][18]
- **Few controls.** The student found ten technically named controls (metric list, Δ mode, three sort orders, an 8-item attribute list, playback speed) hard to understand. The interface now has only the baseline/candidate pair and the question bar; everything else is direct manipulation (click, shift-click, brush, hover).

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
