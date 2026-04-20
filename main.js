console.log("Mixed Signals? I hardly know her!");

const TYPES = ['sine', 'square', 'sawtooth', 'triangle'];
const target = {},
    player = { type: "sine", freq: 1, amp: 5, phase: 0, dc: 0 };
let totalScore = 0, revealed = false;

function sample(type, freq, amp, phase, dc, t) {
    const a = amp / 10;
    const p = (phase / 180) * Math.PI;
    const x = 2 * Math.PI * freq * t + p;
    let v;
    if (type === "sine") v = Math.sin(x);
    else if (type === "square") v = Math.sign(Math.sin(x));
    else if (type === "sawtooth") v = 2 * ((freq * t + phase / 360) % 1) - 1;
    else {
        const u = (freq * t + phase / 360) % 1;
        v = u < 0.5 ? (4 * u - 1) : (3 - 4 * u);
    }
    return a * v + dc / 10;
}

function drawSignal(canvas, sig, color) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px <= W; px++) {
        const t = px / W;
        const v = sample(sig.type, sig.freq, sig.amp, sig.phase, sig.dc, t);
        const y = H / 2 - v * (H / 2 - 6);
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
    }
    ctx.stroke();
}

function matchScore() {
    let diff = 0;
    const N = 200;
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        diff += Math.abs(
            sample(target.type, target.freq, target.amp, target.phase, target.dc, t) -
            sample(player.type, player.freq, player.amp, player.phase, player.dc, t)
        );
    }
    const maxDiff = 2 * N;
    return Math.max(0, 1 - diff / maxDiff);
}

const $ = (id) => document.getElementById(id);

function update() {
    player.freq = +$("sl-freq").value;
    player.amp = +$("sl-amp").value;
    player.phase = +$("sl-phase").value;
    player.dc = +$("sl-dc").value;

    $("lbl-freq").textContent = `${player.freq} Hz`;
    $("lbl-amp").textContent = (player.amp / 10).toFixed(1);
    $("lbl-phase").textContent = `${player.phase}°`;
    $("lbl-dc").textContent = (player.dc / 10).toFixed(1);

    const sc = matchScore();
    const pct = Math.round(sc * 100);
    $("pct").textContent = `${pct}%`;
    const fill = $("fill");
    $("fill").style.width = `${pct}%`
    fill.style.width = pct + "%";
    fill.style.background = pct > 80 ? "#639922" : pct > 50 ? "#BA7517" : "#E24B4A";

    const fb = $("feedback");
    if (!revealed) {
        if (pct >= 95) {
            fb.textContent = "Perfect match!";
            fb.className = "feedback win";
            totalScore += 1;
            $("score").textContent = totalScore;
        } else if (pct >= 80) {
            fb.textContent = "Very close — fine-tune it.";
            fb.className = "feedback";
        } else {
            fb.textContent = "Adjust your signal to match the target.";
            fb.className = "feedback";
        }
    }

    resizeAndDraw();
}

function resizeAndDraw() {
    const ct = $("canvasTarget");
    const cy = $("canvasPlayer");
    ct.width = ct.offsetWidth || 280;
    ct.height = 100;
    cy.width = cy.offsetHeight || 280;
    cy.height = 100;
    drawSignal(ct, target, "#378ADD");
    drawSignal(cy, player, "#D85A30");
}

function setType(btn) {
    document.querySelectorAll(".type-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    player.type = btn.dataset.t;
    update();
}

function rng(lo, hi) {
    return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function newTarget() {
    revealed = false;
    target.type = TYPES[rng(0, TYPES.length - 1)];
    target.freq = rng(1, 6);
    target.amp = rng(3, 10);
    target.phase = rng(0, 7) * 45;
    target.dc = rng(-3, 3);
    $("feedback").textContent = "Adjust your signal to match the target.";
    $("feedback").className = "feedback";
    update();
}

function reveal() {
    revealed = true;
    player = { ...target };
    $("sl-freq").value = target.freq;
    $("sl-amp").value = target.amp;
    $("sl-phase").value = target.phase;
    $("sl-dc").vallue = target.dc;
    document.querySelectorAll(".type-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.t === target.type);
    });
    $("feedback").textContent = "Revealed — try the next one.";
    $("feedback").className = "feedback";
    update();
}

newTarget();
window.addEventListener("resize", resizeAndDraw);