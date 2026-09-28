/* Table of contents of AIMA 4th edition, with how each chapter maps onto the Wumpus World.
 * status: ready (page exists) | planned (≤ ch. 10, to build) | later (beyond current reading) | info (no lab) */
(function (W) {
  'use strict';
  W.PARTS = [
    { roman: 'I', title: 'Artificial Intelligence', chapters: [
      { n: 1, title: 'Introduction', status: 'ready', page: 'intro.html', fit: 0, idea: 'Start here: how the Wumpus World works (rules, percepts, scoring, try it yourself) and the seven dimensions of task environments (§2.3).' },
      { n: 2, title: 'Intelligent Agents', status: 'ready', fit: 3, page: 'ch02.html', idea: 'PEAS, environment types, and five agent programs (reflex → utility) on the same world. You can also play it yourself.' },
    ] },
    { roman: 'II', title: 'Problem-solving', chapters: [
      { n: 3, title: 'Solving Problems by Searching', status: 'ready', fit: 3, page: 'ch03.html', idea: 'Fully observable Wumpus world: BFS, UCS, DFS, IDS, greedy, A*, with a live search tree, heuristic lab and admissibility checker.' },
      { n: 4, title: 'Search in Complex Environments', status: 'ready', page: 'ch04.html', fit: 2, idea: 'Slippery floors (AND-OR search), belief-state localization, online exploration (LRTA*), local search that generates worlds.' },
      { n: 5, title: 'Constraint Satisfaction Problems', status: 'ready', page: 'ch05.html', fit: 3, idea: 'Pit inference as a CSP: constraint graph, AC-3 propagation, backtracking with MRV/LCV, enumerating all consistent worlds.' },
      { n: 6, title: 'Adversarial Search and Games', status: 'ready', page: 'ch06.html', fit: 2, idea: 'A moving wumpus as MIN: minimax trees, alpha-beta pruning, expectiminimax, MCTS.' },
    ] },
    { roman: 'III', title: 'Knowledge, Reasoning, and Planning', chapters: [
      { n: 7, title: 'Logical Agents', status: 'ready', page: 'ch07.html', fit: 3, idea: 'The chapter the Wumpus World comes from. A growing KB, model checking, resolution, forward/backward chaining, DPLL, WalkSAT, the hybrid agent.' },
      { n: 8, title: 'First-Order Logic', status: 'ready', page: 'ch08.html', fit: 3, idea: 'FOL Wumpus axioms next to the propositional version, an interpretation explorer and a quantifier playground.' },
      { n: 9, title: 'Inference in First-Order Logic', status: 'ready', page: 'ch09.html', fit: 3, idea: 'Unification stepper, forward and backward chaining proof trees, CNF conversion and resolution refutation.' },
      { n: 10, title: 'Knowledge Representation', status: 'ready', page: 'ch10.html', fit: 2, idea: 'An ontology of wumpus objects, event calculus timelines, default reasoning and a truth-maintenance dependency graph.' },
      { n: 11, title: 'Automated Planning', status: 'ready', page: 'ch11.html', fit: 3, idea: 'PDDL Wumpus, forward/backward planners, planning graphs.' },
    ] },
    { roman: 'IV', title: 'Uncertain Knowledge and Reasoning', chapters: [
      { n: 12, title: 'Quantifying Uncertainty', status: 'later', fit: 3, idea: 'The book’s own §12.7: exact pit probabilities by enumerating frontier models.' },
      { n: 13, title: 'Probabilistic Reasoning', status: 'later', fit: 3, idea: 'A Bayes net over pits and breezes: exact and approximate inference.' },
      { n: 14, title: 'Probabilistic Reasoning over Time', status: 'later', fit: 2, idea: 'Tracking a wandering wumpus with an HMM / particle filter.' },
      { n: 15, title: 'Probabilistic Programming', status: 'later', fit: 1, idea: 'The world generator as a generative program; inference over worlds.' },
      { n: 16, title: 'Making Simple Decisions', status: 'later', fit: 2, idea: 'Value of information: is it worth shooting or stepping into risk?' },
      { n: 17, title: 'Making Complex Decisions', status: 'later', fit: 3, idea: 'Wumpus as an MDP / POMDP: value and policy iteration.' },
      { n: 18, title: 'Multiagent Decision Making', status: 'later', fit: 1, idea: 'Two hunters sharing one cave.' },
    ] },
    { roman: 'V', title: 'Machine Learning', chapters: [
      { n: 19, title: 'Learning from Examples', status: 'later', fit: 1, idea: 'Learn a “safe square” classifier from percept histories.' },
      { n: 20, title: 'Learning Probabilistic Models', status: 'later', fit: 1, idea: 'Estimate the pit probability from played episodes.' },
      { n: 21, title: 'Deep Learning', status: 'later', fit: 1, idea: 'A small network as the agent’s value function.' },
      { n: 22, title: 'Reinforcement Learning', status: 'later', fit: 3, idea: 'Q-learning and policy gradients across thousands of random worlds.' },
    ] },
    { roman: 'VI', title: 'Communicating, Perceiving, and Acting', chapters: [
      { n: 23, title: 'Natural Language Processing', status: 'later', fit: 0, idea: '' },
      { n: 24, title: 'Deep Learning for Natural Language Processing', status: 'later', fit: 0, idea: '' },
      { n: 25, title: 'Computer Vision', status: 'later', fit: 0, idea: '' },
      { n: 26, title: 'Robotics', status: 'later', fit: 0, idea: '' },
    ] },
    { roman: 'VII', title: 'Conclusions', chapters: [
      { n: 27, title: 'Philosophy, Ethics, and Safety of AI', status: 'info', fit: 0, idea: '' },
      { n: 28, title: 'The Future of AI', status: 'info', fit: 0, idea: '' },
    ] },
  ];
})(window.W);
