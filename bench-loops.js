/*
Use a blank tab (about:blank), open DevTools → Console, paste the entire script, and run it.

This creates a synthetic DOM, warms up JIT, and runs a broad benchmark suite that progressively isolates:

- Array iteration
- NodeList iteration
- callback overhead
- forEach vs for...of vs classic for
- DOM mutation cost
- query cost
- large-node stress
- frame-budget behavior
- full end-to-end game-like paths

No external page or game required.
*/

/*
Benchmark summary (Chrome Incognito + about:blank, synthetic 10k-node test)

Results:

A) Array iteration
forEach     ≈2562ms
for...of    ≈2471ms
classic for ≈2478ms

→ Arrays are effectively a tie.
→ V8 optimizes array traversal heavily.
→ Loop choice on real arrays barely matters.

B) NodeList iteration
forEach     ≈7228ms
for...of    ≈7505ms
classic for ≈3967ms

→ Direct NodeList traversal is different.
→ Classic index loop was ~1.8x faster.
→ Iterator/callback machinery becomes measurable.

C) DOM mutation
forEach     ≈14785ms
for...of    ≈14723ms
classic for ≈14739ms

→ Nearly identical (<0.5% difference).
→ removeAttribute() dominates cost.
→ Loop overhead disappears into noise.

D) Full query path
query + forEach     ≈638ms
query + for...of    ≈649ms
query + classic     ≈633ms

→ Very close.
→ querySelectorAll + DOM access dominates.

E) Callback overhead only
forEach     ≈32ms
for...of    ≈3.5ms
classic     ≈2.6ms

→ Pure callback invocation cost is real.
→ forEach ~10–13x slower only when body does almost no work.
→ Hot CPU loops (particles/audio/grids/etc.) may care.

F) Cached length
uncached    ≈2457ms
cached      ≈2465ms

→ Modern V8 already optimizes length access.
→ Manual caching is effectively dead folklore.

Practical guidance:

Occasional DOM operation:

document
  .querySelectorAll(...)
  .forEach(n => void n.removeAttribute(...));

Keep it. Readability wins.

Per-frame / hot NodeList loop:

const nodes = document.querySelectorAll(...);

for (let i = 0; i < nodes.length; i++)
    nodes[i].removeAttribute(...);

Reason:
Classic indexing was consistently faster for NodeLists,
but DOM mutation cost dwarfed loop differences overall.

Main finding:
Loop micro-optimizations matter for tight CPU loops.
DOM work usually dominates browser code.
*/

