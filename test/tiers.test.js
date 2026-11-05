"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/^(the|a|an) /, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/(es|s)$/, "");

function makeEl() {
  const el = {
    style: {},
    dataset: {},
    classList: {
      toggle() {},
      add() {},
      remove() {},
      contains() {
        return false;
      },
    },
    hidden: false,
    disabled: false,
    textContent: "",
    innerHTML: "",
    value: "",
    className: "",
    width: 16,
    height: 16,
    appendChild() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    querySelector() {
      return makeEl();
    },
    querySelectorAll() {
      return [];
    },
    getContext() {
      const g = {
        addColorStop() {},
      };
      return {
        clearRect() {},
        fillRect() {},
        fillStyle: "",
        globalAlpha: 1,
        imageSmoothingEnabled: true,
        createLinearGradient() {
          return g;
        },
        createRadialGradient() {
          return g;
        },
      };
    },
    focus() {},
    blur() {},
    click() {},
  };
  el.parentNode = el;
  return el;
}

function boot() {
  const sandbox = {
    window: null,
    document: {
      body: makeEl(),
      documentElement: makeEl(),
      getElementById() {
        return makeEl();
      },
      querySelector() {
        return makeEl();
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {},
      createElement() {
        return makeEl();
      },
    },
    navigator: {},
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
    matchMedia() {
      return { matches: false, addEventListener() {}, addListener() {} };
    },
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
    requestAnimationFrame() {
      return 0;
    },
    cancelAnimationFrame() {},
    setInterval() {
      return 0;
    },
    clearInterval() {},
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle() {
      return { getPropertyValue() { return "#fff"; } };
    },
    performance: { now() { return 0; } },
    Intl,
    Map,
    Set,
    console,
    Math,
    Date,
    URL,
    parseInt,
    isNaN,
    confirm() {
      return false;
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data.js"), "utf8"), sandbox, { filename: "js/data.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8"), sandbox, { filename: "js/game.js" });
  return sandbox;
}

const game = boot();
const { PROMPTS, exact, correction, suggest, norm: gameNorm, TIERS } = game.__sw;

function loadRev(rev) {
  const src = execFileSync("git", ["show", `${rev}:js/data.js`], { cwd: ROOT, encoding: "utf8", maxBuffer: 20e6 });
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window;
}

test("service worker cache and asset query strings are starward-v6", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(sw, /const C="starward-v6"/);
  assert.doesNotMatch(sw, /starward-v5/);
  assert.match(html, /style\.css\?v=6/);
  assert.match(html, /js\/data\.js\?v=6/);
  assert.match(html, /js\/game\.js\?v=6/);
  assert.doesNotMatch(html, /\?v=5/);
  for (const file of ["style.css?v=6", "js/data.js?v=6", "js/game.js?v=6"]) {
    assert.ok(sw.includes(file), file);
  }
});

test("rebalance script reproduces js/data.js", () => {
  execFileSync("node", ["tools/rebalance-tiers.js", "--check"], { cwd: ROOT, stdio: "inherit" });
});

test("every prompt has a descending rarity ladder and an intact trap tier", () => {
  assert.equal(PROMPTS.length, 66);
  const agg = [0, 0, 0, 0, 0, 0, 0];
  PROMPTS.forEach((P, pi) => {
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (const tier of Object.keys(P.byTier)) c[tier] = P.byTier[tier].length;
    for (let t = 1; t <= 6; t++) agg[t] += c[t];
    assert.ok(c[1] > 0 && c[3] > 0 && c[4] > 0 && c[5] > 0 && c[6] > 0, P.q);
    assert.ok(c[1] > c[3] && c[3] > c[4] && c[4] > c[5] && c[5] > c[6], `${P.q} ${c.slice(1)}`);
    assert.ok(c[1] > c[2], P.q);
    assert.ok(c[6] >= 1 && c[6] <= 6, `${P.q} quasar ${c[6]}`);
    const ratios = [c[3] / c[1], c[4] / c[3], c[5] / c[4]];
    ratios.forEach((r) => assert.ok(r >= 0.5 && r <= 0.85, `${P.q} ratio ${r}`));
    const tc = game.TOO_CLEVER[pi] || [];
    assert.deepEqual((P.byTier[2] || []).map(gameNorm).sort(), tc.map(gameNorm).sort(), P.q);
    tc.forEach((name) => {
      const hit = exact(P, name);
      assert.ok(hit, name);
      assert.equal(hit.tier, 2, name);
      assert.equal(gameNorm(hit.label), gameNorm(name));
    });
    const seen = new Set();
    for (const [key, v] of P.m) {
      assert.equal(typeof key, "string");
      assert.ok(key.length > 0);
      assert.ok(!seen.has(key), `${P.q} duplicate ${key}`);
      seen.add(key);
      assert.ok(v.tier >= 1 && v.tier <= 6);
      assert.equal(P.m.get(key), v);
    }
  });
  assert.deepEqual(agg.slice(1), [5338, 24, 3728, 2609, 1825, 226]);
  assert.equal(agg.reduce((a, b) => a + b, 0), 13750);
  assert.equal(TIERS[1].n, "SPACE DUST");
  assert.equal(TIERS[2].n, "TOO CLEVER");
  assert.equal(TIERS[6].n, "ONE IN A QUASAR");
  assert.equal(TIERS[1].p, 10);
  assert.equal(TIERS[2].p, 15);
  assert.equal(TIERS[6].p, 100);
});

test("curated household answers stay common and the obscure tail stays Quasar", () => {
  const dust = [
    [0, "Earth"],
    [0, "Mars"],
    [4, "Cheddar"],
    [5, "McDonald's"],
    [6, "Labrador"],
    [8, "Apple"],
    [13, "California"],
    [14, "London"],
    [16, "Red"],
    [19, "Oxygen"],
    [29, "Frozen"],
    [42, "London"],
    [61, "Zebra"],
    [62, "Tokyo"],
  ];
  for (const [pi, name] of dust) {
    const hit = exact(PROMPTS[pi], name);
    assert.ok(hit, name);
    assert.equal(hit.tier, 1, `${name} landed in ${hit.tier}`);
  }
  const quasar = [
    [0, "Gonggong"],
    [3, "Comoros"],
    [13, "Delaware"],
    [19, "Oganesson"],
    [42, "Istok"],
  ];
  for (const [pi, name] of quasar) {
    const hit = exact(PROMPTS[pi], name);
    assert.ok(hit, name);
    assert.equal(hit.tier, 6, `${name} landed in ${hit.tier}`);
  }
  const traps = [
    [0, "Pluto"],
    [13, "Alaska"],
    [13, "Wyoming"],
    [19, "Helium"],
    [59, "Space toilet"],
    [59, "Toilet"],
    [61, "Quiz"],
  ];
  for (const [pi, name] of traps) {
    const hit = exact(PROMPTS[pi], name);
    assert.equal(hit.tier, 2, name);
  }
  assert.notEqual(exact(PROMPTS[61], "Ziploc").tier, 6);
  assert.equal(exact(PROMPTS[19], "Beryllium").tier, 1);
});

test("v4's most common answers are still Space Dust", () => {
  const v4 = loadRev("49bb9dc");
  const LV = [1, 3, 4, 5, 6];
  v4.BANK.forEach(([q, a], pi) => {
    const groups = a.split(" / ");
    const first = groups[0]
      .split(",")
      .map((s) => s.split("|")[0].trim())
      .filter(Boolean);
    first.forEach((name) => {
      const tc = (v4.TOO_CLEVER[pi] || []).map(norm);
      if (tc.includes(norm(name))) return;
      const hit = exact(PROMPTS[pi], name);
      assert.ok(hit, `${q} / ${name}`);
      assert.equal(hit.tier, 1, `${q} / ${name} -> ${hit && hit.tier}`);
    });
    assert.equal(groups.length >= 1, true);
    void LV;
  });
});

test("no accepted answer string was dropped", () => {
  const v5 = loadRev("704a2d2");
  const keysOf = (bank) =>
    bank.map(([q, a]) => {
      const keys = new Set();
      a.split(" / ").forEach((grp) =>
        grp.split(",").forEach((ans) =>
          ans
            .split("|")
            .map((x) => x.trim())
            .filter(Boolean)
            .forEach((x) => keys.add(norm(x)))
        )
      );
      return { q, keys };
    });
  const before = keysOf(v5.BANK);
  const after = keysOf(game.BANK);
  assert.equal(before.length, after.length);
  before.forEach((row, i) => {
    assert.equal(row.q, after[i].q);
    assert.deepEqual([...after[i].keys].sort(), [...row.keys].sort(), row.q);
  });
});

test("typo correction and exact matching", () => {
  assert.equal(gameNorm("The Moon"), norm("moon"));
  const planets = PROMPTS[0];
  assert.equal(exact(planets, "Earth").tier, 1);
  assert.equal(exact(planets, "earth").label, "Earth");
  assert.equal(exact(planets, "Pluto").tier, 2);
  const jup = correction(planets, "Jupter");
  assert.ok(jup, "Jupter should correct");
  assert.equal(norm(jup.label), norm("Jupiter"));
  const cal = correction(PROMPTS[13], "Califronia");
  assert.ok(cal, "Califronia should correct");
  assert.equal(norm(cal.label), norm("California"));
  assert.equal(exact(PROMPTS[13], "California").tier, 1);
  const sug = suggest(planets, "jupi");
  assert.ok(sug.length >= 1);
  assert.equal(norm(sug[0].label), norm("Jupiter"));
  assert.equal(correction(planets, "Earth"), null);
  assert.equal(correction(planets, "zzzznotaplanet"), null);
});
