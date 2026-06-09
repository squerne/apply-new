// Representative selection is driven by SIGNIFICANCE (normalised across the
// candidate's own portfolio), not by raw chat-session volume. Recency and type
// diversity are bounded nudges: they break near-ties but never lift a marginal
// project over a substantial one. The count stays adaptive (3 to 5), and
// `--top N` remains an explicit override.

import { test } from "node:test";
import assert from "node:assert/strict";
import { selectRepresentatives } from "../src/profile.mjs";

// opts: { commits, mutations, from, to, checksRun, revertChurn }
const proj = (repo, type, sessions, opts = {}) => ({
  repo, type: [type], from: opts.from || "2025-06", to: opts.to || "2026-01",
  sessions, mutations: opts.mutations ?? 0,
  landing: {
    commits: opts.commits ?? 0,
    checksRun: opts.checksRun ?? false,
    revertChurn: opts.revertChurn ?? "low",
  },
  researchToMutation: 1, delegation: 0, topAreas: {}, tech: [], learningTopics: [], promptSamples: [],
});

const picked = (projects, n) => selectRepresentatives(projects, n).filter((p) => p.selected);
const pickedRepos = (projects, n) => picked(projects, n).map((p) => p.repo);

// --- the reported failure: significance, not session volume ------------------

test("a high-output short project beats a high-session noodling one", () => {
  // 8 sessions that shipped (30 commits, 200 mutations) outrank 40 sessions of
  // poking around (no commits, almost no edits). Same type, so only substance
  // separates them.
  const projects = [
    proj("shipper", "product-build", 8, { commits: 30, mutations: 200 }),
    proj("noodler", "product-build", 40, { commits: 0, mutations: 5 }),
  ];
  assert.deepEqual(pickedRepos(projects, 1), ["shipper"]);
});

test("a recent throwaway does not outrank a substantial older flagship", () => {
  // Latest end is the recent project, so the relative cutoff makes it "recent".
  // The bounded recency bonus must not flip a clearly more significant flagship.
  const projects = [
    proj("flagship", "product-build", 25, { commits: 50, mutations: 300, from: "2023-01", to: "2023-12" }),
    proj("recent-poke", "exploration", 4, { commits: 0, mutations: 5, from: "2025-12", to: "2026-01" }),
  ];
  assert.deepEqual(pickedRepos(projects, 1), ["flagship"]);
});

test("recency breaks a tie between comparable projects", () => {
  // Identical substance; only one ends inside the recency window. The nudge tips it.
  const projects = [
    proj("older", "product-build", 20, { commits: 20, mutations: 100, from: "2023-01", to: "2023-06" }),
    proj("newer", "product-build", 20, { commits: 20, mutations: 100, from: "2025-08", to: "2026-01" }),
  ];
  assert.deepEqual(pickedRepos(projects, 1), ["newer"]);
});

test("the diversity nudge does not override a clear significance lead", () => {
  // After the flagship, a strong same-type project beats a weak new-type one:
  // the 0.10 nudge can't close a large significance gap.
  const projects = [
    proj("flagship", "product-build", 30, { commits: 40, mutations: 300 }),
    proj("strong-same-type", "product-build", 28, { commits: 38, mutations: 280 }),
    proj("weak-new-type", "audit-research", 3, { commits: 0, mutations: 5 }),
  ];
  const repos = pickedRepos(projects, 2);
  assert.ok(repos.includes("strong-same-type"), `expected strong same-type pick, got ${repos}`);
  assert.ok(!repos.includes("weak-new-type"), `weak new-type should not be picked, got ${repos}`);
});

test("the diversity nudge breaks a near-tie in favour of a new type", () => {
  // Two equally substantial projects after the flagship; one repeats a covered
  // type, the other introduces a new one. The nudge (0.10) outweighs the new
  // type's lower type-weight, so diversity wins the slot.
  const projects = [
    proj("flagship", "product-build", 30, { commits: 40, mutations: 300 }),
    proj("same-type", "product-build", 20, { commits: 20, mutations: 100 }),
    proj("new-type", "audit-research", 20, { commits: 20, mutations: 100 }),
  ];
  const repos = pickedRepos(projects, 2);
  assert.ok(repos.includes("new-type"), `expected new-type pick from the nudge, got ${repos}`);
});

// --- adaptive count invariants -----------------------------------------------

test("concentrated, homogeneous portfolio stays at 3", () => {
  // Three flagships that shipped; a tail that didn't. Steep significance drop,
  // all the same primary type — nothing earns the 4th slot.
  const projects = [
    proj("a", "product-build", 30, { commits: 40, mutations: 300 }),
    proj("b", "product-build", 25, { commits: 30, mutations: 200 }),
    proj("c", "product-build", 20, { commits: 25, mutations: 150 }),
    proj("d", "product-build", 5, { commits: 0, mutations: 5 }),
    proj("e", "product-build", 4, { commits: 0, mutations: 3 }),
    proj("f", "product-build", 3, { commits: 0, mutations: 2 }),
  ];
  assert.equal(picked(projects, "auto").length, 3);
});

test("type diversity grows the selection to 5", () => {
  const projects = [
    proj("a", "product-build", 30), proj("b", "audit-research", 25), proj("c", "agent-tooling", 20),
    proj("d", "static-site", 18), proj("e", "data-migration", 16), proj("f", "product-build", 2),
  ];
  assert.equal(picked(projects, "auto").length, 5);
});

test("comparable significance grows the selection even without new types", () => {
  const projects = [
    proj("a", "product-build", 30), proj("b", "product-build", 29), proj("c", "product-build", 28),
    proj("d", "product-build", 27), proj("e", "product-build", 26), proj("f", "product-build", 2),
  ];
  assert.equal(picked(projects, "auto").length, 5);
});

test("never exceeds 5 in auto mode", () => {
  const projects = Array.from({ length: 12 }, (_, i) => proj(`r${i}`, "product-build", 30 - i));
  assert.ok(picked(projects, "auto").length <= 5);
});

test("fewer than 3 projects selects them all", () => {
  const projects = [proj("a", "product-build", 10), proj("b", "audit-research", 5)];
  assert.equal(picked(projects, "auto").length, 2);
});

test("explicit --top N still overrides the adaptive count", () => {
  const projects = [
    proj("a", "product-build", 30), proj("b", "audit-research", 25), proj("c", "agent-tooling", 20),
    proj("d", "static-site", 5),
  ];
  assert.equal(picked(projects, 2).length, 2);
  assert.equal(picked(projects, 4).length, 4);
});
