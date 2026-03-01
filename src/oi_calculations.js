// ═══════════════════════════════════════════════════════
// oi_calculations.js — OI Analysis Module
// Extracted from relcapa_viewer_v6_1.html
// Handles: Charts, Walls, Centroids, Flipzones, OI Insights
// ═══════════════════════════════════════════════════════

// ═══════ UTILITY FUNCTIONS ═══════
const toNum = (x) => (x == null || Number.isNaN(Number(x))) ? 0 : Number(x);
function safe(obj, path, def = 0) {
    try { return path.split('.').reduce((o, k) => o?.[k], obj) ?? def; } catch { return def; }
}
function fmtK(n, d = 2) { return (n == null || Number.isNaN(n)) ? '—' : Number(n).toFixed(d); }
function fmtL(n) { return (n / 1e5).toFixed(1) + 'L'; }

function parseStrikesUnion(j1, j2) {
    const s1 = j1 ? Object.keys(j1.per_strike || {}) : [];
    const s2 = j2 ? Object.keys(j2.per_strike || {}) : [];
    return [...new Set([...s1, ...s2])].map(Number).sort((a, b) => a - b);
}

function snapshotMeta(j) {
    if (!j) return '—';
    return `${safe(j,'meta.symbol','—')} | ${safe(j,'meta.date_pulled','—')} | ${safe(j,'meta.timestamp','—')} | Spot: ${safe(j,'meta.nifty_close','—')} | PCR: ${safe(j,'meta.snapshot_pcr','—')}`;
}

function topNBy(arr, keyFn, N = 3) { return [...arr].sort((a, b) => keyFn(b) - keyFn(a)).slice(0, N); }

function computeWalls(j, type) {
    if (!j) return [];
    const rows = [];
    for (const [k, v] of Object.entries(j.per_strike || {})) {
        rows.push({ strike: Number(k), norm: toNum(safe(v, `${type}data.total_oi_normalized`, 0)) });
    }
    return topNBy(rows, r => r.norm, 3);
}

function computeSumNormRanks(j, top = 3) {
    if (!j) return [];
    const rows = [];
    for (const [k, v] of Object.entries(j.per_strike || {})) {
        const c = toNum(safe(v, 'CEdata.total_oi_normalized', 0));
        const p = toNum(safe(v, 'PEdata.total_oi_normalized', 0));
        rows.push({ strike: Number(k), sumNorm: c + p });
    }
    return topNBy(rows, r => r.sumNorm, top);
}

function centroidWalls(walls) {
    if (!walls.length) return null;
    let num = 0, den = 0;
    for (const w of walls) { num += toNum(w.norm) * w.strike; den += toNum(w.norm); }
    return den ? (num / den) : null;
}

function centroid(j, type) {
    if (!j) return null;
    let num = 0, den = 0;
    for (const [k, v] of Object.entries(j.per_strike || {})) {
        const toi = toNum(safe(v, `${type}data.total_oi`, 0));
        num += toi * Number(k); den += toi;
    }
    return den ? (num / den) : null;
}

function mostActive(j) {
    if (!j) return { strike: null, mag: null, tag: '—' };
    let best = { strike: null, mag: -Infinity, tag: '—' };
    for (const [k, v] of Object.entries(j.per_strike || {})) {
        const dce = toNum(safe(v, 'CEdata.change_in_oi', 0));
        const dpe = toNum(safe(v, 'PEdata.change_in_oi', 0));
        const mag = Math.abs(dce) + Math.abs(dpe);
        if (mag > best.mag) best = { strike: Number(k), mag, tag: Math.abs(dpe) > Math.abs(dce) ? 'PE-led' : 'CE-led' };
    }
    return best;
}

function dominance(dCE, dPE) {
    if (dCE > dPE) return 'CE>PE';
    if (dCE < dPE) return 'PE>CE';
    return 'Equal';
}

