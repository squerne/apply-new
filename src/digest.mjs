// Per-project digest: the deep, LLM-ready material the profile is written from.
//
// Beyond sampled prompts, this reconstructs project CONTEXT from the tool inputs
// (the files touched draw the domain), detects the stack, reads "landing"
// signals (did checks run, did work get committed vs reverted), and the
// learning trajectory (what was searched for). Everything stays redacted and
// keyed by repo, so worktrees of one product collapse into one project.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ms = (iso) => (iso ? Date.parse(iso) : NaN);
const month = (iso) => (iso ? new Date(ms(iso)).toISOString().slice(0, 7) : null);

const DELEGATION = new Set(["Task", "Agent"]);
const PLANNING = new Set(["TodoWrite", "ExitPlanMode"]);
const MUTATION = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);
const RESEARCH = new Set(["Read", "Grep", "Glob", "WebSearch", "WebFetch"]);

// Ephemeral sandboxes (background tasks) are not real projects.
const isEphemeral = (cwd) => /\/(private|tmp|var\/folders)\//.test(cwd);

// Cluster sessions by product: the repo segment of the working dir.
function repoKey(cwd) {
  const m = cwd.match(/\/(?:Github|github|repos?|Projects|Desktop|src|code|dev|work)\/([^/]+)/);
  if (m) return m[1];
  const parts = cwd.split("/").filter((p) => p && p !== "⟨user⟩" && p !== "Users");
  return parts.at(-1) || "unknown";
}

// Reduce an absolute (redacted) path to a 2-3 level repo-relative "area".
function toArea(path, key) {
  const i = path.indexOf("/" + key + "/");
  if (i < 0) return null;
  let parts = path.slice(i + key.length + 2).split("/").filter(Boolean);
  if (parts.length > 1 && /(-(app|web|api|server|client))$|^(apps|packages|src|web|app)$/.test(parts[0])) {
    parts = parts.slice(1);
  }
  return parts.slice(0, 3).join("/") || null;
}

// --- Stack detection -------------------------------------------------------
//
// Two evidence streams, merged. They answer different questions and both belong:
//   1. package.json DEPENDENCIES across workspaces — what the project *uses*.
//   2. The files and commands the sessions actually TOUCHED — what the candidate
//      *worked with*, anchored to evidence (file extensions + command text).
//
// We never read .env, not even key names (CONTRIBUTING: privacy — "the tool
// never opens your secrets file"). The cost is that services integrated only
// over REST (an API key, no npm package) are not auto-detected; that is a
// disclosed boundary (see the stack note in src/profile.mjs), not a silent miss.
//
// Path heuristics are NOT used for libraries: a route that contains the word
// "prisma" or a stray vite.config is not evidence the project depends on it.
// Libraries come from dependencies; languages/formats from touched extensions;
// runnable tools from command text.

// File extension -> language/format label. The "extension tally": a touched
// file is direct evidence the candidate worked with that language/format.
const EXT_LABELS = {
  py: "Python", rb: "Ruby", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin",
  swift: "Swift", php: "PHP", sql: "SQL", sh: "Shell", vue: "Vue",
  svelte: "Svelte", mdx: "MDX", tf: "Terraform", proto: "Protobuf",
};

// Command-text evidence: tools that surface in what the candidate actually RAN
// and that dependency scanning can't see (Python-ecosystem tools, deploy CLIs).
// LIBRARIES are deliberately NOT detected here — they come from dependencies
// only, so a library merely mentioned in a command never becomes a false
// positive (this is what produced the spurious "Prisma" the issue flagged).
const CMD_LABELS = [
  [/uvicorn|fastapi|\bstarlette\b/i, "FastAPI"],
  [/\bpytest\b/i, "pytest"],
  [/\bwrangler\b/i, "Cloudflare"],
];

