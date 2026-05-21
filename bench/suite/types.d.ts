// ─── INPUTS ──────────────────────────────────────────────────────────────────

export type InputRange = "unit" | "near" | "large";

export interface InputMeta {
  id: InputRange;
  label: string;
  description: string;
}

// ─── VARIANT ─────────────────────────────────────────────────────────────────

export interface Variant {
  /** Short display name, e.g. "Math.floor" */
  name: string;
  /** One-liner shown under the name in the results table */
  code: string;
  /** The function under test. Receives a single float, returns a float. */
  fn: (u: number) => number;
  /**
   * Optional: flag this variant as unsafe for certain input ranges.
   * The runner will show a warning rather than treating results as reliable.
   */
  unsafeFor?: InputRange[];
}

// ─── BENCH DEFINITION ────────────────────────────────────────────────────────

export interface BenchDef {
  /** Title shown in the runner UI */
  name: string;
  /**
   * Optional prose shown below the results table.
   * Use it to document constraints, known edge cases, etc.
   */
  notes?: string;
  variants: Variant[];
}

// ─── RUNNER CONFIG ───────────────────────────────────────────────────────────

export interface RunConfig {
  iterations: number;
  range: InputRange;
  runs: number;
}

// ─── RESULTS ─────────────────────────────────────────────────────────────────

export interface VariantResult {
  variant: Variant;
  /** Raw elapsed times per run, ms */
  times: number[];
  /** Median elapsed, ms */
  median: number;
  opsPerSec: number;
  unsafe: boolean;
}

export interface BenchResult {
  def: BenchDef;
  config: RunConfig;
  /** Sorted fastest → slowest */
  results: VariantResult[];
}