function computeFlipzones(J1, J2) {
    const strikes = parseStrikesUnion(J1, J2);
    const bull = [], bear = [];
    for (const s of strikes) {
        const d1c = toNum(safe(J1, `per_strike.${s}.CEdata.change_in_oi`, 0));
        const d1p = toNum(safe(J1, `per_strike.${s}.PEdata.change_in_oi`, 0));
        const d2c = toNum(safe(J2, `per_strike.${s}.CEdata.change_in_oi`, 0));
        const d2p = toNum(safe(J2, `per_strike.${s}.PEdata.change_in_oi`, 0));
        const st1 = dominance(d1c, d1p), st2 = dominance(d2c, d2p);
        if (st1 === 'CE>PE' && st2 === 'PE>CE') bull.push({ strike: s, st1, st2 });
        if (st1 === 'PE>CE' && st2 === 'CE>PE') bear.push({ strike: s, st1, st2 });
    }
    return { bull, bear };
}

function nearestTo(arr, target) {
    if (!arr.length || target == null) return null;
    let best = arr[0], d = Math.abs(arr[0].strike - target);
    for (const x of arr) { const dd = Math.abs(x.strike - target); if (dd < d) { d = dd; best = x; } }
    return best;
}

// ═══════ CHART INSTANCES ═══════
let oiDeltaChart = null, oiTotalBarChart = null, oiTotalJ2Chart = null, oiCoiJ2Chart = null;