// Dependency name -> label. Authoritative for libraries.
const DEP_LABELS = [
  [/^next$|^react$/, "Next.js/React"], [/^typescript$/, "TypeScript"], [/^vite$/, "Vite/React"],
  [/supabase/, "Supabase"], [/^pg$|^postgres/, "Postgres"], [/^firebase/, "Firebase/Firestore"],
  [/inngest/, "Inngest (event-driven jobs)"], [/strapi/, "Strapi (headless CMS)"], [/cloudinary/, "Cloudinary"],
  [/^stripe$/, "Stripe"], [/next-auth/, "NextAuth"], [/resend/, "Resend (email)"],
  [/posthog/, "PostHog (analytics)"], [/anthropic/, "Anthropic SDK"], [/^openai$/, "OpenAI"],
  [/google\/gen|generative-ai/, "Google Gemini"], [/elevenlabs/, "ElevenLabs"], [/vercel/, "Vercel"],
  [/tailwind/, "Tailwind"], [/shadcn/, "shadcn/ui"], [/radix/, "Radix UI"],
  [/framer-motion/, "Framer Motion"], [/recharts/, "Recharts"], [/tiptap/, "TipTap (rich text)"],
  [/react-pdf|jspdf/, "React-PDF"], [/puppeteer|chromium/, "Puppeteer (PDF)"], [/^docx$|mammoth/, "docx/mammoth"],
  [/mdx/, "MDX"], [/react-hook-form/, "React Hook Form"], [/^zod$/, "Zod"],
  [/vitest/, "Vitest"], [/playwright/, "Playwright (E2E)"], [/^turbo$|turborepo/, "Turborepo (monorepo)"],
  [/^prisma$|@prisma/, "Prisma"], [/drizzle-orm/, "Drizzle"],
];

const readJSON = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

// Dependency names across the repo root and its apps/* and packages/* workspaces.
function workspaceDepNames(root) {
  const names = new Set();
  const pkgs = [];
  const tryDir = (d) => { const pj = join(d, "package.json"); if (existsSync(pj)) pkgs.push(pj); };
  tryDir(root);
  for (const sub of ["apps", "packages"]) {
    const dir = join(root, sub);
    if (existsSync(dir)) { try { for (const e of readdirSync(dir)) tryDir(join(dir, e)); } catch {} }
  }
  for (const pj of pkgs) {
    const j = readJSON(pj);
    if (j) for (const k of Object.keys({ ...(j.dependencies || {}), ...(j.devDependencies || {}) })) names.add(k.toLowerCase());
  }
  return names;
}

// Merge the two evidence streams into one deduped stack list.
function detectStack({ cwdRaw, exts, cmdsText }) {
  const labels = new Set();
  if (cwdRaw && existsSync(cwdRaw)) {
    for (const name of workspaceDepNames(cwdRaw)) for (const [re, l] of DEP_LABELS) if (re.test(name)) labels.add(l);
  }
  for (const ext of Object.keys(exts || {})) if (EXT_LABELS[ext]) labels.add(EXT_LABELS[ext]);
  for (const [re, l] of CMD_LABELS) if (re.test(cmdsText || "")) labels.add(l);
  return [...labels];
}

// Extension of a (POSIX-normalised) file path, lowercased; null when none.
function fileExt(path) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : null;
}

