import type { InputMeta, InputRange } from "./types.d.ts";

// ─── METADATA ────────────────────────────────────────────────────────────────

export const INPUT_RANGES: InputMeta[] = [
  {
    id: "unit",
    label: "unit  [0, 1)",
    description: "Strictly in-range. Tests the no-op path.",
  },
  {
    id: "near",
    label: "near  [-0.1, 1.1)",
    description: "Slightly out-of-range. Closest to real accumulator drift.",
  },
  {
    id: "large",
    label: "large [-1000, 1000)",
    description: "Arbitrary magnitude. Stress-tests overflow and loop cost.",
  },
];

// ─── GENERATORS ──────────────────────────────────────────────────────────────

const GENERATORS: Record<InputRange, (n: number) => Float64Array> = {
  unit:  (n) => fill(n, () => Math.random()),
  near:  (n) => fill(n, () => Math.random() * 1.2 - 0.1),
  large: (n) => fill(n, () => Math.random() * 2000 - 1000),
};

export function makeInputs(n: number, range: InputRange): Float64Array {
  return GENERATORS[range](n);
}

// ─── INTERNAL ────────────────────────────────────────────────────────────────

function fill(n: number, gen: () => number): Float64Array {
  const arr = new Float64Array(n);
  for (let i = 0; i < n; i++) arr[i] = gen();
  return arr;
}
