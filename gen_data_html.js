const fs = require('fs');
const path = require('path');

const root = path.join(__dirname);
const srcDir = path.join(root, 'src');

const json1 = fs.readFileSync(path.join(root, '151701.json'), 'utf8');
const json2 = fs.readFileSync(path.join(root, '151901.json'), 'utf8');
const json3 = fs.readFileSync(path.join(root, 'niftyclose_prm_26022026.json'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OI Tech – Data 26 Feb 2026</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@2.1.0/dist/chartjs-plugin-annotation.min.js"><\/script>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0b0f1a; --surface: #0d1220; --surface2: #141c2e;
            --border: #1a2540; --text: #e2e4ed; --text2: #8b90a5;
            --green: #22c55e; --green-bg: rgba(34,197,94,0.12);
            --red: #ef4444; --red-bg: rgba(239,68,68,0.12);
            --blue: #8b5cf6; --blue-bg: rgba(139,92,246,0.12);
            --orange: #f59e0b; --orange-bg: rgba(245,158,11,0.12);
            --purple: #a855f7; --purple-bg: rgba(168,85,247,0.12);
            --cyan: #06b6d4; --cyan-bg: rgba(6,182,212,0.12);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px 24px; }

        .header { text-align: center; padding: 24px 0 16px; }
        .header h1 { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.5px;
            background: linear-gradient(135deg, #8b5cf6, #06b6d4);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .header .sub { color: var(--text2); font-size: 0.88rem; margin-top: 6px; }
        .data-badge { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px;
            background: rgba(139,92,246,0.12); border: 1px solid rgba(139,92,246,0.3);
            border-radius: 20px; padding: 4px 14px; font-size: 0.78rem; font-weight: 600; color: #a78bfa; }
        .data-badge .dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e;
            animation: pulse 1.8s infinite; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.85)} }

        .nav { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--border);
            border-radius: 12px; padding: 4px; margin: 18px 0; width: fit-content; }
        .nav-btn { padding: 9px 22px; border: none; background: transparent; color: var(--text2);
            font-family: 'DM Sans', sans-serif; font-size: 0.88rem; font-weight: 600; cursor: pointer;
            border-radius: 8px; transition: all 0.2s; }
        .nav-btn.active { background: var(--blue); color: white; }
        .nav-btn:hover:not(.active) { background: var(--surface2); color: var(--text); }

        .tab { display: none; }
        .tab.active { display: block; }

        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
            padding: 22px; margin-bottom: 18px; }
        .card h2 { font-size: 1.05rem; font-weight: 700; margin-bottom: 14px; color: var(--text);
            display: flex; align-items: center; gap: 8px; }
        .card h2 .dot { width: 8px; height: 8px; border-radius: 50%; }

        .chart-wrap { position: relative; height: 350px; }
        .chart-wrap canvas { width: 100% !important; height: 100% !important; }

        table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
        th { background: var(--surface2); color: var(--text2); font-weight: 600; text-transform: uppercase;
            font-size: 0.68rem; letter-spacing: 1px; padding: 10px 12px; text-align: center; }
        td { padding: 8px 12px; border-bottom: 1px solid var(--border); text-align: center; }
        tr:hover td { background: var(--surface2); }

        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }

        .pill { padding: 3px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; display: inline-block; }
        .pill-green { background: var(--green-bg); color: var(--green); }
        .pill-red { background: var(--red-bg); color: var(--red); }
        .pill-blue { background: var(--blue-bg); color: var(--blue); }
        .pill-orange { background: var(--orange-bg); color: var(--orange); }
        .pill-purple { background: var(--purple-bg); color: var(--purple); }
        .pill-cyan { background: var(--cyan-bg); color: var(--cyan); }
        .pill-slate { background: rgba(148,163,184,0.15); color: #94a3b8; }

        .stat-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        .stat { background: var(--surface2); border-radius: 8px; padding: 12px 16px; flex: 1; min-width: 140px; }
        .stat .label { font-size: 0.68rem; color: var(--text2); text-transform: uppercase; letter-spacing: 1px; }
        .stat .value { font-family: 'JetBrains Mono', monospace; font-size: 1.2rem; font-weight: 600; margin-top: 4px; }
        .stat .delta { font-size: 0.75rem; margin-top: 2px; }

        .scenario-badge { padding: 16px 24px; border-radius: 12px; text-align: center; margin: 16px 0;
            font-weight: 700; font-size: 1.1rem; letter-spacing: 0.5px; }

        .peff-bar { display: flex; align-items: center; gap: 12px; margin: 8px 0; }
        .peff-bar .bar-track { flex: 1; height: 8px; background: var(--surface2); border-radius: 4px; overflow: hidden; }
        .peff-bar .bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
        .peff-bar .bar-label { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; min-width: 60px; }

        @media (max-width: 768px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>NIFTY OI + Premium Analyzer</h1>
        <div class="sub">26 Feb 2026 · Snapshot 15:17:01 vs 15:19:01 · PRM Close data hardcoded</div>
        <div><span class="data-badge"><span class="dot"></span>Data Pre-loaded — 26022026</span></div>
    </div>

    <div class="nav" id="mainNav">
        <button class="nav-btn active" onclick="showTab('oi')">OI Analysis</button>
        <button class="nav-btn" onclick="showTab('premium')">Premium Analysis</button>
        <button class="nav-btn" onclick="showTab('combined')">Combined Verdict</button>
        <button class="nav-btn" onclick="showTab('oiprm')">OI_Prm_Diversion</button>
        <button class="nav-btn" onclick="showTab('gamazone')">GamaZone</button>
    </div>

    <div id="oi" class="tab active"><div id="oi-content"></div></div>
    <div id="premium" class="tab"><div id="premium-content"></div></div>
    <div id="combined" class="tab"><div id="combined-content"></div></div>
    <div id="oiprm" class="tab"><div id="oiprm-content"></div></div>
    <div id="gamazone" class="tab"><div id="gamazone-content"></div></div>
</div>

<script src="oi_calculations.js"><\/script>
<script src="premium_analysis.js"><\/script>
<script src="oi_prm_analytics.js"><\/script>
<script src="gamazone.js"><\/script>
<script src="reportExporter.js"><\/script>

<script>
// ═══════ HARDCODED DATA — 26022026 ═══════
const json1Data = ${json1};
const json2Data = ${json2};
const json3Data = ${json3};

const el = (id) => document.getElementById(id);

function showTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    el(tabId).classList.add('active');
    document.querySelector('.nav-btn[onclick="showTab(\\'' + tabId + '\\')"]').classList.add('active');
}

window.addEventListener('DOMContentLoaded', function() {
    renderOITab(json1Data, json2Data, json3Data);
    renderPremiumTab(json3Data, json2Data);
    renderCombinedTab(json1Data, json2Data, json3Data);
    renderOIPrmDiversionTab(json1Data, json2Data, json3Data);
    renderGamaZoneTab(json1Data, json2Data, json3Data);
});
<\/script>
</body>
</html>`;

fs.writeFileSync(path.join(srcDir, 'data.html'), html, 'utf8');
const size = fs.statSync(path.join(srcDir, 'data.html')).size;
console.log('data.html written successfully — size:', (size / 1024).toFixed(1), 'KB');
