// A full, honestly-generated profile (old shape: no domains/distribution yet),
// sanitized and frozen as a fixture. Two things it pins:
//
// 1. Backward compatibility: profiles generated before a lens existed must
//    keep passing the structure checks and keep rendering — the checks gate
//    submission, and a false block on an honest old profile is the worst
//    failure mode they could have.
// 2. The fixture itself stays sanitized: working files from a real run must
//    never land in the repo as-is (contact, repoLabels, manifest hash).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderMarkdown } from "../src/profile.mjs";
import { assessGroundedness } from "../src/groundedness.mjs";
import { assessStructure } from "../src/consistency.mjs";

const fixture = () =>
  JSON.parse(readFileSync(new URL("./fixtures/candidate.sample.json", import.meta.url), "utf8"));

test("old-shape profile passes the structure checks (no false blocks on honest profiles)", () => {
  assert.deepEqual(assessStructure(fixture()).issues, []);
});

test("old-shape profile scores well on groundedness", () => {
  const g = assessGroundedness(fixture());
  assert.ok(g.score == null || g.score >= 60, `honest fixture scores ${g.score}%`);
});

test("old-shape profile renders to markdown without domains/distribution sections", () => {
  const md = renderMarkdown(fixture());
  assert.ok(md.includes("## Representative projects"));
  assert.ok(!md.includes("## Domains"), "no domains in the fixture, no section in the render");
});

test("fixture stays sanitized", () => {
  const f = fixture();
  assert.equal(f.contact.email, "giulia@example.com");
  for (const p of [...f.projects, ...f.otherProjects]) {
    assert.ok(!("repoLabel" in p), "fixture must not carry real repo names");
  }
  assert.match(f.authenticity.manifestHash, /^0+$/);
});
