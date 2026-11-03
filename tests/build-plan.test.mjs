// Tests for buildPlan (session timeline). Run: node --test --test-concurrency=1 tests/
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlan } from "./load-plan.mjs";

const { buildPlan } = loadPlan();
const DEF = { breaths: 30, rounds: 3, hold1: 30, holdInc: 30, speed: "std" };
const EPS = 1e-6;

const near = (a, b, eps = EPS, msg) => assert.ok(Math.abs(a - b) < eps, msg ?? `expected ${b}, got ${a}`);
const ofType = (plan, type) => plan.ph.filter(p => p.type === type);
const inPhase = (plan, p) => plan.ev.filter(e => e.t >= p.start - EPS && e.t < p.start + p.dur - EPS);
const byKey = (evs, key) => evs.filter(e => e.key === key);
const count = (plan, pred) => plan.ev.filter(pred).length;

describe("defaults", () => {
  const plan = buildPlan(DEF);

  test("total is 591.15 s", () => {
    // Hand-computed: std in 2.3 + out 1.55 = 3.85; breathe = 29*3.85 + 2.3 + 2.5 = 116.45;
    // rounds 116.45+30+15+4+2.5 = 167.95, 116.45+60+15+4+2.5 = 197.95, 116.45+90+15+3 = 224.45; +0.8 lead-in.
    near(plan.total, 591.15, 0.01);
  });

  test("phase counts", () => {
    const n = t => ofType(plan, t).length;
    assert.deepEqual(
      { breathe: n("breathe"), hold: n("hold"), recover: n("recover"), rest: n("rest"), next: n("next"), closing: n("closing") },
      { breathe: 3, hold: 3, recover: 3, rest: 3, next: 2, closing: 1 });
  });

  test("hold grows by holdInc each round", () => {
    assert.deepEqual(ofType(plan, "hold").map(p => p.dur), [30, 60, 90]);
  });

  test("rest is 4 s between rounds and 3 s after the last", () => {
    assert.deepEqual(ofType(plan, "rest").map(p => p.dur), [4, 4, 3]);
  });

  test("first three breaths are voiced at hand-computed times", () => {
    const r0 = inPhase(plan, ofType(plan, "breathe")[0]);
    assert.equal(byKey(r0, "hit-vao").length, 3);
    assert.equal(byKey(r0, "tho-ra").length, 3);
    byKey(r0, "hit-vao").forEach((e, i) => near(e.t, [0.8, 4.65, 8.5][i]));
    byKey(r0, "tho-ra").forEach((e, i) => near(e.t, [3.1, 6.95, 10.8][i]));
  });
});

test("breathe duration per speed (30 breaths)", () => {
  // Hand-computed (N-1)*(in+out) + in + 2.5 last exhale, in 2.3/1.8/2.8:
  // std 29*3.85+2.3+2.5 = 116.45, fast 29*3.1+1.8+2.5 = 94.2, slow 29*4.6+2.8+2.5 = 138.7.
  for (const [speed, dur] of [["std", 116.45], ["fast", 94.2], ["slow", 138.7]]) {
    const b = ofType(buildPlan({ ...DEF, speed }), "breathe");
    for (const p of b) near(p.dur, dur, EPS, `${speed}: expected ${dur}, got ${p.dur}`);
  }
});

test("single round: no next phase, final rest has no pause", () => {
  const plan = buildPlan({ ...DEF, rounds: 1 });
  assert.equal(ofType(plan, "next").length, 0);
  assert.deepEqual(ofType(plan, "rest").map(p => p.dur), [3]);
  near(plan.total, 0.8 + 116.45 + 30 + 15 + 3); // 165.25
});