// ═══════ RENDER OI TAB ═══════
function renderOITab(j1, j2, j3) {
    const container = document.getElementById('oi-content');
    const strikes = parseStrikesUnion(j1, j2);
    const spot = j2?.meta?.nifty_close || j1?.meta?.nifty_close || 0;

    // Compute data arrays
    const delta_ce = [], delta_pe = [], total_oi_ce = [], total_oi_pe = [], coi_ce = [], coi_pe = [];
    let sum_delta_ce = 0, sum_delta_pe = 0;
    strikes.forEach(s => {
        const ce1 = toNum(safe(j1, `per_strike.${s}.CEdata.total_oi`, 0));
        const ce2 = toNum(safe(j2, `per_strike.${s}.CEdata.total_oi`, 0));
        const pe1 = toNum(safe(j1, `per_strike.${s}.PEdata.total_oi`, 0));
        const pe2 = toNum(safe(j2, `per_strike.${s}.PEdata.total_oi`, 0));
        const dc = ce2 - ce1, dp = pe2 - pe1;
        delta_ce.push(dc); delta_pe.push(dp);
        sum_delta_ce += dc; sum_delta_pe += dp;
        total_oi_ce.push(toNum(safe(j2, `per_strike.${s}.CEdata.total_oi`, 0)));
        total_oi_pe.push(toNum(safe(j2, `per_strike.${s}.PEdata.total_oi`, 0)));
        coi_ce.push(toNum(safe(j2, `per_strike.${s}.CEdata.change_in_oi`, 0)));
        coi_pe.push(toNum(safe(j2, `per_strike.${s}.PEdata.change_in_oi`, 0)));
    });

    // Walls & Centroids
    const j1CE = computeWalls(j1, 'CE'), j1PE = computeWalls(j1, 'PE');
    const j2CE = computeWalls(j2, 'CE'), j2PE = computeWalls(j2, 'PE');
    const ma2 = mostActive(j2);
    const flips = computeFlipzones(j1, j2);
    const nfc = Math.round(spot / 50) * 50;
    const peceRatio = sum_delta_ce !== 0 ? Math.abs(sum_delta_pe / sum_delta_ce).toFixed(2) : 'N/A';

    // Build HTML
    let html = '';

    // Meta bar
    html += `<div class="stat-row">
        <div class="stat"><div class="label">JSON 1</div><div class="value mono" style="font-size:0.8rem">${snapshotMeta(j1)}</div></div>
        <div class="stat"><div class="label">JSON 2</div><div class="value mono" style="font-size:0.8rem">${snapshotMeta(j2)}</div></div>
    </div>`;

    // Summary stats
    html += `<div class="stat-row">
        <div class="stat"><div class="label">Spot</div><div class="value" style="color:var(--cyan)">${spot}</div></div>
        <div class="stat"><div class="label">NFC</div><div class="value">${nfc}</div></div>
        <div class="stat"><div class="label">\u0394CE OI</div><div class="value" style="color:var(--green)">${fmtL(sum_delta_ce)}</div></div>
        <div class="stat"><div class="label">\u0394PE OI</div><div class="value" style="color:var(--red)">${fmtL(sum_delta_pe)}</div></div>
        <div class="stat"><div class="label">PE/CE Ratio</div><div class="value">${peceRatio}</div></div>
        <div class="stat"><div class="label">Most Active</div><div class="value">${ma2.strike || '—'} <span class="pill ${ma2.tag.startsWith('PE')?'pill-red':'pill-green'}">${ma2.tag}</span></div></div>
    </div>`;

    // Charts
    html += `<div class="grid-2">
        <div class="card"><h2><span class="dot" style="background:var(--blue)"></span>OI Delta (J1 vs J2)</h2><div class="chart-wrap"><canvas id="c_oi_delta"></canvas></div></div>
        <div class="card"><h2><span class="dot" style="background:var(--orange)"></span>Total OI (J2)</h2><div class="chart-wrap"><canvas id="c_oi_total"></canvas></div></div>
    </div>`;
    html += `<div class="grid-2">
        <div class="card"><h2><span class="dot" style="background:var(--cyan)"></span>COI (J2)</h2><div class="chart-wrap"><canvas id="c_coi"></canvas></div></div>
        <div class="card"><h2><span class="dot" style="background:var(--purple)"></span>Total OI Change Bar</h2><div class="chart-wrap"><canvas id="c_total_bar"></canvas></div></div>
    </div>`;

    // Walls table
    html += `<div class="grid-2">
        <div class="card"><h2><span class="dot" style="background:var(--green)"></span>CE Walls (Top-3 by Norm OI)</h2>
            <table><thead><tr><th></th><th>JSON 1</th><th>JSON 2</th></tr></thead><tbody>
            ${[0,1,2].map(i => `<tr><td style="color:var(--text2)">Wall ${i+1}</td>
                <td class="mono">${j1CE[i]?j1CE[i].strike:'—'} (${j1CE[i]?fmtK(j1CE[i].norm,0):'—'})</td>
                <td class="mono">${j2CE[i]?j2CE[i].strike:'—'} (${j2CE[i]?fmtK(j2CE[i].norm,0):'—'})</td></tr>`).join('')}
            <tr><td style="color:var(--text2)">Centroid</td><td class="mono">${fmtK(centroidWalls(j1CE),0)}</td><td class="mono">${fmtK(centroidWalls(j2CE),0)}</td></tr>
            </tbody></table>
        </div>
        <div class="card"><h2><span class="dot" style="background:var(--red)"></span>PE Walls (Top-3 by Norm OI)</h2>
            <table><thead><tr><th></th><th>JSON 1</th><th>JSON 2</th></tr></thead><tbody>
            ${[0,1,2].map(i => `<tr><td style="color:var(--text2)">Wall ${i+1}</td>
                <td class="mono">${j1PE[i]?j1PE[i].strike:'—'} (${j1PE[i]?fmtK(j1PE[i].norm,0):'—'})</td>
                <td class="mono">${j2PE[i]?j2PE[i].strike:'—'} (${j2PE[i]?fmtK(j2PE[i].norm,0):'—'})</td></tr>`).join('')}
            <tr><td style="color:var(--text2)">Centroid</td><td class="mono">${fmtK(centroidWalls(j1PE),0)}</td><td class="mono">${fmtK(centroidWalls(j2PE),0)}</td></tr>
            </tbody></table>
        </div>
    </div>`;

    // Centroids
    html += `<div class="card"><h2><span class="dot" style="background:var(--purple)"></span>OI Centroids (Full Chain)</h2>
        <div class="stat-row">
            <div class="stat"><div class="label">J1 CE Centroid</div><div class="value mono">${fmtK(centroid(j1,'CE'),0)}</div></div>
            <div class="stat"><div class="label">J1 PE Centroid</div><div class="value mono">${fmtK(centroid(j1,'PE'),0)}</div></div>
            <div class="stat"><div class="label">J2 CE Centroid</div><div class="value mono">${fmtK(centroid(j2,'CE'),0)}</div></div>
            <div class="stat"><div class="label">J2 PE Centroid</div><div class="value mono">${fmtK(centroid(j2,'PE'),0)}</div></div>
        </div></div>`;

    // Flipzones
    const nearBull = nearestTo(flips.bull, nfc);
    const nearBear = nearestTo(flips.bear, nfc);
    let primary = null;
    if (nearBull && nearBear) primary = (Math.abs(nearBull.strike-nfc) <= Math.abs(nearBear.strike-nfc)) ? {...nearBull,type:'Bull'} : {...nearBear,type:'Bear'};
    else if (nearBull) primary = {...nearBull,type:'Bull'};
    else if (nearBear) primary = {...nearBear,type:'Bear'};

    html += `<div class="card"><h2><span class="dot" style="background:var(--orange)"></span>Flipzones</h2>
        <div class="grid-2">
            <div><h3 style="color:var(--green);margin-bottom:8px">Bull Flips (CE>PE \u2192 PE>CE)</h3>
                ${flips.bull.length ? flips.bull.map(f => `<span class="pill pill-green mono" style="margin:2px">${f.strike}</span>`).join('') : '<span class="pill pill-slate">None</span>'}
            </div>
            <div><h3 style="color:var(--red);margin-bottom:8px">Bear Flips (PE>CE \u2192 CE>PE)</h3>
                ${flips.bear.length ? flips.bear.map(f => `<span class="pill pill-red mono" style="margin:2px">${f.strike}</span>`).join('') : '<span class="pill pill-slate">None</span>'}
            </div>
        </div>
        <div style="text-align:center;margin-top:12px">Primary Flip: ${primary ? `<span class="pill ${primary.type==='Bull'?'pill-green':'pill-red'}">${primary.type}</span> at <span class="mono">${primary.strike}</span>` : '<span class="pill pill-slate">None</span>'}</div>
    </div>`;

    container.innerHTML = html;

    // Render Charts
    const chartOpts = { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8b90a5', font: { family: 'DM Sans', size: 12 } } } },
        scales: { x: { ticks: { color: '#8b90a5', font: { size: 10 } }, grid: { color: '#2e3347' } },
                  y: { ticks: { color: '#8b90a5' }, grid: { color: '#2e3347' } } } };

    if (oiDeltaChart) oiDeltaChart.destroy();
    oiDeltaChart = new Chart(document.getElementById('c_oi_delta'), { type: 'bar', data: {
        labels: strikes, datasets: [
            { label: 'CE \u0394OI', data: delta_ce, backgroundColor: 'rgba(34,197,94,0.5)', borderColor: 'rgba(34,197,94,1)', borderWidth: 1 },
            { label: 'PE \u0394OI', data: delta_pe, backgroundColor: 'rgba(239,68,68,0.5)', borderColor: 'rgba(239,68,68,1)', borderWidth: 1 }
        ] }, options: { ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, beginAtZero: false } } } });

    if (oiTotalJ2Chart) oiTotalJ2Chart.destroy();
    oiTotalJ2Chart = new Chart(document.getElementById('c_oi_total'), { type: 'bar', data: {
        labels: strikes, datasets: [
            { label: 'CE Total OI', data: total_oi_ce, backgroundColor: 'rgba(34,197,94,0.4)', borderColor: 'rgba(34,197,94,1)', borderWidth: 1 },
            { label: 'PE Total OI', data: total_oi_pe, backgroundColor: 'rgba(239,68,68,0.4)', borderColor: 'rgba(239,68,68,1)', borderWidth: 1 }
        ] }, options: chartOpts });

    if (oiCoiJ2Chart) oiCoiJ2Chart.destroy();
    oiCoiJ2Chart = new Chart(document.getElementById('c_coi'), { type: 'bar', data: {
        labels: strikes, datasets: [
            { label: 'CE COI', data: coi_ce, backgroundColor: 'rgba(34,197,94,0.5)', borderColor: 'rgba(34,197,94,1)', borderWidth: 1 },
            { label: 'PE COI', data: coi_pe, backgroundColor: 'rgba(239,68,68,0.5)', borderColor: 'rgba(239,68,68,1)', borderWidth: 1 }
        ] }, options: { ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, beginAtZero: false } } } });

    if (oiTotalBarChart) oiTotalBarChart.destroy();
    oiTotalBarChart = new Chart(document.getElementById('c_total_bar'), { type: 'bar', data: {
        labels: ['CE', 'PE'], datasets: [
            { label: 'CE', data: [sum_delta_ce, 0], backgroundColor: 'rgba(34,197,94,0.6)' },
            { label: 'PE', data: [0, sum_delta_pe], backgroundColor: 'rgba(239,68,68,0.6)' }
        ] }, options: chartOpts });
}
