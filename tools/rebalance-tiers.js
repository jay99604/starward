#!/usr/bin/env node
/**
 * Rebuild js/data.js tier groups from the v5 answer pools.
 *
 * Sources (pinned so re-running this file is deterministic):
 *   v4 49bb9dc  curated common → obscure order
 *   v5 704a2d2  full accepted-answer pools and the later notability pass
 *
 * Each prompt keeps every accepted answer. Too Clever stays the trap list.
 * Ordinary tiers are cut so Space Dust is the largest bucket and
 * Meteor > Comet > Supernova > Quasar, with Quasar only a handful.
 *
 *   node tools/rebalance-tiers.js          write js/data.js
 *   node tools/rebalance-tiers.js --check  exit 1 if js/data.js differs
 */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "js/data.js");
const V4_REV = "49bb9dc";
const V5_REV = "704a2d2";

// Household name the v5 word list stranded on the rare tail.
const PROMOTE = new Map([["ziploc", 36]]);

const LV = [1, 3, 4, 5, 6];
const norm = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/^(the|a|an) /, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/(es|s)$/, "");

function loadRev(rev) {
  const src = execSync(`git show ${rev}:js/data.js`, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20e6,
  });
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window;
}

function v4Tier(n, i) {
  return n === 1 ? 1 : LV[Math.round((i * 4) / (n - 1))];
}

function parseBank(bank, mode) {
  return bank.map(([q, a]) => {
    const groups = a.split(" / ");
    const entries = [];
    groups.forEach((grp, i) => {
      const tier = mode === "v5" && groups.length === 6 ? i + 1 : v4Tier(groups.length, i);
      grp.split(",").forEach((ans) => {
        const aliases = ans
          .split("|")
          .map((x) => x.trim())
          .filter(Boolean);
        if (!aliases.length) return;
        entries.push({
          tier,
          raw: ans.trim(),
          label: aliases[0],
          keys: [...new Set(aliases.map(norm))],
          ord: entries.length,
        });
      });
    });
    return { q, entries };
  });
}

function allocate(n) {
  // Largest Quasar handful that still leaves a strict Dust > Meteor > Comet > Supernova descent.
  const qMax = n >= 1500 ? 6 : n >= 400 ? 5 : n >= 120 ? 4 : n >= 45 ? 3 : n >= 22 ? 2 : 1;
  const r = 0.7;
  for (let q = qMax; q >= 1; q--) {
    const rem = n - q;
    if (rem < 4) continue;
    const w = [1, r, r * r, r ** 3];
    const sw = w.reduce((a, b) => a + b, 0);
    const counts = w.map((x) => Math.round((rem * x) / sw));
    let diff = rem - counts.reduce((a, b) => a + b, 0);
    let guard = 0;
    while (diff !== 0 && guard++ < 100000) {
      if (diff > 0) {
        counts[0]++;
        diff--;
        continue;
      }
      let removed = false;
      for (let i = 0; i < 4; i++) {
        const next = i < 3 ? counts[i + 1] : q;
        if (counts[i] - 1 > next) {
          counts[i]--;
          diff++;
          removed = true;
          break;
        }
      }
      if (!removed) break;
    }
    const [a, b, c, d] = counts;
    if (a > b && b > c && c > d && d > q && a + b + c + d + q === n) {
      return { 1: a, 3: b, 4: c, 5: d, 6: q };
    }
  }
  return null;
}