/* ---------- invariants over the app's limit corners ---------- */
function checkInvariants(st) {
  const plan = buildPlan(st);
  const { ph, ev, total } = plan;

  // contiguous phases from the 0.8 s lead-in, ending in an open-ended closing
  near(ph[0].start, 0.8);
  for (let i = 1; i < ph.length; i++) near(ph[i].start, ph[i - 1].start + ph[i - 1].dur, EPS, `gap before phase ${i} (${ph[i].type})`);
  const last = ph.at(-1);
  assert.equal(last.type, "closing");
  assert.equal(last.dur, Infinity);
  near(total, last.start);

  // events sorted and inside the session
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, `events out of order at ${i}`);
  for (const e of ev) assert.ok(e.t >= 0 && e.t <= total, `event ${e.key ?? e.chime} at ${e.t} outside [0, ${total}]`);

  // phase order per round
  const want = [];
  for (let r = 0; r < st.rounds; r++) want.push("breathe", "hold", "recover", "rest", ...(r < st.rounds - 1 ? ["next"] : []));
  assert.deepEqual(ph.map(p => p.type), [...want, "closing"]);

  // chimes: one 330 at each hold start, one 523 at each recover start
  const holds = ofType(plan, "hold"), recovers = ofType(plan, "recover");
  assert.equal(count(plan, e => e.chime === 330), st.rounds);
  assert.equal(count(plan, e => e.chime === 523), st.rounds);
  for (const p of holds) assert.equal(count(plan, e => e.chime === 330 && Math.abs(e.t - p.start) < EPS), 1);
  for (const p of recovers) assert.equal(count(plan, e => e.chime === 523 && Math.abs(e.t - p.start) < EPS), 1);

  ofType(plan, "breathe").forEach((p, r) => {
    const evs = inPhase(plan, p);
    const marks = ["vong-tron", "con-10", "con-5"].map(k => byKey(evs, k));
    for (const m of marks) assert.equal(m.length, 1);
    const [vt, c10, c5] = marks.map(m => m[0].t);
    assert.ok(vt > 0 && vt < c10 && c10 < c5, `round ${r}: breath marks out of order (${vt}, ${c10}, ${c5})`);
    // the three guided breaths come first, before the "vong-tron" cue
    for (const k of ["hit-vao", "tho-ra"]) {
      const v = byKey(evs, k);
      assert.equal(v.length, 3, `round ${r}: ${k} x${v.length}`);
      for (const e of v) assert.ok(e.t < vt, `round ${r}: ${k} at ${e.t} after vong-tron`);
    }
    assert.equal(byKey(evs, "nin-tho").length, 1);
  });

  holds.forEach((p, r) => {
    const end = p.start + p.dur, evs = inPhase(plan, p);
    assert.equal(p.dur, st.hold1 + st.holdInc * r);
    // countdown 5..1, one second apart, last one a second before the hold ends
    const dem = [5, 4, 3, 2, 1].map(k => byKey(evs, "dem-" + k));
    for (const d of dem) assert.equal(d.length, 1);
    dem.forEach((d, i) => near(d[0].t, end - (5 - i)));
    // no prompt runs past the end of the hold, and prompts never overlap
    const voiced = evs.filter(e => e.key);
    for (const e of voiced) assert.ok(e.t + e.d <= end + EPS, `round ${r}: ${e.key} overruns hold end`);
    const s = [...voiced].sort((a, b) => a.t - b.t);
    for (let i = 1; i < s.length; i++) assert.ok(s[i].t >= s[i - 1].t + s[i - 1].d - EPS, `round ${r}: ${s[i - 1].key} overlaps ${s[i].key}`);
  });

  recovers.forEach((p, r) => assert.equal(byKey(inPhase(plan, p), "phuc-hoi").length, 1, `round ${r}: phuc-hoi`));
  const nexts = ofType(plan, "next");
  assert.equal(count(plan, e => e.key === "vong-tiep"), st.rounds - 1);
  for (const p of nexts) assert.equal(byKey(inPhase(plan, p), "vong-tiep").length, 1);
}

describe("invariants at limit corners", () => {
  const cases = [DEF];
  for (const breaths of [20, 60]) for (const rounds of [1, 10]) for (const hold1 of [15, 180])
    for (const holdInc of [0, 60]) for (const speed of ["std", "fast", "slow"]) cases.push({ breaths, rounds, hold1, holdInc, speed });
  for (const st of cases) test(JSON.stringify(st), () => checkInvariants(st));
});

/* ---------- deliberate edges ---------- */
describe("edges", () => {
  const one = (o) => buildPlan({ ...DEF, rounds: 1, holdInc: 0, ...o });
  const holdEvs = plan => inPhase(plan, ofType(plan, "hold")[0]);

  test("hold 15: quan-sat kept, lam-tot dropped", () => {
    const evs = holdEvs(one({ hold1: 15 }));
    // quan-sat 0.6..7.6 fits before dem-5 at 10
    assert.equal(byKey(evs, "quan-sat").length, 1);
    // lam-tot would run 7.5..14.5, overlapping quan-sat (to 7.6) and dem-5 (10..10.8), so add() rejects it
    assert.equal(byKey(evs, "lam-tot").length, 0);
  });

  test("hold 79 has no sap-xong; hold 80 has it at H-30", () => {
    // code gate is H>=80 (79 is off the UI's 5 s step, but it pins the boundary)
    assert.equal(byKey(holdEvs(one({ hold1: 79 })), "sap-xong").length, 0);
    const plan = one({ hold1: 80 }), h = ofType(plan, "hold")[0];
    const sx = byKey(holdEvs(plan), "sap-xong");
    assert.equal(sx.length, 1);
    near(sx[0].t, h.start + 50); // 80 - 30
  });

  test("breaths 20: breath marks at hand-computed times inside the breathe phase", () => {
    const plan = one({ breaths: 20 }), b = ofType(plan, "breathe")[0];
    const evs = inPhase(plan, b);
    // std bt 3.85 from 0.8: breath 5 -> 0.8+4*3.85, breath 11 -> 0.8+10*3.85, breath 16 -> 0.8+15*3.85
    near(byKey(evs, "vong-tron")[0].t, 16.2);
    near(byKey(evs, "con-10")[0].t, 39.3);
    near(byKey(evs, "con-5")[0].t, 58.55);
    near(b.dur, 19 * 3.85 + 4.8); // 77.95
  });
});

/* ---------- loader guards ---------- */
test("loader fails loudly when a marker comment is renamed", () => {
  const html = readFileSync(fileURLToPath(new URL("../tho-wim-hof.html", import.meta.url)), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "whm-test-"));
  try {
    const f = join(dir, "copy.html");
    writeFileSync(f, html.replace("---------- lịch buổi tập ----------", "---------- schedule ----------"));
    assert.throws(() => loadPlan(f), /start marker .*lịch buổi tập.*AGENTS\.md/s);
    writeFileSync(f, html.replace("---------- âm thanh ----------", "---------- audio ----------"));
    assert.throws(() => loadPlan(f), /end marker .*âm thanh.*AGENTS\.md/s);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
