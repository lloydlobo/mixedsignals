/**
 * 🚀 DIGITAL SQUIRM PERF v5.1
 * Ground Truth Edition
 *
 * Fixes:
 * - finite run (not forever)
 * - adaptive refresh detection
 * - no console spam
 * - replay profiling
 * - subsystem profiling
 * - long-task detection
 * - memory report
 */

const perfAuditDeepScan = (function () {

    let measures = {};

    let started = false;

    const SAMPLE_FRAMES = 240;

    const replayCanvas = document.createElement("canvas");

    replayCanvas.width = 1200;
    replayCanvas.height = 400;

    const replayCtx =
        replayCanvas.getContext("2d");

    function hydrate() {

        window.SAMPLERS ??= {};
        window.Session ??= {};

        if (!window.SAMPLERS.sine)
            window.SAMPLERS.sine =
                x => Math.sin(x);

        if (typeof window.gameRand !== "function")
            window.gameRand = Math.random;

    }

    function avg(a) {

        return a.length
            ? a.reduce((x, y) => x + y, 0) / a.length
            : 0;

    }

    function p95(a) {

        const s = [...a]
            .sort((x, y) => x - y);

        return s[
            Math.floor(
                s.length * .95
            )
        ];

    }

    function mark(name, fn) {

        const t0 =
            performance.now();

        const r = fn();

        const dt =
            performance.now() - t0;

        measures[name] ??= [];

        measures[name]
            .push(dt);

        return r;

    }

    async function captureReplay(canvas) {

        replayCtx.clearRect(
            0,
            0,
            replayCanvas.width,
            replayCanvas.height
        );

        replayCtx.drawImage(
            canvas,
            0,
            0
        );

        return new Promise(resolve => {

            replayCanvas.toBlob(
                blob => resolve(blob),
                "image/webp",
                .5
            );

        });

    }

    function installLongTaskObserver() {

        if (
            !window.PerformanceObserver
        )
            return;

        try {

            new PerformanceObserver(
                list => {

                    for (
                        const e
                        of list.getEntries()
                    ) {

                        console.warn(
                            "🚨 LongTask",
                            e.duration
                                .toFixed(2) + "ms"
                        );

                    }

                })

                .observe({

                    entryTypes: [
                        "longtask"
                    ]

                });

        }

        catch (e) { }

    }

    function memoryProbe() {

        if (!performance.memory)
            return "unsupported";

        return {

            usedMB: (
                performance.memory
                    .usedJSHeapSize
                / 1048576
            ).toFixed(2),

            totalMB: (
                performance.memory
                    .totalJSHeapSize
                / 1048576
            ).toFixed(2)

        };

    }

    function runSubsystems() {

        hydrate();

        try {

            if (window.matchScore)
                mark(
                    "matchScore",
                    () => matchScore()
                );

            if (window.drawWave)
                mark(
                    "drawWave",
                    () => drawWave(
                        window.targetSignal,
                        "#fff",
                        1200,
                        400,
                        0,
                        1.8
                    )
                );

            if (window.syncLabels)
                mark(
                    "syncLabels",
                    () => syncLabels()
                );

            if (window.readSliders)
                mark(
                    "readSliders",
                    () => readSliders()
                );

            if (window.updateMeters)
                mark(
                    "updateMeters",
                    () => updateMeters(95)
                );

        }
        catch (e) {

            console.warn(e);

        }

    }

    function summarizeSubsystems() {

        const report = {};

        Object.entries(measures)
            .forEach(([k, v]) => {

                report[k] = {

                    avg:
                        avg(v)
                            .toFixed(4) + "ms",

                    worst:
                        Math.max(...v)
                            .toFixed(4) + "ms",

                    calls: v.length

                };

            });

        console.log(
            "%c🚀 GROUND TRUTH REPORT",
            "font-weight:bold"
        );

        console.table(report);

        console.table({
            memory:
                memoryProbe()
        });

    }

    async function replayAudit() {

        const canvas =
            document.querySelector(
                "canvas"
            );

        if (!canvas)
            return;

        const t0 =
            performance.now();

        await captureReplay(
            canvas
        );

        const dt =
            performance.now() - t0;

        console.log(
            "Replay:",
            dt.toFixed(2) + "ms"
        );

    }

    function profileFrames() {

        return new Promise(resolve => {

            let frames = [];

            let last = 0;

            let refreshEstimate = [];

            function tick(now) {

                if (last) {

                    const dt =
                        now - last;

                    refreshEstimate
                        .push(dt);

                    frames.push(dt);

                }

                last = now;

                if (
                    frames.length
                    < SAMPLE_FRAMES
                ) {

                    requestAnimationFrame(
                        tick
                    );

                    return;
                }

                const refresh =
                    avg(refreshEstimate);

                const budget =
                    refresh * 1.5;

                const longFrames =
                    frames.filter(
                        x => x > budget
                    );

                console.table({

                    avg:
                        avg(frames)
                            .toFixed(2) + "ms",

                    fps:
                        (
                            1000 /
                            avg(frames)
                        )
                            .toFixed(1),

                    p95:
                        p95(frames)
                            .toFixed(2) + "ms",

                    worst:
                        Math.max(
                            ...frames
                        )
                            .toFixed(2) + "ms",

                    longFrames:
                        longFrames.length,

                    budget:
                        budget
                            .toFixed(2) + "ms"

                });

                resolve();

            }

            requestAnimationFrame(
                tick
            );

        });

    }

    return {

        async runAll() {

            if (started) {

                console.log(
                    "🔄 rerun"
                );

            }

            started = true;

            measures = {};

            console.clear();

            installLongTaskObserver();

            console.log(
                "%c🛰 PERF START",
                "font-weight:bold"
            );

            for (
                let i = 0;
                i < 30;
                i++
            ) {

                runSubsystems();

                await new Promise(
                    r =>
                        requestAnimationFrame(r)
                );

            }

            await replayAudit();

            summarizeSubsystems();

            await profileFrames();

        }

    };

})();