function rankPrompt(v5, v4, tcList) {
  const tc = new Set(tcList.map(norm));
  const buckets = {};
  v4.entries.forEach((e) => {
    if (tc.has(norm(e.label))) return;
    (buckets[e.tier] ||= []).push(e);
  });
  const v4map = new Map();
  for (const t of Object.keys(buckets)) {
    buckets[t].forEach((e, i) => {
      e.keys.forEach((k) => {
        if (!v4map.has(k)) v4map.set(k, { tier: +t, pos: i });
      });
    });
  }
  const v5pos = {};
  v5.entries.forEach((e) => {
    (v5pos[e.tier] ||= []).push(e);
  });
  const v5index = new Map();
  for (const t of Object.keys(v5pos)) {
    v5pos[t].forEach((e, i) => {
      e.keys.forEach((k) => {
        if (!v5index.has(k)) v5index.set(k, { tier: +t, pos: i });
      });
    });
  }

  const traps = [];
  const ranked = [];
  const fresh = [];
  v5.entries.forEach((e) => {
    // Match the trap on any alias. "Toilet|Space toilet" is the Space toilet trap
    // even though the old primary label was Toilet, which the game would not demote.
    if (e.keys.some((k) => tc.has(k))) {
      traps.push(e);
      return;
    }
    const promoted = e.keys.map((k) => PROMOTE.get(k)).find((x) => x != null);
    if (promoted != null) {
      ranked.push({ ...e, score: promoted });
      return;
    }
    const h4 = e.keys.map((k) => v4map.get(k)).find(Boolean);
    if (h4) {
      const h5 = e.keys.map((k) => v5index.get(k)).find(Boolean);
      const s4 = h4.tier * 10 + (h4.pos + 1) / 10000;
      const s5 = h5.tier * 10 + (h5.pos + 1) / 10000;
      // When the two passes disagree, keep the more common placement.
      ranked.push({ ...e, score: Math.min(s4, s5) });
    } else {
      fresh.push(e);
    }
  });

  const v4ord = v4.entries.filter((e) => !tc.has(norm(e.label))).length;
  const longTail = fresh.length > 0 && fresh.length >= v4ord;
  if (longTail) {
    // Expansion catalogs: the head of the new list sits with familiar answers,
    // and the long tail runs past the curated rare end.
    fresh.forEach((e, i) => {
      const p = fresh.length <= 1 ? 1 : i / (fresh.length - 1);
      ranked.push({ ...e, score: 32 + 40 * Math.pow(p, 0.45) });
    });
  } else {
    // Small gap-fills stay inside the tier the v5 pass already gave them,
    // and never leapfrog the curated rare end. Unmatched Quasars still finish last.
    const by = {};
    fresh.forEach((e) => {
      (by[e.tier] ||= []).push(e);
    });
    for (const t of Object.keys(by)) {
      by[t].forEach((e, i) => {
        const p = by[t].length <= 1 ? 0 : i / (by[t].length - 1);
        const ti = +t;
        const score = ti <= 3 ? 32 + 7 * p : ti === 4 ? 42 + 7 * p : ti === 5 ? 52 + 7 * p : 65 + 4 * p;
        ranked.push({ ...e, score });
      });
    }
  }
  ranked.sort((a, b) => a.score - b.score || a.ord - b.ord);

  const alloc = allocate(ranked.length);
  if (!alloc) throw new Error(`No strict tier split for "${v5.q}" (${ranked.length} ordinary answers)`);

  const groups = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  tcList.forEach((name) => {
    const k = norm(name);
    const hit = traps.find((e) => e.keys.includes(k));
    if (!hit) throw new Error(`Too Clever answer missing from pool: ${v5.q} / ${name}`);
    const aliases = hit.raw
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    const primary = aliases.find((a) => norm(a) === k) || name;
    const rest = [];
    const seen = new Set([norm(primary)]);
    aliases.forEach((a) => {
      const ak = norm(a);
      if (seen.has(ak)) return;
      seen.add(ak);
      rest.push(a);
    });
    // Primary must be the trap name: the game demotes norm(primary) only.
    groups[2].push([primary, ...rest].join("|"));
  });
  if (groups[2].length !== traps.length) {
    throw new Error(`Too Clever list does not match trap rows for "${v5.q}"`);
  }
  let cursor = 0;
  for (const tier of [1, 3, 4, 5, 6]) {
    groups[tier] = ranked.slice(cursor, cursor + alloc[tier]).map((e) => e.raw);
    cursor += alloc[tier];
  }
  if (cursor !== ranked.length) throw new Error(`Split leaked answers for "${v5.q}"`);
  return { q: v5.q, groups, alloc, traps: traps.length };
}