function classify(p) {
  const tags = [];
  const days = p.firstTs && p.lastTs ? (p.lastTs - p.firstTs) / 86400000 : 0;
  const areas = p.areasText;
  const htmlHeavy = (areas.match(/\.html/g) || []).length >= 3;

  if (htmlHeavy && p.mutations > 20) tags.push("static-site");
  if (/api\/agent|api\/chat|api\/connectors|\/agents?\//i.test(areas)) tags.push("ai-platform");
  if (/skills?\/[\w.-]+\/SKILL|\/SKILL\.md|commands?\/[\w.-]+\.md/i.test(areas)) tags.push("agent-tooling");
  if (p.researchToMutation != null && p.researchToMutation > 10) tags.push("audit-research");
  if (!tags.includes("static-site")) {
    if (p.mutations > 200 && days > 14) tags.push("product-build");
    else if (p.mutations > 30) tags.push("feature-work");
  }
  if (/migration|schema|\.sql/i.test(areas)) tags.push("data-migration");
  if (/e2e|playwright|\.test\.|\.spec\./i.test(areas)) tags.push("testing");
  if (p.delegation >= 8) tags.push("orchestrated");
  if (p.designQueries >= 5) tags.push("design-research");
  return tags.length ? [...new Set(tags)] : ["exploration"];
}

const DESIGN_RE = /design|ui\b|typograph|layout|figma|css|color|grid|font|spacing|aesthet/i;

export function buildDigest(parsed) {
  const byRepo = new Map();

  for (const s of parsed.sessions) {
    const cwd = s.cwdRaw || s.cwdRedacted || "";
    if (isEphemeral(cwd)) continue;
    const key = repoKey(s.cwdRedacted || cwd);
    if (!byRepo.has(key)) {
      byRepo.set(key, {
        repo: key, cwdRaw: s.cwdRaw || "", sessions: 0, userMessages: 0, prompts: [],
        toolHist: {}, areas: {}, exts: {}, cmds: [], webQueries: [],
        delegation: 0, planning: 0, firstTs: null, lastTs: null,
      });
    }
    const p = byRepo.get(key);
    p.sessions++;
    for (const m of s.messages) {
      const t = ms(m.ts);
      if (Number.isFinite(t)) {
        if (!p.firstTs || t < p.firstTs) p.firstTs = t;
        if (!p.lastTs || t > p.lastTs) p.lastTs = t;
      }
      if (m.role === "user" && m.textRedacted.trim()) {
        p.userMessages++;
        p.prompts.push(m.textRedacted.trim().replace(/\s+/g, " "));
      }
      for (const u of m.toolUses) {
        p.toolHist[u.name] = (p.toolHist[u.name] || 0) + 1;
        if (DELEGATION.has(u.name)) p.delegation++;
        if (PLANNING.has(u.name)) p.planning++;
        const area = u.path ? toArea(u.path, key) : null;
        if (area) p.areas[area] = (p.areas[area] || 0) + 1;
        if (u.path) { const e = fileExt(u.path); if (e) p.exts[e] = (p.exts[e] || 0) + 1; }
        if (u.cmd) p.cmds.push(u.cmd);
        if (u.q) p.webQueries.push(u.q);
      }
    }
  }

  const projects = [...byRepo.values()]
    .sort((a, b) => b.sessions - a.sessions)
    .map((p) => {
      const mutations = Object.entries(p.toolHist).filter(([k]) => MUTATION.has(k)).reduce((n, [, v]) => n + v, 0);
      const research = Object.entries(p.toolHist).filter(([k]) => RESEARCH.has(k)).reduce((n, [, v]) => n + v, 0);
      const topAreas = Object.entries(p.areas).sort((a, b) => b[1] - a[1]).slice(0, 12);
      const cmdsText = p.cmds.join(" \n ");
      const commits = (cmdsText.match(/git commit/g) || []).length;
      const reverts = (cmdsText.match(/git revert|git reset --hard|git checkout -- /g) || []).length;
      const designQueries = p.webQueries.filter((q) => DESIGN_RE.test(q)).length;
      const ctx = {
        mutations, designQueries,
        researchToMutation: mutations ? +(research / mutations).toFixed(2) : null,
        firstTs: p.firstTs, lastTs: p.lastTs,
        areasText: topAreas.map(([a]) => a).join(" "),
        delegation: p.delegation,
      };
      return {
        repo: p.repo,
        cwdRaw: p.cwdRaw, // local-only
        type: classify(ctx),
        from: month(new Date(p.firstTs).toISOString()),
        to: month(new Date(p.lastTs).toISOString()),
        sessions: p.sessions,
        userMessages: p.userMessages,
        // Code-volume signal for representative selection (edits/writes landed).
        mutations,
        topAreas: Object.fromEntries(topAreas),
        tech: detectStack({ cwdRaw: p.cwdRaw, exts: p.exts, cmdsText }),
        landing: {
          checksRun: /eslint|tsc|typecheck|playwright|npm (run )?build|pnpm build|npm test|pnpm test/i.test(cmdsText),
          commits, reverts,
          revertChurn: commits ? (reverts / Math.max(commits, 1) > 0.3 ? "high" : reverts > 0 ? "med" : "low") : "n/d",
        },
        delegation: p.delegation,
        researchToMutation: ctx.researchToMutation,
        learningTopics: [...new Set(p.webQueries)].slice(0, 12),
        promptSamples: samplePrompts(p.prompts),
      };
    });

  return { source: parsed.source, projectCount: projects.length, projects };
}

function samplePrompts(prompts, max = 8, cap = 300) {
  const sub = prompts.filter((p) => p.split(/\s+/).length >= 3 && !p.startsWith("<task-notification>") && !p.startsWith("Your task is to create a detailed summary"));
  if (sub.length <= max) return sub.map((p) => p.slice(0, cap));
  const step = sub.length / max;
  return Array.from({ length: max }, (_, i) => sub[Math.floor(i * step)].slice(0, cap));
}