window.perfAuditDeepScan = perfAudit;



// /**
//  * perf.js v5 — Ground Truth Audit Suite
//  * Drop-in replacement
//  *
//  * Focus:
//  * - Actual frame timing
//  * - Long frame detection
//  * - Long task detection
//  * - Replay timing
//  * - Subsystem profiling
//  * - Memory tracking
//  * - Dirty-path auditing
//  */
// 
// const perfAudit = (function () {
// 
//     let rafLast = 0;
//     const frameSamples = [];
//     const FRAME_WINDOW = 240;
//     const LONG_FRAME_MS = 16.67;
// 
//     const replayCanvas = document.createElement('canvas');
//     replayCanvas.width = 1200;
//     replayCanvas.height = 400;
//     const replayCtx = replayCanvas.getContext('2d');
// 
//     const measures = {};
// 
//     function hydrate() {
// 
//         window.SAMPLERS ??= {};
//         window.Session ??= {};
// 
//         if (!window.SAMPLERS.sine)
//             window.SAMPLERS.sine = x => Math.sin(x);
// 
//         if (typeof window.gameRand !== 'function')
//             window.gameRand = Math.random;
// 
//     }
// 
//     function avg(arr) {
//         return arr.reduce((a, b) => a + b, 0) / arr.length;
//     }
// 
//     function p95(arr) {
//         const s = [...arr].sort((a, b) => a - b);
//         return s[Math.floor(s.length * .95)];
//     }
// 
//     function mark(name, fn) {
// 
//         const s = performance.now();
//         const result = fn();
//         const dt = performance.now() - s;
// 
//         measures[name] ??= [];
//         measures[name].push(dt);
// 
//         return result;
//     }
// 
//     async function captureReplay(canvas) {
// 
//         replayCtx.clearRect(
//             0,
//             0,
//             replayCanvas.width,
//             replayCanvas.height
//         );
// 
//         replayCtx.drawImage(canvas, 0, 0);
// 
//         return new Promise(resolve => {
// 
//             replayCanvas.toBlob(
//                 blob => resolve(blob),
//                 'image/webp',
//                 .5
//             );
// 
//         });
//     }
// 
//     function frameTick(now) {
// 
//         if (rafLast !== 0) {
// 
//             const dt = now - rafLast;
// 
//             frameSamples.push(dt);
// 
//             if (dt > LONG_FRAME_MS) {
// 
//                 console.warn(
//                     '⚠ LONG FRAME',
//                     dt.toFixed(2) + 'ms'
//                 );
//             }
// 
//             if (frameSamples.length >= FRAME_WINDOW) {
// 
//                 const average = avg(frameSamples);
// 
//                 console.table({
// 
//                     avg: average.toFixed(2) + 'ms',
// 
//                     fps: (1000 / average)
//                         .toFixed(1),
// 
//                     p95: p95(frameSamples)
//                         .toFixed(2) + 'ms',
// 
//                     worst: Math.max(...frameSamples)
//                         .toFixed(2) + 'ms'
// 
//                 });
// 
//                 frameSamples.length = 0;
//             }
//         }
// 
//         rafLast = now;
// 
//         requestAnimationFrame(frameTick);
//     }
// 
//     function installLongTaskObserver() {
// 
//         if (
//             !window.PerformanceObserver
//         ) return;
// 
//         try {
// 
//             new PerformanceObserver(list => {
// 
//                 for (const e of list.getEntries()) {
// 
//                     console.warn(
//                         '🚨 LongTask',
//                         e.duration.toFixed(2) + 'ms'
//                     );
//                 }
// 
//             }).observe({
//                 entryTypes: ['longtask']
//             });
// 
//         }
//         catch (e) { }
//     }
// 
//     function memoryProbe() {
// 
//         if (!performance.memory)
//             return 'unsupported';
// 
//         return {
// 
//             usedMB: (
//                 performance.memory
//                     .usedJSHeapSize
//                 / 1048576
//             ).toFixed(2),
// 
//             totalMB: (
//                 performance.memory
//                     .totalJSHeapSize
//                 / 1048576
//             ).toFixed(2)
// 
//         }
//     }
// 
//     function runSubsystems() {
// 
//         hydrate();
// 
//         try {
// 
//             if (window.matchScore)
//                 mark('matchScore', () => matchScore());
// 
//             if (window.drawWave)
//                 mark(
//                     'drawWave',
//                     () => drawWave(
//                         window.targetSignal,
//                         '#fff',
//                         1200,
//                         400,
//                         0,
//                         1.8
//                     )
//                 );
// 
//             if (window.syncLabels)
//                 mark(
//                     'syncLabels',
//                     () => syncLabels()
//                 );
// 
//             if (window.readSliders)
//                 mark(
//                     'readSliders',
//                     () => readSliders()
//                 );
// 
//             if (window.updateMeters)
//                 mark(
//                     'updateMeters',
//                     () => updateMeters(95)
//                 );
// 
//         }
//         catch (e) {
//             console.warn(e);
//         }
//     }
// 
//     function summarize() {
// 
//         const report = {};
// 
//         Object.entries(measures)
//             .forEach(([k, v]) => {
// 
//                 report[k] = {
// 
//                     avg:
//                         avg(v).toFixed(4) + 'ms',
// 
//                     worst:
//                         Math.max(...v)
//                             .toFixed(4) + 'ms',
// 
//                     calls: v.length
// 
//                 }
// 
//             });
// 
//         console.log(
//             '%c🚀 GROUND TRUTH REPORT',
//             'font-weight:bold'
//         );
// 
//         console.table(report);
// 
//         console.table({
//             memory: memoryProbe()
//         });
//     }
// 
//     async function replayAudit() {
// 
//         const canvas =
//             document.querySelector('canvas');
// 
//         if (!canvas) return;
// 
//         const s = performance.now();
// 
//         await captureReplay(canvas);
// 
//         const dt =
//             performance.now() - s;
// 
//         console.log(
//             'Replay:',
//             dt.toFixed(2) + 'ms'
//         );
//     }
// 
//     return {
// 
//         start() {
// 
//             console.clear();
// 
//             installLongTaskObserver();
// 
//             requestAnimationFrame(
//                 frameTick
//             );
// 
//             console.log(
//                 '🛰 perfAudit started'
//             );
//         },
// 
//         tick() {
//             runSubsystems();
//         },
// 
//         replay: replayAudit,
// 
//         report: summarize,
// 
//         mark,
// 
//         memory: memoryProbe,
// 
//         measures
// 
//     }
// 
// })();
// 
// window.perfAudit = perfAudit;
// 
// perfAudit.start();
// 
// /*
// usage:
// 
// perfAudit.tick()
// perfAudit.tick()
// perfAudit.tick()
// 
// perfAudit.replay()
// 
// perfAudit.report()
// */