function jsString(s) {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function render(rows, tooCleverSource) {
  const header = `// Starward answer bank. Six slash-separated groups are explicit tiers:
//   1 Space Dust 10 · 2 Too Clever 15 · 3 Meteor 30 · 4 Comet 60 · 5 Supernova 85 · 6 One in a Quasar 100
// Answers in a group are comma-separated. Aliases for the same answer use |.
//
// On every prompt, Space Dust holds the most answers, then Meteor > Comet > Supernova > Quasar.
// Quasar is only a handful of the most obscure answers (at most 6). Order inside a tier is
// most familiar first. Placement follows commonness: the curated v4 rarity order, the v5
// notability pass when that pass called an answer more common, and for big expansions the
// order those extra answers were added. It is not alphabetical and it is not random.
// Regenerated by tools/rebalance-tiers.js.
//
// Too Clever is a trap, not a rarity rung: the deep cut everybody thinks of. It is the short
// TOO_CLEVER list only, and it is not padded so that tier sizes fall in score order. Its count
// can sit below Quasar. Every prompt in this bank has enough ordinary answers for a strict
// Dust > Meteor > Comet > Supernova > Quasar ladder. A future prompt with fewer than 15
// ordinary answers would leave a top tier empty rather than break that order.
`;
  const lines = rows.map(({ q, groups }) => {
    const body = [1, 2, 3, 4, 5, 6].map((t) => groups[t].join(",")).join(" / ");
    return `[${jsString(q)}, ${jsString(body)}]`;
  });
  const footer = `
// Too Clever is the trap tier (15). Those answers are also filed in group 2 above.
// The game demotes a TOO_CLEVER match to tier 2 even if a later edit moves the row.
// Do not park ordinary answers here just to balance counts.
// tier ids: 1 Space Dust 10 · 2 Too Clever 15 · 3 Meteor 30 · 4 Comet 60 · 5 Supernova 85 · 6 One in a Quasar 100
`;
  return `${header}window.BANK=[\n${lines.join(",\n")}\n];\n${footer}${tooCleverSource.trim()}\n`;
}

function main() {
  const check = process.argv.includes("--check");
  const v4 = loadRev(V4_REV);
  const v5 = loadRev(V5_REV);
  if (v4.BANK.length !== v5.BANK.length) throw new Error("Prompt count mismatch");
  const oldPrompts = parseBank(v4.BANK, "v4");
  const curPrompts = parseBank(v5.BANK, "v5");
  const tooLine =
    execSync(`git show ${V5_REV}:js/data.js`, { cwd: ROOT, encoding: "utf8", maxBuffer: 20e6 })
      .split("\n")
      .find((line) => line.startsWith("window.TOO_CLEVER=")) || "";
  if (!tooLine) throw new Error("TOO_CLEVER line missing from v5");

  const rows = curPrompts.map((p, i) => {
    if (p.q !== oldPrompts[i].q) throw new Error(`Prompt mismatch at ${i}`);
    return rankPrompt(p, oldPrompts[i], v5.TOO_CLEVER[i] || []);
  });

  const agg = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  rows.forEach((r) => {
    agg[2] += r.traps;
    for (const t of [1, 3, 4, 5, 6]) agg[t] += r.alloc[t];
  });
  const text = render(rows, tooLine);
  if (check) {
    const cur = fs.readFileSync(OUT, "utf8");
    if (cur !== text) {
      console.error("js/data.js is out of date. Run node tools/rebalance-tiers.js");
      process.exit(1);
    }
    console.log("ok", agg);
    return;
  }
  fs.writeFileSync(OUT, text);
  console.log("wrote js/data.js", agg, "total", Object.values(agg).reduce((a, b) => a + b, 0));
}

main();
