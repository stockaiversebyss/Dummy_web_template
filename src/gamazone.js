/**
 * ═══════════════════════════════════════════════════════════════════
 *  gamazone.js — GamaZone (Gamma Compression Zone) Analysis Module
 *  Version: 1.0 | Tab 5 of relcapa_viewer_v8.html
 *  Author: Sachin × Claude | 28-Feb-2026
 *  
 *  Entry: renderGamaZoneTab(json1, json2, json3)
 *  Container: #gamazone-content
 *  Required: JSON1 (anchor OI) + JSON2 (current OI)
 *  Optional: JSON3 (premium time-series)
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════ CHART INSTANCE MANAGEMENT ═══════
let _gamazoneCharts = {};
function _destroyGamazoneCharts() {
    Object.values(_gamazoneCharts).forEach(c => { try { c.destroy(); } catch(e){} });
    _gamazoneCharts = {};
}

// ═══════ HELPER: Extract strike arrays from snapshot JSON ═══════
function _gz_extractStrikeArrays(jsonData) {
    const spot = jsonData.meta.nifty_close;
    const timestamp = jsonData.meta.timestamp;
    const strikes = Object.keys(jsonData.per_strike).map(Number).sort((a,b) => a-b);
    const data = {};
    strikes.forEach(k => {
        const s = jsonData.per_strike[String(k)];
        data[k] = {
            CE_OI: s.CEdata.total_oi_normalized,
            CE_COI: s.CEdata.change_in_oi_normalized,
            CE_PRM: s.CEdata.premium,
            CE_LTP: s.CEdata.ltp,
            PE_OI: s.PEdata.total_oi_normalized,
            PE_COI: s.PEdata.change_in_oi_normalized,
            PE_PRM: s.PEdata.premium,
            PE_LTP: s.PEdata.ltp,
            NET_OI: s.combined.net_oi_sum,
            NET_COI: s.combined.net_coi_sum,
            DIFF_TOI: s.combined.diff_toi,
            DIFF_COI: s.combined.diff_coi,
            PCR: s.combined.pcr
        };
    });
    return { spot, timestamp, strikes, data };
}

// ═══════ HELPER: Detect CE/PE walls ═══════
function _gz_detectWalls(parsed) {
    const { spot, strikes, data } = parsed;
    
    // L1 walls (max total OI)
    let ceWall = null, ceWallOI = -1;
    let peWall = null, peWallOI = -1;
    // Fresh walls (max COI)
    let ceWallF = null, ceWallFCOI = -Infinity;
    let peWallF = null, peWallFCOI = -Infinity;
    // L2 walls (second highest)
    let ceL2 = null, ceL2OI = -1;
    let peL2 = null, peL2OI = -1;

    strikes.forEach(k => {
        const d = data[k];
        if (k > spot) {
            if (d.CE_OI > ceWallOI) { ceL2 = ceWall; ceL2OI = ceWallOI; ceWall = k; ceWallOI = d.CE_OI; }
            else if (d.CE_OI > ceL2OI) { ceL2 = k; ceL2OI = d.CE_OI; }
            if (d.CE_COI > ceWallFCOI) { ceWallF = k; ceWallFCOI = d.CE_COI; }
        }
        if (k < spot) {
            if (d.PE_OI > peWallOI) { peL2 = peWall; peL2OI = peWallOI; peWall = k; peWallOI = d.PE_OI; }
            else if (d.PE_OI > peL2OI) { peL2 = k; peL2OI = d.PE_OI; }
            if (d.PE_COI > peWallFCOI) { peWallF = k; peWallFCOI = d.PE_COI; }
        }
    });

    // Handle edge: if spot is exactly on a strike, include it in PE side
    if (!peWall) {
        strikes.filter(k => k <= spot).forEach(k => {
            if (data[k].PE_OI > peWallOI) { peWall = k; peWallOI = data[k].PE_OI; }
        });
    }

    return {
        L1: { ce: ceWall, ceOI: ceWallOI, pe: peWall, peOI: peWallOI },
        L1F: { ce: ceWallF, ceCOI: ceWallFCOI, pe: peWallF, peCOI: peWallFCOI },
        L2: { ce: ceL2, ceOI: ceL2OI, pe: peL2, peOI: peL2OI }
    };
}

// ═══════ HELPER: Compute zone metrics ═══════
function _gz_computeZoneMetrics(walls, spot) {
    const kce = walls.L1.ce;
    const kpe = walls.L1.pe;
    const width = kce - kpe;
    const center = (kce + kpe) / 2;
    const CR = width > 0 ? (width / spot) * 100 : 0;
    const SPI = width > 0 ? (spot - kpe) / width : 0.5;
    return { width, center, CR, SPI, kce, kpe };
}

// ═══════ HELPER: Compute GIS (Gamma Intensity Score) ═══════
function _gz_computeGIS(walls, zone, parsed) {
    const { data, strikes } = parsed;
    const kce = walls.L1.ce;
    const kpe = walls.L1.pe;
    const ceOI = walls.L1.ceOI;
    const peOI = walls.L1.peOI;

    // WSS - Wall Strength Symmetry
    const WSS = 1 - Math.abs(ceOI - peOI) / Math.max(ceOI, peOI, 1);

    // FOC - Fresh OI Confirmation (at wall strikes)
    const ceCOI = Math.abs(data[kce]?.CE_COI || 0);
    const peCOI = Math.abs(data[kpe]?.PE_COI || 0);
    const FOC = Math.max(ceCOI, peCOI) > 0 ? Math.min(ceCOI, peCOI) / Math.max(ceCOI, peCOI) : 0;

    // ID - Internal Density
    const internalStrikes = strikes.filter(k => k > kpe && k < kce);
    const internalOI = internalStrikes.reduce((s, k) => s + (data[k]?.NET_OI || 0), 0);
    const wallOI = (data[kpe]?.NET_OI || 0) + (data[kce]?.NET_OI || 0);
    const ID = wallOI > 0 ? internalOI / wallOI : 0;

    // GIS composite
    const CR = zone.CR;
    const GIS = 0.25 * WSS + 0.25 * FOC + 0.30 * Math.min(ID, 2) / 2 + 0.20 * (1 - CR / 1.5);

    return { WSS, FOC, ID, CR, GIS, internalStrikes, ceCOI_abs: ceCOI, peCOI_abs: peCOI };
}

// ═══════ HELPER: Compute Directional Lean ═══════
function _gz_computeDirectionalLean(walls, parsed) {
    const { data } = parsed;
    const kce = walls.L1.ce;
    const kpe = walls.L1.pe;
    const dce = data[kce] || {};
    const dpe = data[kpe] || {};

    // WVS - Wall Vulnerability Score
    const ceOI = dce.CE_OI || 0;
    const ceCOI = dce.CE_COI || 0;
    const cePRM = dce.CE_PRM || 1;
    const peOI = dpe.PE_OI || 0;
    const peCOI = dpe.PE_COI || 0;
    const pePRM = dpe.PE_PRM || 1;

    const WVS_CE = ceOI > 0 ? ceOI * (1 + ceCOI / ceOI) * cePRM : 0;
    const WVS_PE = peOI > 0 ? peOI * (1 + peCOI / peOI) * pePRM : 0;
    const BDR = WVS_CE > 0 ? WVS_PE / WVS_CE : 999;

    // CMR
    const diff_coi_ce = dce.DIFF_COI || 0;
    const diff_coi_pe = dpe.DIFF_COI || 0;
    const CMR = diff_coi_pe !== 0 ? diff_coi_ce / diff_coi_pe : 0;

    // PCR gradient
    const pcr_pe = dpe.PCR || 0;
    const pcr_ce = dce.PCR || 0;
    const PCR_gradient = pcr_pe - pcr_ce;

    // PAW
    const PAW = pePRM > 0 ? cePRM / pePRM : 0;

    // Lean classification
    let lean = 'NEUTRAL';
    let leanDetail = '';
    if (BDR > 1.5) { lean = 'BULLISH'; leanDetail = 'PE fortified → upside break likely'; }
    else if (BDR < 0.67) { lean = 'BEARISH'; leanDetail = 'CE fortified → downside break likely'; }
    else { leanDetail = 'Walls roughly balanced'; }

    // Refinements from CMR and PAW
    let leanModifier = '';
    if (CMR < -1) leanModifier = 'CE writing dominant (bearish pressure)';
    else if (CMR > 1) leanModifier = 'PE writing dominant (bullish support)';
    if (PAW < 0.8) leanModifier += (leanModifier ? ' | ' : '') + 'CE cheap → bearish tilt';
    else if (PAW > 1.2) leanModifier += (leanModifier ? ' | ' : '') + 'PE cheap → mild bullish';

    return { WVS_CE, WVS_PE, BDR, CMR, PCR_gradient, PAW, lean, leanDetail, leanModifier };
}

// ═══════ HELPER: Compute Anchor Migration ═══════
function _gz_computeAnchorMigration(json1, json2) {
    const p1 = _gz_extractStrikeArrays(json1);
    const p2 = _gz_extractStrikeArrays(json2);
    const w1 = _gz_detectWalls(p1);
    const w2 = _gz_detectWalls(p2);
    const z1 = _gz_computeZoneMetrics(w1, p1.spot);
    const z2 = _gz_computeZoneMetrics(w2, p2.spot);

    return {
        anchor: { spot: p1.spot, ts: p1.timestamp, ceWall: w1.L1.ce, peWall: w1.L1.pe, ceOI: w1.L1.ceOI, peOI: w1.L1.peOI, width: z1.width },
        current: { spot: p2.spot, ts: p2.timestamp, ceWall: w2.L1.ce, peWall: w2.L1.pe, ceOI: w2.L1.ceOI, peOI: w2.L1.peOI, width: z2.width },
        delta: {
            spot: p2.spot - p1.spot,
            ceWall: w2.L1.ce - w1.L1.ce,
            peWall: w2.L1.pe - w1.L1.pe,
            ceOI: w2.L1.ceOI - w1.L1.ceOI,
            peOI: w2.L1.peOI - w1.L1.peOI,
            width: z2.width - z1.width,
            ceShifted: w2.L1.ce !== w1.L1.ce,
            peShifted: w2.L1.pe !== w1.L1.pe,
            expanded: z2.width > z1.width,
            contracted: z2.width < z1.width
        }
    };
}

// ═══════ HELPER: Filter JSON3 by cutoff ═══════
function _gz_filterJSON3(json3, cutoffTimestamp) {
    if (!json3 || !json3.data || !json3.data.logdata) return null;
    const cutoff = String(cutoffTimestamp).replace(/:/g, '').substring(0, 6);
    const filtered = json3.data.logdata.filter(c => {
        const ts = String(c.timestamp).substring(0, 6);
        return ts <= cutoff;
    });
    return filtered.length > 0 ? filtered : null;
}

// ═══════ HELPER: Compute Temporal Frame ═══════
function _gz_computeTemporalFrame(candles, walls) {
    if (!candles || candles.length < 2) return null;

    const first = candles[0];
    const last = candles[candles.length - 1];
    const pciStart = first.total_ce_premium + first.total_pe_premium;
    const pciEnd = last.total_ce_premium + last.total_pe_premium;
    const pciDecayPct = ((pciEnd - pciStart) / pciStart) * 100;
    const prStart = first.premium_ratio;
    const prEnd = last.premium_ratio;
    const pcrStart = first.pcr;
    const pcrEnd = last.pcr;
    const spotStart = first.nifty_close;
    const spotEnd = last.nifty_close;

    // DPV (5-candle lookback)
    let DPV = 0, PV_CE = 0, PV_PE = 0;
    const lookback = Math.min(5, candles.length - 1);
    if (lookback > 0) {
        const ref = candles[candles.length - 1 - lookback];
        PV_CE = (last.total_ce_premium - ref.total_ce_premium) / lookback;
        PV_PE = (last.total_pe_premium - ref.total_pe_premium) / lookback;
        DPV = PV_CE - PV_PE;
    }

    // PR trend
    let prTrend = 'flat';
    if (prEnd < prStart - 0.05) prTrend = 'falling';
    else if (prEnd > prStart + 0.05) prTrend = 'rising';

    // PCI trend
    let pciTrend = 'stable';
    if (pciDecayPct < -3) pciTrend = 'decaying';
    else if (pciDecayPct > 3) pciTrend = 'expanding';

    // Build time-series arrays for charts
    const timestamps = candles.map(c => String(c.timestamp).substring(0, 4));
    const pciSeries = candles.map(c => c.total_ce_premium + c.total_pe_premium);
    const prSeries = candles.map(c => c.premium_ratio);
    const spotSeries = candles.map(c => c.nifty_close);

    return {
        pciStart, pciEnd, pciDecayPct, pciTrend,
        prStart, prEnd, prTrend,
        pcrStart, pcrEnd,
        spotStart, spotEnd, spotDelta: spotEnd - spotStart,
        PV_CE, PV_PE, DPV,
        timestamps, pciSeries, prSeries, spotSeries,
        candleCount: candles.length
    };
}

// ═══════ HELPER: Compute Breakout Framework ═══════
function _gz_computeBreakoutFramework(walls, zone, gis, directional, temporal, parsed) {
    const { data } = parsed;
    const kce = walls.L1.ce;
    const kpe = walls.L1.pe;
    const width = zone.width;

    // BSE
    const ceOI = walls.L1.ceOI;
    const peOI = walls.L1.peOI;
    const ceCOI = data[kce]?.CE_COI || 0;
    const peCOI = data[kpe]?.PE_COI || 0;
    const BSE_PE = peOI > 0 ? peOI * (1 + Math.abs(peCOI) / peOI) * (zone.CR / 100) : 0;
    const BSE_CE = ceOI > 0 ? ceOI * (1 + Math.abs(ceCOI) / ceOI) * (zone.CR / 100) : 0;

    // Targets
    // Next PE wall below L1
    const peL2Strike = walls.L2.pe || (kpe - 100);
    const ceL2Strike = walls.L2.ce || (kce + 100);

    const targetsDown = {
        T1: Math.round(kpe - width * 0.618),
        T2: kpe - width,
        T3: peL2Strike
    };
    const targetsUp = {
        T1: Math.round(kce + width * 0.618),
        T2: kce + width,
        T3: ceL2Strike
    };

    // Pre-breakout checklist
    const checks = [];
    // Spatial
    checks.push({ label: 'GIS > 0.5', pass: gis.GIS > 0.5, val: gis.GIS.toFixed(3) });
    checks.push({ label: 'SPI extreme (<0.25 or >0.75)', pass: zone.SPI < 0.25 || zone.SPI > 0.75, val: zone.SPI.toFixed(3) });
    
    const coiUnwinding = (ceCOI < 0) || (peCOI < 0);
    checks.push({ label: 'COI unwinding at a wall', pass: coiUnwinding, val: `CE:${ceCOI.toFixed(0)} PE:${peCOI.toFixed(0)}` });
    checks.push({ label: 'PCR gradient exists (>0.5)', pass: Math.abs(directional.PCR_gradient) > 0.5, val: directional.PCR_gradient.toFixed(2) });

    // Temporal (if available)
    let temporalChecks = [];
    if (temporal) {
        temporalChecks.push({ label: 'PCI decaying (<-3%)', pass: temporal.pciDecayPct < -3, val: temporal.pciDecayPct.toFixed(2) + '%', warn: Math.abs(temporal.pciDecayPct) < 5 });
        
        const prNearThreshold = temporal.prEnd > 2.0 || temporal.prEnd < 1.0;
        const prApproaching = temporal.prEnd < 1.1 || temporal.prEnd > 1.8;
        temporalChecks.push({ label: 'PR crossed threshold (>2.0 or <1.0)', pass: prNearThreshold, val: temporal.prEnd.toFixed(3), warn: prApproaching && !prNearThreshold });
        
        temporalChecks.push({ label: 'DPV diverged (|DPV|>10)', pass: Math.abs(temporal.DPV) > 10, val: temporal.DPV.toFixed(2) });
    }

    const spatialScore = checks.filter(c => c.pass).length;
    const temporalScore = temporalChecks.filter(c => c.pass).length;
    const totalChecks = checks.length + temporalChecks.length;
    const totalPass = spatialScore + temporalScore;

    return { BSE_PE, BSE_CE, targetsDown, targetsUp, checks, temporalChecks, spatialScore, temporalScore, totalPass, totalChecks };
}

// ═══════ HELPER: Build Composite Verdict ═══════
function _gz_buildCompositeVerdict(gis, zone, directional, temporal, migration, breakout) {
    let signal = 'NO_GAMAZO';
    if (gis.GIS > 0.7) signal = 'STRONG_COMPRESSION';
    else if (gis.GIS > 0.5) signal = 'COMPRESSION_ACTIVE';
    else if (gis.GIS > 0.4) signal = 'WEAK_COMPRESSION';

    let biasLabel = directional.lean;
    let biasDetail = directional.leanDetail;

    // Refine with temporal
    if (temporal) {
        if (temporal.DPV < -10 && temporal.prTrend === 'falling') {
            if (biasLabel === 'NEUTRAL') biasLabel = 'MILD BEARISH';
            biasDetail += ' | DPV negative + PR falling';
        } else if (temporal.DPV > 10 && temporal.prTrend === 'rising') {
            if (biasLabel === 'NEUTRAL') biasLabel = 'MILD BULLISH';
            biasDetail += ' | DPV positive + PR rising';
        }
    }

    // Confidence
    let confidence = Math.min(gis.GIS + 0.05, 0.95);
    if (breakout.totalPass >= breakout.totalChecks * 0.6) confidence = Math.min(confidence + 0.1, 0.95);

    // Watch items
    const watchItems = [];
    if (temporal && temporal.prEnd < 1.1 && temporal.prEnd > 0.9) watchItems.push(`PR at ${temporal.prEnd.toFixed(3)} — approaching 1.0 (bearish trigger)`);
    if (temporal && temporal.prEnd > 1.8) watchItems.push(`PR at ${temporal.prEnd.toFixed(3)} — approaching 2.0 (bullish trigger)`);
    if (gis.WSS < 0.4) watchItems.push('Wall asymmetry high — one wall dominates');
    if (zone.SPI < 0.2) watchItems.push('Spot near PE wall — bearish pressure');
    if (zone.SPI > 0.8) watchItems.push('Spot near CE wall — bullish pressure');
    if (migration.delta.expanded) watchItems.push(`Zone expanded ${migration.anchor.width}→${migration.current.width}pts`);
    if (migration.delta.contracted) watchItems.push(`Zone contracted ${migration.anchor.width}→${migration.current.width}pts`);
    const peStronger = migration.current.peOI > migration.current.ceOI;
    if (peStronger) watchItems.push(`PE wall stronger than CE (${migration.current.peOI.toFixed(0)} vs ${migration.current.ceOI.toFixed(0)})`);

    return { signal, biasLabel, biasDetail, confidence, watchItems, peStronger };
}

// ═══════ HELPER: Classify GIS ═══════
function _gz_classifyGIS(gis) {
    if (gis > 0.7) return { label: 'STRONG', cls: 'pill-green' };
    if (gis > 0.5) return { label: 'MODERATE-STRONG', cls: 'pill-orange' };
    if (gis > 0.4) return { label: 'MODERATE', cls: 'pill-blue' };
    return { label: 'WEAK', cls: 'pill-red' };
}

// ═══════ FORMAT HELPERS ═══════
function _gz_fmt(v, d=2) { return v != null ? Number(v).toFixed(d) : '—'; }
function _gz_fmtDelta(v, d=2) { return v > 0 ? `+${v.toFixed(d)}` : v.toFixed(d); }
function _gz_signalPill(label) {
    const map = {
        'STRONG_COMPRESSION': 'pill-green', 'COMPRESSION_ACTIVE': 'pill-orange',
        'WEAK_COMPRESSION': 'pill-blue', 'NO_GAMAZO': 'pill-red',
        'BULLISH': 'pill-green', 'BEARISH': 'pill-red', 'NEUTRAL': 'pill-slate',
        'MILD BEARISH': 'pill-red', 'MILD BULLISH': 'pill-green'
    };
    return map[label] || 'pill-slate';
}

// ═══════ MAIN RENDER FUNCTION ═══════
function renderGamaZoneTab(json1, json2, json3) {
    _destroyGamazoneCharts();
    const container = document.getElementById('gamazone-content');
    if (!container) return;

    // ── STAGE 1-2: Parse + Walls ──
    const parsed = _gz_extractStrikeArrays(json2);
    const walls = _gz_detectWalls(parsed);
    
    if (!walls.L1.ce || !walls.L1.pe) {
        container.innerHTML = '<div class="card" style="text-align:center;color:var(--red);">Could not detect CE/PE walls from JSON2. Check data.</div>';
        return;
    }

    // ── STAGE 3-5: Zone + GIS ──
    const zone = _gz_computeZoneMetrics(walls, parsed.spot);
    const gis = _gz_computeGIS(walls, zone, parsed);
    const gisClass = _gz_classifyGIS(gis.GIS);

    // ── STAGE 5: Directional ──
    const directional = _gz_computeDirectionalLean(walls, parsed);

    // ── STAGE 6: Anchor Migration ──
    const migration = _gz_computeAnchorMigration(json1, json2);

    // ── STAGE 7: Temporal ──
    const candles = _gz_filterJSON3(json3, parsed.timestamp);
    const temporal = _gz_computeTemporalFrame(candles, walls);

    // ── STAGE 8: Breakout ──
    const breakout = _gz_computeBreakoutFramework(walls, zone, gis, directional, temporal, parsed);

    // ── STAGE 9: Verdict ──
    const verdict = _gz_buildCompositeVerdict(gis, zone, directional, temporal, migration, breakout);

    // ── Store for report export ──
    window._gamazoneReportCache = { parsed, walls, zone, gis, gisClass, directional, migration, temporal, breakout, verdict };

    // ══════════════════════════════════
    //  BUILD HTML
    // ══════════════════════════════════
    let html = '';

    // ── SECTION A: Header Stats ──
    html += `<div class="stat-row">
        <div class="stat"><div class="label">Spot</div><div class="value mono" style="color:var(--cyan)">${_gz_fmt(parsed.spot, 2)}</div></div>
        <div class="stat"><div class="label">Zone L1</div><div class="value mono" style="color:var(--orange)">${walls.L1.pe} — ${walls.L1.ce}</div></div>
        <div class="stat"><div class="label">Width</div><div class="value mono">${zone.width} <span style="font-size:0.7rem;color:var(--text2)">pts</span></div></div>
        <div class="stat"><div class="label">GIS Score</div><div class="value mono" style="color:var(--orange)">${_gz_fmt(gis.GIS, 3)}</div>
            <div class="delta"><span class="pill ${gisClass.cls}">${gisClass.label}</span></div></div>
        <div class="stat"><div class="label">SPI</div><div class="value mono">${_gz_fmt(zone.SPI, 3)}</div>
            <div class="delta" style="color:var(--text2)">${zone.SPI < 0.3 ? 'PE-side' : zone.SPI > 0.7 ? 'CE-side' : 'Center-ish'}</div></div>
        <div class="stat"><div class="label">Compression</div><div class="value mono">${_gz_fmt(zone.CR, 3)}%</div>
            <div class="delta" style="color:${zone.CR < 0.5 ? 'var(--red)' : zone.CR < 1.0 ? 'var(--green)' : 'var(--text2)'}">${zone.CR < 0.5 ? 'Extreme' : zone.CR < 1.0 ? 'Normal' : zone.CR < 1.5 ? 'Wide' : 'NOT GamaZo'}</div></div>
    </div>`;

    // ── SECTION B: Zone Chart ──
    html += `<div class="card">
        <h2><span class="dot" style="background:var(--orange)"></span> Zone Visualization — OI at Each Strike</h2>
        <div class="chart-wrap"><canvas id="gz-zone-chart"></canvas></div>
    </div>`;

    // ── SECTION C+D: GIS + Directional (grid-2) ──
    // C: GIS Breakdown
    const gaugeBar = (label, val, max, color, desc) => {
        const pct = Math.min(Math.max((val / max) * 100, 0), 100);
        return `<div style="display:flex;align-items:center;gap:10px;margin:6px 0;">
            <div style="font-size:0.75rem;color:var(--text2);min-width:40px;font-weight:600;font-family:'JetBrains Mono',monospace;">${label}</div>
            <div style="flex:1;height:8px;background:var(--surface2);border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;"></div></div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;min-width:55px;text-align:right;color:${color}">${_gz_fmt(val, 3)}</div>
        </div>
        <div style="font-size:0.68rem;color:var(--text2);margin:-2px 0 4px 50px;">${desc}</div>`;
    };

    html += `<div class="grid-2">
    <div class="card">
        <h2><span class="dot" style="background:var(--orange)"></span> GIS Breakdown</h2>
        ${gaugeBar('WSS', gis.WSS, 1, 'var(--green)', `Wall Strength Symmetry — ${gis.WSS > 0.7 ? 'balanced' : gis.WSS > 0.4 ? 'moderate' : 'asymmetric'}`)}
        ${gaugeBar('FOC', gis.FOC, 1, 'var(--blue)', `Fresh OI Confirmation — ${gis.FOC > 0.6 ? 'both sides writing' : gis.FOC > 0.3 ? 'moderate' : 'one-sided'}`)}
        ${gaugeBar('ID', gis.ID, 2, 'var(--purple)', `Internal Density — ${gis.ID > 1.0 ? 'zone loaded' : gis.ID > 0.5 ? 'moderate fill' : 'sparse'}`)}
        ${gaugeBar('CR', gis.CR, 1.5, 'var(--cyan)', `Compression Ratio — ${zone.CR < 0.5 ? 'extreme' : zone.CR < 1.0 ? 'normal' : 'wide'}`)}
        <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px;text-align:center;">
            <div style="font-size:0.7rem;color:var(--text2);text-transform:uppercase;letter-spacing:1px;">Composite GIS</div>
            <div class="mono" style="font-size:1.8rem;font-weight:700;color:var(--orange);margin:4px 0;">${_gz_fmt(gis.GIS, 3)}</div>
            <span class="pill ${gisClass.cls}">${gisClass.label}</span>
        </div>
    </div>`;

    // D: Directional Lean
    html += `<div class="card">
        <h2><span class="dot" style="background:var(--red)"></span> Directional Lean</h2>
        <table>
            <tr><th>Metric</th><th>Value</th><th>Signal</th></tr>
            <tr><td style="text-align:left;font-weight:600;">BDR</td><td class="mono">${_gz_fmt(directional.BDR, 3)}</td>
                <td><span class="pill ${_gz_signalPill(directional.lean)}">${directional.lean}</span></td></tr>
            <tr><td style="text-align:left;font-weight:600;">CMR</td><td class="mono">${_gz_fmt(directional.CMR, 3)}</td>
                <td><span class="pill pill-slate">${directional.CMR < -1 ? 'CE writing heavy' : directional.CMR > 1 ? 'PE writing heavy' : 'Balanced'}</span></td></tr>
            <tr><td style="text-align:left;font-weight:600;">PCR Gradient</td><td class="mono" style="color:${directional.PCR_gradient > 0 ? 'var(--green)' : 'var(--red)'}">${_gz_fmtDelta(directional.PCR_gradient, 3)}</td>
                <td><span class="pill ${directional.PCR_gradient > 1 ? 'pill-green' : 'pill-slate'}">${directional.PCR_gradient > 1 ? 'Strong PE support' : directional.PCR_gradient > 0.3 ? 'PE support' : 'Neutral'}</span></td></tr>
            <tr><td style="text-align:left;font-weight:600;">PAW</td><td class="mono" style="color:var(--blue)">${_gz_fmt(directional.PAW, 3)}</td>
                <td><span class="pill ${directional.PAW < 0.8 ? 'pill-red' : directional.PAW > 1.2 ? 'pill-blue' : 'pill-slate'}">${directional.PAW < 0.8 ? 'CE cheap → bearish' : directional.PAW > 1.2 ? 'PE cheap → mild ▲' : 'Balanced'}</span></td></tr>
        </table>
        <div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px;">
            <div style="font-size:0.7rem;color:var(--text2);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Wall Vulnerability</div>
            <div style="display:flex;gap:12px;margin-bottom:10px;">
                <div class="stat" style="flex:1;text-align:center;"><div class="label">WVS CE (cap)</div><div class="mono" style="font-size:0.9rem;color:var(--red)">${Math.round(directional.WVS_CE).toLocaleString()}</div></div>
                <div class="stat" style="flex:1;text-align:center;"><div class="label">WVS PE (floor)</div><div class="mono" style="font-size:0.9rem;color:var(--green)">${Math.round(directional.WVS_PE).toLocaleString()}</div></div>
            </div>
        </div>
        <div style="text-align:center;margin-top:6px;">
            <div style="font-size:0.7rem;color:var(--text2);text-transform:uppercase;letter-spacing:1px;">Overall Lean</div>
            <div class="mono" style="font-size:1.1rem;font-weight:700;margin:4px 0;">${verdict.biasLabel}</div>
            ${directional.leanModifier ? `<span class="pill pill-slate" style="font-size:0.68rem;">${directional.leanModifier}</span>` : ''}
        </div>
    </div></div>`;

    // ── SECTION E: Anchor Migration ──
    const m = migration;
    const dSign = (v) => v > 0 ? `<span style="color:var(--green)">${_gz_fmtDelta(v, 1)}</span>` : v < 0 ? `<span style="color:var(--red)">${_gz_fmtDelta(v, 1)}</span>` : '—';
    const wallSignal = (shifted, delta) => {
        if (!shifted) return '<span class="pill pill-blue">HELD</span>';
        return delta > 0 ? '<span class="pill pill-green">SHIFTED UP</span>' : '<span class="pill pill-red">SHIFTED DOWN</span>';
    };

    html += `<div class="card">
        <h2><span class="dot" style="background:var(--cyan)"></span> Anchor → Current Migration</h2>
        <table>
            <tr><th></th><th>Anchor (${m.anchor.ts})</th><th>Current (${m.current.ts})</th><th>Delta</th><th>Signal</th></tr>
            <tr><td style="text-align:left;font-weight:600;">Spot</td><td class="mono">${_gz_fmt(m.anchor.spot,2)}</td><td class="mono">${_gz_fmt(m.current.spot,2)}</td><td class="mono">${dSign(m.delta.spot)}</td>
                <td>${m.delta.spot > 0 ? '<span class="pill pill-green">▲</span>' : '<span class="pill pill-red">▼</span>'}</td></tr>
            <tr><td style="text-align:left;font-weight:600;">CE Wall</td><td class="mono">${m.anchor.ceWall}</td><td class="mono">${m.current.ceWall}</td><td class="mono">${dSign(m.delta.ceWall)}</td>
                <td>${wallSignal(m.delta.ceShifted, m.delta.ceWall)}</td></tr>
            <tr><td style="text-align:left;font-weight:600;">PE Wall</td><td class="mono">${m.anchor.peWall}</td><td class="mono">${m.current.peWall}</td><td class="mono">${dSign(m.delta.peWall)}</td>
                <td>${wallSignal(m.delta.peShifted, m.delta.peWall)}</td></tr>
            <tr><td style="text-align:left;font-weight:600;">Width</td><td class="mono">${m.anchor.width}</td><td class="mono">${m.current.width}</td><td class="mono">${dSign(m.delta.width)}</td>
                <td>${m.delta.expanded ? '<span class="pill pill-orange">EXPANDED</span>' : m.delta.contracted ? '<span class="pill pill-purple">CONTRACTED</span>' : '<span class="pill pill-slate">SAME</span>'}</td></tr>
            <tr><td style="text-align:left;font-weight:600;">CE OI@Wall</td><td class="mono">${_gz_fmt(m.anchor.ceOI,1)}</td><td class="mono">${_gz_fmt(m.current.ceOI,1)}</td><td class="mono">${dSign(m.delta.ceOI)}</td>
                <td><span class="pill ${m.delta.ceOI > 0 ? 'pill-red' : 'pill-green'}">${m.delta.ceOI > 0 ? 'CE build ▲' : 'CE shed ▼'}</span></td></tr>
            <tr><td style="text-align:left;font-weight:600;">PE OI@Wall</td><td class="mono">${_gz_fmt(m.anchor.peOI,1)}</td><td class="mono">${_gz_fmt(m.current.peOI,1)}</td><td class="mono">${dSign(m.delta.peOI)}</td>
                <td><span class="pill ${m.delta.peOI > 0 ? 'pill-green' : 'pill-red'}">${m.delta.peOI > 0 ? 'PE fortress ▲' : 'PE weakened ▼'}</span></td></tr>
        </table>
        <div style="margin-top:10px;padding:8px 12px;background:var(--surface2);border-radius:8px;font-size:0.8rem;color:var(--text2);line-height:1.5;">
            <strong style="color:var(--orange);">Migration Insight:</strong>
            ${m.delta.peShifted ? `PE wall shifted ${m.delta.peWall > 0 ? 'up' : 'down'} ${Math.abs(m.delta.peWall)}pts.` : `PE wall <strong>HELD</strong> at ${m.current.peWall}${m.delta.peOI > 500 ? ' and <strong>strengthened</strong>' : ''}.`}
            ${m.delta.ceShifted ? ` CE wall shifted ${m.delta.ceWall > 0 ? 'up' : 'down'} ${Math.abs(m.delta.ceWall)}pts.` : ` CE wall <strong>HELD</strong> at ${m.current.ceWall}.`}
            ${m.delta.expanded ? ` Zone <strong>expanded</strong> ${m.anchor.width}→${m.current.width}pts.` : m.delta.contracted ? ` Zone <strong>contracted</strong> ${m.anchor.width}→${m.current.width}pts.` : ''}
        </div>
    </div>`;

    // ── SECTION F: Temporal Frame (if JSON3) ──
    if (temporal) {
        html += `<div class="card">
            <h2><span class="dot" style="background:var(--purple)"></span> Temporal Frame — Premium Dynamics (${temporal.candleCount} candles)</h2>
            <div style="position:relative;height:250px;"><canvas id="gz-pci-chart"></canvas></div>
            <div class="stat-row" style="margin-top:14px;">
                <div class="stat"><div class="label">PCI (Total Prm)</div><div class="value mono">${_gz_fmt(temporal.pciStart,1)} → ${_gz_fmt(temporal.pciEnd,1)}</div>
                    <div class="delta" style="color:${temporal.pciDecayPct < 0 ? 'var(--red)' : 'var(--green)'}">${_gz_fmtDelta(temporal.pciDecayPct, 2)}% <span class="pill ${temporal.pciTrend === 'decaying' ? 'pill-red' : temporal.pciTrend === 'expanding' ? 'pill-orange' : 'pill-slate'}" style="font-size:0.65rem;">${temporal.pciTrend.toUpperCase()}</span></div></div>
                <div class="stat"><div class="label">Premium Ratio</div><div class="value mono">${_gz_fmt(temporal.prStart,3)} → ${_gz_fmt(temporal.prEnd,3)}</div>
                    <div class="delta" style="color:${temporal.prTrend === 'falling' ? 'var(--red)' : 'var(--green)'}">${temporal.prTrend === 'falling' ? '↓' : temporal.prTrend === 'rising' ? '↑' : '→'} ${temporal.prTrend} ${temporal.prEnd < 1.1 ? '<span class="pill pill-red" style="font-size:0.65rem;">NEAR 1.0</span>' : ''}</div></div>
                <div class="stat"><div class="label">PCR (Aggregate)</div><div class="value mono">${_gz_fmt(temporal.pcrStart,3)} → ${_gz_fmt(temporal.pcrEnd,3)}</div>
                    <div class="delta" style="color:var(--text2)">${temporal.pcrEnd < temporal.pcrStart ? '↓ CE OI faster' : '↑ PE OI faster'}</div></div>
                <div class="stat"><div class="label">DPV (5-candle)</div><div class="value mono" style="color:${temporal.DPV < -5 ? 'var(--red)' : temporal.DPV > 5 ? 'var(--green)' : 'var(--text)'}">${_gz_fmt(temporal.DPV, 2)}</div>
                    <div class="delta">${temporal.DPV < -5 ? 'PE prm rising' : temporal.DPV > 5 ? 'CE prm rising' : 'Balanced'} <span class="pill ${Math.abs(temporal.DPV) > 10 ? (temporal.DPV < 0 ? 'pill-red' : 'pill-green') : 'pill-slate'}" style="font-size:0.65rem;">${Math.abs(temporal.DPV) > 10 ? (temporal.DPV < 0 ? 'BEARISH' : 'BULLISH') : 'NEUTRAL'}</span></div></div>
                <div class="stat"><div class="label">Spot Δ</div><div class="value mono" style="color:${temporal.spotDelta < 0 ? 'var(--red)' : 'var(--green)'}">${_gz_fmtDelta(temporal.spotDelta, 2)}</div>
                    <div class="delta">${_gz_fmt(temporal.spotStart,1)} → ${_gz_fmt(temporal.spotEnd,1)}</div></div>
            </div>
        </div>`;
    } else {
        html += `<div class="card" style="text-align:center;color:var(--text2);padding:20px;">
            <h2><span class="dot" style="background:var(--purple)"></span> Temporal Frame</h2>
            Upload JSON 3 (niftyclose_prm) for premium dynamics, PCI, PR trends, and DPV analysis.
        </div>`;
    }

    // ── SECTION G: Breakout Dashboard (grid-2) ──
    html += `<div class="grid-2">
    <div class="card">
        <h2><span class="dot" style="background:var(--red)"></span> Pre-Breakout Checklist</h2>
        <div style="font-size:0.72rem;color:var(--text2);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Spatial Signals</div>
        <ul style="list-style:none;">`;
    breakout.checks.forEach(c => {
        html += `<li style="padding:4px 0;font-size:0.82rem;display:flex;align-items:center;gap:6px;">
            <span style="font-size:0.9rem;color:${c.pass ? 'var(--green)' : 'var(--red)'}">${c.pass ? '✅' : '❌'}</span>
            ${c.label} <span class="mono" style="color:var(--text2);font-size:0.75rem;">(${c.val})</span></li>`;
    });
    if (breakout.temporalChecks.length > 0) {
        html += `</ul><div style="font-size:0.72rem;color:var(--text2);text-transform:uppercase;letter-spacing:1px;margin:10px 0 8px;">Temporal Signals</div><ul style="list-style:none;">`;
        breakout.temporalChecks.forEach(c => {
            const icon = c.pass ? '✅' : c.warn ? '⚠️' : '❌';
            const col = c.pass ? 'var(--green)' : c.warn ? 'var(--orange)' : 'var(--red)';
            html += `<li style="padding:4px 0;font-size:0.82rem;display:flex;align-items:center;gap:6px;">
                <span style="font-size:0.9rem;color:${col}">${icon}</span>
                ${c.label} <span class="mono" style="color:var(--text2);font-size:0.75rem;">(${c.val})</span></li>`;
        });
    }
    html += `</ul>
        <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:8px;text-align:center;">
            <span style="font-size:0.8rem;color:var(--text2);">Score:</span>
            <span class="mono" style="font-size:1.1rem;font-weight:700;color:var(--orange);"> ${breakout.totalPass}/${breakout.totalChecks}</span>
            <span style="font-size:0.78rem;color:var(--text2);"> — ${breakout.totalPass >= breakout.totalChecks * 0.6 ? 'Breakout probable' : 'Not yet triggered'}</span>
        </div>
    </div>`;

    // Targets + Nested Zones
    html += `<div class="card">
        <h2><span class="dot" style="background:var(--green)"></span> Breakout Targets</h2>
        <div style="font-size:0.72rem;color:var(--text2);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">If PE Wall Breaks (${walls.L1.pe}) ▼</div>
        <table style="margin-bottom:12px;">
            <tr><th>Target</th><th>Level</th><th>Method</th></tr>
            <tr><td>T1</td><td class="mono" style="color:var(--red)">${breakout.targetsDown.T1}</td><td>Fib 0.618</td></tr>
            <tr><td>T2</td><td class="mono" style="color:var(--red)">${breakout.targetsDown.T2}</td><td>Equal Move</td></tr>
            <tr><td>T3</td><td class="mono" style="color:var(--red)">${breakout.targetsDown.T3}</td><td>Next PE Wall</td></tr>
        </table>
        <div style="font-size:0.72rem;color:var(--text2);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">If CE Wall Breaks (${walls.L1.ce}) ▲</div>
        <table style="margin-bottom:12px;">
            <tr><th>Target</th><th>Level</th><th>Method</th></tr>
            <tr><td>T1</td><td class="mono" style="color:var(--green)">${breakout.targetsUp.T1}</td><td>Fib 0.618</td></tr>
            <tr><td>T2</td><td class="mono" style="color:var(--green)">${breakout.targetsUp.T2}</td><td>Equal Move</td></tr>
            <tr><td>T3</td><td class="mono" style="color:var(--green)">${breakout.targetsUp.T3}</td><td>Next CE Wall</td></tr>
        </table>
        <div style="font-size:0.72rem;color:var(--text2);text-transform:uppercase;letter-spacing:1px;margin:8px 0 6px;">Nested Zones</div>
        <table>
            <tr><th>Layer</th><th>PE Wall</th><th>CE Wall</th><th>Width</th><th>PE OI</th><th>CE OI</th></tr>
            <tr style="background:rgba(245,158,11,0.06);"><td><span class="pill pill-orange">L1</span></td><td class="mono">${walls.L1.pe}</td><td class="mono">${walls.L1.ce}</td><td class="mono">${zone.width}</td>
                <td class="mono" style="color:var(--green)">${_gz_fmt(walls.L1.peOI,1)}</td><td class="mono" style="color:var(--red)">${_gz_fmt(walls.L1.ceOI,1)}</td></tr>
            ${walls.L2.ce && walls.L2.pe ? `<tr><td><span class="pill pill-blue">L2</span></td><td class="mono">${walls.L2.pe}</td><td class="mono">${walls.L2.ce}</td><td class="mono">${walls.L2.ce - walls.L2.pe}</td>
                <td class="mono" style="color:var(--green)">${_gz_fmt(walls.L2.peOI,1)}</td><td class="mono" style="color:var(--red)">${_gz_fmt(walls.L2.ceOI,1)}</td></tr>` : ''}
        </table>
        <div style="margin-top:8px;padding:6px 10px;background:var(--surface2);border-radius:6px;font-size:0.75rem;color:var(--text2);">
            L1 break → ${walls.L2.ce ? '50–100pt move (L2 containment)' : 'first containment'}. L1+L2 break → 200pt+ trend.
        </div>
    </div></div>`;

    // ── SECTION H: Composite Verdict ──
    const vColor = verdict.signal === 'STRONG_COMPRESSION' ? 'var(--green)' : verdict.signal === 'COMPRESSION_ACTIVE' ? 'var(--orange)' : 'var(--blue)';
    html += `<div style="border:2px solid ${vColor};border-radius:12px;padding:20px;
        background:linear-gradient(135deg, ${vColor}11, ${vColor}05);text-align:center;margin:16px 0;">
        <div style="font-size:1.2rem;font-weight:700;color:${vColor};margin-bottom:10px;">
            🔶 ${verdict.signal.replace(/_/g, ' ')}
        </div>
        <div style="font-size:0.85rem;margin:4px 0;">Zone: <span class="mono" style="font-weight:700;">[ ${walls.L1.pe} — ${walls.L1.ce} ]</span> &nbsp;|&nbsp; GIS: <span class="mono" style="font-weight:700;">${_gz_fmt(gis.GIS,3)}</span> &nbsp;|&nbsp; SPI: <span class="mono">${_gz_fmt(zone.SPI,3)}</span></div>
        <div style="font-size:0.85rem;margin:4px 0;">Lean: <span class="pill ${_gz_signalPill(verdict.biasLabel)}">${verdict.biasLabel}</span></div>
        ${verdict.watchItems.map(w => `<div style="font-size:0.78rem;color:var(--text2);margin:3px 0;">⚠️ ${w}</div>`).join('')}
        <div style="margin-top:10px;">
            <span style="font-size:0.72rem;color:var(--text2);">Confidence:</span>
            <span class="mono" style="font-size:1.2rem;font-weight:700;color:${vColor};"> ${Math.round(verdict.confidence * 100)}%</span>
        </div>
    </div>`;

    container.innerHTML = html;

    // ══════════════════════════════════
    //  RENDER CHARTS
    // ══════════════════════════════════
    _renderGamazoneCharts(parsed, walls, zone, temporal);
}

// ═══════ CHART RENDERING ═══════
function _renderGamazoneCharts(parsed, walls, zone, temporal) {
    const { strikes, data, spot } = parsed;

    // === Zone Chart ===
    const ceOIs = strikes.map(k => data[k].CE_OI);
    const peOIs = strikes.map(k => data[k].PE_OI);
    const labels = strikes.map(String);
    const peIdx = strikes.indexOf(walls.L1.pe);
    const ceIdx = strikes.indexOf(walls.L1.ce);
    const spotIdx = strikes.reduce((best, k, i) => Math.abs(k - spot) < Math.abs(strikes[best] - spot) ? i : best, 0);

    const ceColors = strikes.map(k => {
        if (k >= walls.L1.pe && k <= walls.L1.ce) return 'rgba(239,68,68,0.85)';
        if (walls.L2.pe && walls.L2.ce && k >= walls.L2.pe && k <= walls.L2.ce) return 'rgba(239,68,68,0.45)';
        return 'rgba(239,68,68,0.22)';
    });
    const peColors = strikes.map(k => {
        if (k >= walls.L1.pe && k <= walls.L1.ce) return 'rgba(34,197,94,0.85)';
        if (walls.L2.pe && walls.L2.ce && k >= walls.L2.pe && k <= walls.L2.ce) return 'rgba(34,197,94,0.45)';
        return 'rgba(34,197,94,0.22)';
    });

    const zoneEl = document.getElementById('gz-zone-chart');
    if (zoneEl) {
        const annotations = {
            spotLine: { type: 'line', xMin: spotIdx + (spot - strikes[spotIdx]) / 50, xMax: spotIdx + (spot - strikes[spotIdx]) / 50,
                borderColor: '#06b6d4', borderWidth: 2, borderDash: [6, 4],
                label: { display: true, content: `Spot ${spot}`, position: 'start', backgroundColor: '#06b6d4', color: '#fff', font: { size: 10 } } },
            l1Zone: { type: 'box', xMin: peIdx - 0.5, xMax: ceIdx + 0.5, backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.4)', borderWidth: 1,
                label: { display: true, content: 'L1 GamaZone', position: 'start', color: '#f59e0b', font: { size: 10, weight: 'bold' } } }
        };
        if (walls.L2.pe && walls.L2.ce) {
            const peL2Idx = strikes.indexOf(walls.L2.pe);
            const ceL2Idx = strikes.indexOf(walls.L2.ce);
            if (peL2Idx >= 0 && ceL2Idx >= 0) {
                annotations.l2Zone = { type: 'box', xMin: peL2Idx - 0.5, xMax: ceL2Idx + 0.5,
                    backgroundColor: 'rgba(59,130,246,0.04)', borderColor: 'rgba(59,130,246,0.2)', borderWidth: 1, borderDash: [4, 4] };
            }
        }

        _gamazoneCharts['zone'] = new Chart(zoneEl, {
            type: 'bar',
            data: { labels, datasets: [
                { label: 'CE OI (Resistance)', data: ceOIs, backgroundColor: ceColors, borderRadius: 3 },
                { label: 'PE OI (Support)', data: peOIs, backgroundColor: peColors, borderRadius: 3 }
            ] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#8b90a5', font: { family: 'DM Sans' } } },
                    annotation: { annotations } },
                scales: {
                    x: { ticks: { color: '#8b90a5', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: '#2e3347' } },
                    y: { ticks: { color: '#8b90a5', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: '#1a1d27' } }
                }
            }
        });
    }

    // === PCI + PR Chart ===
    if (temporal) {
        const pciEl = document.getElementById('gz-pci-chart');
        if (pciEl) {
            const prAnnotations = {};
            if (temporal.prEnd < 1.3) {
                prAnnotations.prOne = { type: 'line', yMin: 1.0, yMax: 1.0, yScaleID: 'y1',
                    borderColor: 'rgba(239,68,68,0.5)', borderWidth: 1, borderDash: [4, 4],
                    label: { display: true, content: 'PR=1.0 (bearish trigger)', position: 'end', backgroundColor: 'rgba(239,68,68,0.7)', color: '#fff', font: { size: 9 } } };
            }

            _gamazoneCharts['pci'] = new Chart(pciEl, {
                type: 'line',
                data: { labels: temporal.timestamps, datasets: [
                    { label: 'PCI (Total Premium)', data: temporal.pciSeries, borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.1)', tension: 0.3, pointRadius: 0, borderWidth: 2, yAxisID: 'y', fill: true },
                    { label: 'PR (CE/PE Ratio)', data: temporal.prSeries, borderColor: '#f59e0b', tension: 0.3, pointRadius: 0, borderWidth: 2, yAxisID: 'y1', borderDash: [4, 3] },
                    { label: 'Spot', data: temporal.spotSeries, borderColor: '#06b6d4', tension: 0.2, pointRadius: 0, borderWidth: 1.5, yAxisID: 'y2', borderDash: [2, 2] }
                ] },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#8b90a5', font: { family: 'DM Sans', size: 11 } } },
                        annotation: { annotations: prAnnotations } },
                    scales: {
                        x: { ticks: { color: '#8b90a5', font: { family: 'JetBrains Mono', size: 9 }, maxRotation: 45 }, grid: { color: '#1a1d27' } },
                        y: { position: 'left', ticks: { color: '#a855f7', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: '#2e3347' }, title: { display: true, text: 'PCI', color: '#a855f7' } },
                        y1: { position: 'right', ticks: { color: '#f59e0b', font: { family: 'JetBrains Mono', size: 10 } }, grid: { display: false }, title: { display: true, text: 'PR', color: '#f59e0b' } },
                        y2: { display: false }
                    }
                }
            });
        }
    }
}

// ═══════ REPORT DATA EXPORT ═══════
function getGamaZoneReportData() {
    const c = window._gamazoneReportCache;
    if (!c) return '# GamaZone Report\nNo data available. Upload JSON1 + JSON2 first.\n';

    const { parsed, walls, zone, gis, gisClass, directional, migration, temporal, breakout, verdict } = c;
    const m = migration;
    let r = '';

    r += `# GamaZone Report — Gamma Compression Zone\n`;
    r += `Generated: ${new Date().toLocaleString()}\n\n`;

    r += `## Snapshot\n`;
    r += `Spot: ${parsed.spot} | Zone L1: [${walls.L1.pe} — ${walls.L1.ce}] | Width: ${zone.width}pts\n`;
    r += `Compression: ${zone.CR.toFixed(3)}% | SPI: ${zone.SPI.toFixed(3)} | GIS: ${gis.GIS.toFixed(3)} (${gisClass.label})\n\n`;

    r += `## GIS Components\n`;
    r += `WSS: ${gis.WSS.toFixed(3)} | FOC: ${gis.FOC.toFixed(3)} | ID: ${gis.ID.toFixed(3)} | CR: ${gis.CR.toFixed(3)}%\n\n`;

    r += `## Directional Lean\n`;
    r += `BDR: ${directional.BDR.toFixed(3)} (${directional.lean}) | CMR: ${directional.CMR.toFixed(3)} | PCR Gradient: ${directional.PCR_gradient.toFixed(3)} | PAW: ${directional.PAW.toFixed(3)}\n`;
    r += `WVS CE: ${Math.round(directional.WVS_CE)} | WVS PE: ${Math.round(directional.WVS_PE)}\n`;
    r += `${directional.leanModifier ? 'Note: ' + directional.leanModifier : ''}\n\n`;

    r += `## Anchor Migration (${m.anchor.ts} → ${m.current.ts})\n`;
    r += `Spot: ${m.anchor.spot} → ${m.current.spot} (${m.delta.spot > 0 ? '+' : ''}${m.delta.spot.toFixed(2)})\n`;
    r += `CE Wall: ${m.anchor.ceWall} → ${m.current.ceWall} (${m.delta.ceShifted ? 'SHIFTED' : 'HELD'})\n`;
    r += `PE Wall: ${m.anchor.peWall} → ${m.current.peWall} (${m.delta.peShifted ? 'SHIFTED' : 'HELD'})\n`;
    r += `Width: ${m.anchor.width} → ${m.current.width} (${m.delta.expanded ? 'EXPANDED' : m.delta.contracted ? 'CONTRACTED' : 'SAME'})\n\n`;

    if (temporal) {
        r += `## Temporal Frame (${temporal.candleCount} candles)\n`;
        r += `PCI: ${temporal.pciStart.toFixed(1)} → ${temporal.pciEnd.toFixed(1)} (${temporal.pciDecayPct.toFixed(2)}% — ${temporal.pciTrend})\n`;
        r += `PR: ${temporal.prStart.toFixed(3)} → ${temporal.prEnd.toFixed(3)} (${temporal.prTrend})\n`;
        r += `PCR: ${temporal.pcrStart.toFixed(3)} → ${temporal.pcrEnd.toFixed(3)}\n`;
        r += `DPV: ${temporal.DPV.toFixed(2)} | PV_CE: ${temporal.PV_CE.toFixed(2)} | PV_PE: ${temporal.PV_PE.toFixed(2)}\n`;
        r += `Spot: ${temporal.spotStart} → ${temporal.spotEnd} (${temporal.spotDelta.toFixed(2)})\n\n`;
    }

    r += `## Breakout Checklist (${breakout.totalPass}/${breakout.totalChecks})\n`;
    breakout.checks.forEach(c => { r += `[${c.pass ? 'X' : ' '}] ${c.label} (${c.val})\n`; });
    breakout.temporalChecks.forEach(c => { r += `[${c.pass ? 'X' : c.warn ? '!' : ' '}] ${c.label} (${c.val})\n`; });
    r += `\n`;

    r += `## Targets\n`;
    r += `PE Break (${walls.L1.pe}): T1=${breakout.targetsDown.T1} | T2=${breakout.targetsDown.T2} | T3=${breakout.targetsDown.T3}\n`;
    r += `CE Break (${walls.L1.ce}): T1=${breakout.targetsUp.T1} | T2=${breakout.targetsUp.T2} | T3=${breakout.targetsUp.T3}\n\n`;

    r += `## Nested Zones\n`;
    r += `L1: [${walls.L1.pe} — ${walls.L1.ce}] Width=${zone.width} | PE OI: ${walls.L1.peOI.toFixed(1)} | CE OI: ${walls.L1.ceOI.toFixed(1)}\n`;
    if (walls.L2.ce && walls.L2.pe) {
        r += `L2: [${walls.L2.pe} — ${walls.L2.ce}] Width=${walls.L2.ce - walls.L2.pe} | PE OI: ${walls.L2.peOI.toFixed(1)} | CE OI: ${walls.L2.ceOI.toFixed(1)}\n`;
    }
    r += `\n`;

    r += `## VERDICT\n`;
    r += `Signal: ${verdict.signal}\n`;
    r += `Lean: ${verdict.biasLabel}\n`;
    r += `Confidence: ${Math.round(verdict.confidence * 100)}%\n`;
    verdict.watchItems.forEach(w => { r += `Watch: ${w}\n`; });

    return r;
}
