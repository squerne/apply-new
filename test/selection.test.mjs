// Adaptive representative selection: 3 to 5, decided by the portfolio itself.
// A 4th/5th slot must be earned — new primary type, or significance comparable
// to the 3rd pick. `--top N` stays as an explicit override.

import { test } from "node:test";
import assert from "node:assert/strict";
import { selectRepresentatives } from "../src/profile.mjs";

const proj = (repo, type, sessions, commits = 0, to = "2026-01") => ({
  repo, type: [type], from: "2025-06", to, sessions,
  landing: { commits }, researchToMutation: 1, delegation: 0,
  topAreas: {}, tech: [], learningTopics: [], promptSamples: [],
});

const picked = (projects, n) => selectRepresentatives(projects, n).filter((p) => p.selected);

test("concentrated, homogeneous portfolio stays at 3", () => {
  // Steep score drop after the top 3, all the same primary type: nothing
  // earns the 4th slot.
  const projects = [
    proj("a", "product-build", 30), proj("b", "product-build", 25), proj("c", "product-build", 20),
    proj("d", "product-build", 5), proj("e", "product-build", 4), proj("f", "product-build", 3),
  ];
  assert.equal(picked(projects, "auto").length, 3);
});

test("type diversity grows the selection to 5", () => {
  const projects = [
    proj("a", "product-build", 30), proj("b", "audit-research", 25), proj("c", "agent-tooling", 20),
    proj("d", "static-site", 5), proj("e", "data-migration", 4), proj("f", "product-build", 3),
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