(() => {
	console.clear();

	////////////////////////////////////////////////////////////////////////////////
	// CONFIG
	////////////////////////////////////////////////////////////////////////////////

	const NODE_COUNT = 10000;
	const RUNS = 1000;
	const WARMUP = 300;

	////////////////////////////////////////////////////////////////////////////////
	// DOM SETUP
	////////////////////////////////////////////////////////////////////////////////

	const root = document.createElement("div");

	root.id = "bench-root";

	let html = "";

	for (let i = 0; i < NODE_COUNT; i++) {
		html += `
    <div
        class="bench"
        filter="url(#logoGlowSoft)"
        data-id="${i}">
    </div>`;
	}

	root.innerHTML = html;

	document.body.append(root);

	const nodeList = document.querySelectorAll(".bench");

	const array = [...nodeList];

	////////////////////////////////////////////////////////////////////////////////
	// HELPERS
	////////////////////////////////////////////////////////////////////////////////

	function warmup(fn) {
		for (let i = 0; i < WARMUP; i++) fn();
	}

	function bench(name, fn) {
		warmup(fn);

		const t0 = performance.now();

		for (let i = 0; i < RUNS; i++) fn();

		const dt = performance.now() - t0;

		console.log(name.padEnd(35), `${dt.toFixed(2)} ms`);

		return dt;
	}

	function resetFilters() {
		for (let i = 0; i < nodeList.length; i++) nodeList[i].setAttribute("filter", "url(#logoGlowSoft)");
	}

	////////////////////////////////////////////////////////////////////////////////
	// A
	// ARRAY ITERATION ONLY
	////////////////////////////////////////////////////////////////////////////////

	console.log("\n===== A: ARRAY ITERATION =====");

	bench("forEach+void", () => {
		array.forEach(n => void n.hasAttribute("x"));
	});

	bench("for...of", () => {
		for (const n of array) n.hasAttribute("x");
	});

	bench("classic for", () => {
		for (let i = 0; i < array.length; i++) array[i].hasAttribute("x");
	});

	////////////////////////////////////////////////////////////////////////////////
	// B
	// NODELIST ITERATION
	////////////////////////////////////////////////////////////////////////////////

	console.log("\n===== B: NODELIST ITERATION =====");

	bench("NodeList forEach", () => {
		nodeList.forEach(n => void n.hasAttribute("x"));
	});

	bench("NodeList for..of", () => {
		for (const n of nodeList) n.hasAttribute("x");
	});

	bench("NodeList classic", () => {
		for (let i = 0; i < nodeList.length; i++) nodeList[i].hasAttribute("x");
	});

	////////////////////////////////////////////////////////////////////////////////
	// C
	// ATTRIBUTE MUTATION
	////////////////////////////////////////////////////////////////////////////////

	console.log("\n===== C: removeAttribute =====");

	bench("forEach remove", () => {
		resetFilters();

		array.forEach(n => void n.removeAttribute("filter"));
	});

	bench("for..of remove", () => {
		resetFilters();

		for (const n of array) n.removeAttribute("filter");
	});

	bench("classic remove", () => {
		resetFilters();

		for (let i = 0; i < array.length; i++) array[i].removeAttribute("filter");
	});

	////////////////////////////////////////////////////////////////////////////////
	// D
	// QUERY + ITERATION
	////////////////////////////////////////////////////////////////////////////////

	console.log("\n===== D: FULL QUERY =====");

	bench("query + forEach", () => {
		document.querySelectorAll('[filter="url(#logoGlowSoft)"]').forEach(n => void n.hasAttribute("x"));
	});

	bench("query + for..of", () => {
		for (const n of document.querySelectorAll('[filter="url(#logoGlowSoft)"]')) n.hasAttribute("x");
	});

	bench("query + classic", () => {
		const x = document.querySelectorAll('[filter="url(#logoGlowSoft)"]');

		for (let i = 0; i < x.length; i++) x[i].hasAttribute("x");
	});

	////////////////////////////////////////////////////////////////////////////////
	// E
	// PURE CALLBACK COST
	////////////////////////////////////////////////////////////////////////////////

	console.log("\n===== E: CALLBACK =====");

	const nums = new Array(10000).fill(0);

	bench("array forEach callback", () => {
		nums.forEach(n => void (n + 1));
	});

	bench("for...of callback", () => {
		for (const n of nums) n + 1;
	});

	bench("classic callback", () => {
		for (let i = 0; i < nums.length; i++) nums[i] + 1;
	});

	////////////////////////////////////////////////////////////////////////////////
	// F
	// CACHED LENGTH
	////////////////////////////////////////////////////////////////////////////////

	console.log("\n===== F: CACHED LENGTH =====");

	bench("classic uncached", () => {
		for (let i = 0; i < array.length; i++) array[i].hasAttribute("x");
	});

	bench("classic cached", () => {
		for (let i = 0, len = array.length; i < len; i++) array[i].hasAttribute("x");
	});

	////////////////////////////////////////////////////////////////////////////////
	// G
	// DESTRUCTURING
	////////////////////////////////////////////////////////////////////////////////

	console.log("\n===== G: FOR OF DESTRUCTURE =====");

	const pairs = array.map((x, i) => [x, i]);

	bench("for..of pair", () => {
		for (const [n, _i] of pairs) n.hasAttribute("data-id");
	});

	////////////////////////////////////////////////////////////////////////////////
	// H
	// FRAME TEST
	////////////////////////////////////////////////////////////////////////////////

	console.log("\n===== H: FRAME TEST =====");

	let frame = 0;

	function frameLoop() {
		const t0 = performance.now();

		for (let i = 0; i < array.length; i++) array[i].hasAttribute("x");

		const dt = performance.now() - t0;

		console.log("frame", frame++, dt.toFixed(3));

		if (frame < 30) requestAnimationFrame(frameLoop);
	}

	requestAnimationFrame(frameLoop);

	////////////////////////////////////////////////////////////////////////////////
	// I
	// DOM CREATION
	////////////////////////////////////////////////////////////////////////////////

	console.log("\n===== I: CREATE ELEMENT =====");

	bench("createElement", () => {
		const x = document.createElement("div");

		x.className = "foo";
	});

	////////////////////////////////////////////////////////////////////////////////
	// J
	// APPEND COST
	////////////////////////////////////////////////////////////////////////////////

	console.log("\n===== J: APPEND =====");

	bench("append child", () => {
		const x = document.createElement("div");

		root.append(x);

		x.remove();
	});

	////////////////////////////////////////////////////////////////////////////////
	// SUMMARY
	////////////////////////////////////////////////////////////////////////////////

	console.log(
		`
=========================

A iteration only
B nodelist
C mutation
D full query
E callback overhead
F length cache
G iterator cost
H frame budget
I creation
J append

=========================
`,
	);
})();

