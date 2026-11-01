// Loads the real buildPlan code out of tho-wim-hof.html and runs it in a vm,
// so tests always exercise the shipped code instead of a copy.
// The cut relies on two marker comments; see AGENTS.md ("Bẫy khi sửa file HTML").
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const START = "/* ---------- lịch buổi tập ---------- */";
const END = "/* ---------- âm thanh ---------- */";
const HINT = "If the comment was renamed on purpose, update tests/load-plan.mjs (see AGENTS.md).";

export function loadPlan(htmlPath = process.env.WHM_HTML || fileURLToPath(new URL("../tho-wim-hof.html", import.meta.url))) {
  const html = readFileSync(htmlPath, "utf8");
  const tempo = html.match(/^const TEMPO=.*;/m);
  if (!tempo) throw new Error(`load-plan: line "const TEMPO=...;" not found in ${htmlPath}. ${HINT}`);
  const a = html.indexOf(START);
  if (a < 0) throw new Error(`load-plan: start marker ${START} not found in ${htmlPath}. ${HINT}`);
  const b = html.indexOf(END, a);
  if (b < 0) throw new Error(`load-plan: end marker ${END} not found after the start marker in ${htmlPath}. ${HINT}`);
  const code = `${tempo[0]}\n${html.slice(a, b)}\n({buildPlan,TEMPO,LAST_OUT,RECOVER,REST,PAUSE,NEXT})`;
  let out;
  try {
    out = vm.runInNewContext(code, {}, { filename: "tho-wim-hof.html#buildPlan" });
  } catch (e) {
    // A ReferenceError here usually means buildPlan now needs something outside the block.
    throw new Error(`load-plan: the cut block failed to run (${e.message}). ${HINT}`, { cause: e });
  }
  if (typeof out.buildPlan !== "function") throw new Error(`load-plan: buildPlan is not a function in the cut block of ${htmlPath}. ${HINT}`);
  // Objects made inside the vm have foreign prototypes, which breaks assert.deepStrictEqual; clone them back.
  const { buildPlan } = out;
  return { ...structuredClone({ ...out, buildPlan: undefined }), buildPlan: st => structuredClone(buildPlan(st)) };
}
