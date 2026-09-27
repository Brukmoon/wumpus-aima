# Wumpus × AIMA

Interactive labs for *Artificial Intelligence: A Modern Approach* (4th ed.), using the Wumpus World as the running example.

Open `index.html` in a browser. No build step, no server, no dependencies; it works from `file://`.

## Chapters

| Ch. | Page | What's inside |
|---|---|---|
| 2 | `ch02.html` | PEAS, five agent programs (reflex → utility), manual play, benchmark over many worlds |
| 3 | `ch03.html` | Route / full-mission formulations, BFS, UCS, DFS, DLS, IDS, greedy, A*, weighted A*, search tree, heuristic lab (admissibility & consistency checker) |
| 4 | `ch04.html` | Local search that designs worlds (HC, restarts, SA, GA), AND-OR search on ice, belief states (localization, sensorless plans), online DFS & LRTA* |
| 5 | `ch05.html` | Pit/wumpus inference as a CSP: GAC-3, backtracking (MRV/LCV/FC/MAC), min-conflicts, all solutions + weighted posterior preview |
| 6 | `ch06.html` | Wumpus hunt game: minimax, alpha–beta (+ move ordering), expectiminimax, MCTS; play against it |
| 7 | `ch07.html` | Hybrid agent (Fig. 7.20) with a propositional KB; inference lab: model checking, resolution (naive / SoS / unit preference), FC, BC, DPLL, WalkSAT, CNF |
| 8 | `ch08.html` | The world as a first-order model: interpretation, sentence evaluator with quantifier stepping, grounding |
| 9 | `ch09.html` | Unification stepper, FOL forward & backward chaining, CNF with Skolemization, resolution with unification |
| 10 | `ch10.html` | Ontology & inheritance, event calculus timeline, JTMS default reasoning, knowledge vs truth (possible worlds) |
| 11 | `ch11.html` | PDDL domain, progression & regression planners, relaxed planning graph (h_max, h_FF), SATPlan, hierarchical view |

## Structure

```
index.html              chapter map (all 28 chapters; data in js/chapters.js)
chNN.html               one page per chapter
css/style.css           shared styles (light + dark)
js/core/world.js        world rules, seeded generator, environment (percepts, actions, scoring)
js/core/gridview.js     SVG grid renderer with overlays (cells, paths, agent)
js/core/treeview.js     search-tree renderer for Chapter 3-style search runs
js/core/gtree.js        generic stepped tree renderer (CSP, game, AND-OR trees)
js/core/ui.js           Player (step/rewind), Pseudo (highlighted pseudocode), WorldPanel, Tabs, sparkline, tooltip
js/core/logic.js        propositional logic: parser, CNF, TT-ENTAILS, resolution, FC/BC, DPLL (textbook + watched-literal), WalkSAT
js/core/fol.js          first-order logic: parser, model evaluation, unification, CNF/Skolemization, FC, BC, resolution
js/chNN/*.js            chapter-specific algorithms + page wiring
```

Plain scripts (not ES modules) sharing one global `W`, so pages load from `file://`.

## Deliberate simplifications (also noted on the pages)

- Ch. 7: the KB is atemporal (the world is static; the agent tracks its own pose); `Alive` is a single fluent symbol.
- Ch. 4: online DFS has the standard fix of not re-pushing states reached by backtracking; hazards act as walls there.
- Ch. 5: domain {∅, P, W} ignores the rare wumpus-in-a-pit case.
- Ch. 8: variables x, y, a, b, i, j range over numbers, all others over squares (a sorted shorthand).
- Ch. 9: FOL resolution bounds Skolem-term depth at 3 to keep failures finite.
- Ch. 11: STRIPS Shoot only hits an adjacent wumpus; SATPlan omits shooting.

## Adding a chapter

1. Algorithms record a **trace** (array of events with a pseudocode `line` id and a message).
   The UI never re-runs the algorithm; `W.Player` scrubs through the trace.
2. Pseudocode is a list of `[lineId, text]` pairs; call `pseudo.highlight(event.line)`.
3. Reuse `W.WorldPanel` so the chosen world is shared across chapters (stored in localStorage).
4. Set the chapter's `status: 'ready'` and `page` in `js/chapters.js`.