/*
Interpretation guide:

    A/B
        isolates loop machinery

    C
        mutation dominates

    D
        closest to your real code

    E
        callback overhead only

    F
        checks old "cache length" folklore

    G
        iterator/destructuring tax

    H
        actual frame timing

    I/J
        DOM operation baseline

Run it 2–3 times in fresh Incognito tabs. First runs often include JIT compilation noise; subsequent runs are more representative.
*/

/* 
VM12:2 Console was cleared
VM12:70 
===== A: ARRAY ITERATION =====
VM12:56 forEach+void                        2561.70 ms
VM12:56 for...of                            2470.80 ms
VM12:56 classic for                         2477.90 ms
VM12:89 
===== B: NODELIST ITERATION =====
VM12:56 NodeList forEach                    7228.30 ms
VM12:56 NodeList for..of                    7505.30 ms
VM12:56 NodeList classic                    3967.20 ms
VM12:108 
===== C: removeAttribute =====
VM12:56 forEach remove                      14785.00 ms
VM12:56 for..of remove                      14723.10 ms
VM12:56 classic remove                      14739.40 ms
VM12:133 
===== D: FULL QUERY =====
VM12:56 query + forEach                     638.40 ms
VM12:56 query + for..of                     649.20 ms
VM12:56 query + classic                     633.40 ms
VM12:154 
===== E: CALLBACK =====
VM12:56 array forEach callback              32.00 ms
VM12:56 for...of callback                   3.50 ms
VM12:56 classic callback                    2.60 ms
VM12:175 
===== F: CACHED LENGTH =====
VM12:56 classic uncached                    2456.80 ms
VM12:56 classic cached                      2465.30 ms
VM12:190 
===== G: FOR OF DESTRUCTURE =====
VM12:56 for..of pair                        1136.90 ms
VM12:203 
===== H: FRAME TEST =====
VM12:226 
===== I: CREATE ELEMENT =====
VM12:56 createElement                       0.50 ms
VM12:239 
===== J: APPEND =====
VM12:56 append child                        0.90 ms
VM12:253 
=========================

A iteration only
B nodelist
C mutation
D full query
E callback overhead
F length cache
G iterator cost
H frame budget
I creation
J append

=========================

undefined
VM12:214 frame 0 3.400
VM12:214 frame 1 3.000
VM12:214 frame 2 4.900
VM12:214 frame 3 3.000
VM12:214 frame 4 3.000
VM12:214 frame 5 2.900
VM12:214 frame 6 3.200
VM12:214 frame 7 4.200
VM12:214 frame 8 13.800
VM12:214 frame 9 13.700
VM12:214 frame 10 7.800
VM12:214 frame 11 6.000
VM12:214 frame 12 6.100
VM12:214 frame 13 4.600
VM12:214 frame 14 4.800
VM12:214 frame 15 3.200
VM12:214 frame 16 4.500
VM12:214 frame 17 4.000
VM12:214 frame 18 6.200
VM12:214 frame 19 5.000
VM12:214 frame 20 7.200
VM12:214 frame 21 7.100
VM12:214 frame 22 3.200
VM12:214 frame 23 3.000
VM12:214 frame 24 4.900
VM12:214 frame 25 5.800
VM12:214 frame 26 4.800
VM12:214 frame 27 7.800
VM12:214 frame 28 6.000
VM12:214 frame 29 6.200
 */
