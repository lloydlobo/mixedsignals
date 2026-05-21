import { makeInputs } from "./inputs.ts";
import type {
  BenchDef,
  BenchResult,
  RunConfig,
  VariantResult,
} from "./types.d.ts";

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

export async function run(
  def: BenchDef,
  config: RunConfig,
  onProgress?: (msg: string) => void,
): Promise<BenchResult> {
  const { iterations, range, runs } = config;

  const results: VariantResult[] = def.variants.map((v) => ({
    variant: v,
    times: [],
    median: 0,
    opsPerSec: 0,
    unsafe: v.unsafeFor?.includes(range) ?? false,
  }));

  for (let r = 0; r < runs; r++) {
    onProgress?.(`run ${r + 1} / ${runs} — generating inputs…`);
    await tick();

    const inputs = makeInputs(iterations, range);
    const order = shuffle(results.map((_, i) => i));

    for (const vi of order) {
      onProgress?.(`run ${r + 1} / ${runs} — "${def.variants[vi].name}"…`);
      await tick();

      // Warmup: small slice, discarded
      time(results[vi].variant.fn, inputs.subarray(0, Math.min(50_000, iterations)));
      await tick();

      results[vi].times.push(time(results[vi].variant.fn, inputs));
    }
  }

  for (const r of results) {
    r.times.sort((a, b) => a - b);
    r.median = median(r.times);
    r.opsPerSec = iterations / (r.median / 1000);
  }

  results.sort((a, b) => b.opsPerSec - a.opsPerSec);

  return { def, config, results };
}

// ─── INTERNAL ────────────────────────────────────────────────────────────────

/** Times a single pass over the input array. Returns elapsed ms. */
function time(fn: (u: number) => number, inputs: Float64Array): number {
  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < inputs.length; i++) sink += fn(inputs[i]);
  const elapsed = performance.now() - t0;
  // Prevent dead-code elimination
  if (sink === Infinity) console.log(sink);
  return elapsed;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
