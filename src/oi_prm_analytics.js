/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OI + PREMIUM DIVERSION ANALYTICS MODULE v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FILE: oi_prm_analytics.js
 * TAB:  "OI_Prm_Diversion" in relcapa_viewer_v7.html
 *
 * GENAI EDIT BLUEPRINT:
 * ─────────────────────
 * SYSTEM CONTROL MAP:
 *   - This module is STANDALONE — no dependency on oi_calculations.js or premium_analysis.js
 *   - Entry point: renderOIPrmDiversionTab(json1, json2, json3)
 *   - All compute functions are PURE (no side effects, only return data)
 *   - All render functions write to DOM containers
 *
 * FILE DEPENDENCY GRAPH:
 *   relcapa_viewer_v7.html
 *     ↓ calls
 *   oi_prm_analytics.js (this file)
 *     ↓ reads
 *   JSON1 (anchor OI snapshot) + JSON2 (current OI snapshot) + JSON3 (PRM time-series)
 *     ↓ uses
 *   Chart.js (already loaded in HTML)
 *
 * EXECUTION CALL MAP:
 *   tryRender() → renderOIPrmDiversionTab(j1, j2, j3)
 *     → filterJSON3ByCutoff(j3, boundary)
 *     → computePCRDiversion(filteredJ3)
 *     → computeOIBuild(j1, j2)
 *     → computeATMPremium(j1, j2)
 *     → computeDivergence(j1, j2, filteredJ3)
 *     → computeVerdict(m1, m2, m3, m4)
 *     → render all sections to #oiprm-content
 *
 * DATA OWNERSHIP:
 *   - JSON3 CINs filtered by JSON2 timestamp (BOUNDARY RULE)
 *   - ATM = nearest 50-point strike to spot
 *   - All pcx uses ×1000 multiplier
 *
 * EDIT ANCHOR POINTS:
 *   - New PCR bands → SECTION: PCR_BANDS constant
 *   - New pattern → SECTION: classifyOIPrm()
 *   - New claude.md rule → SECTION: computeDivergence()
 *   - UI changes → SECTION: render* functions only
 *
 * SAFE EXTENSION CONTRACT:
 *   IF change involves:
 *     pcx formula       → computePCRDiversion() ONLY
 *     OI delta logic    → computeOIBuild() ONLY
 *     ATM/BE logic      → computeATMPremium() ONLY
 *     pattern matching  → computeDivergence() ONLY
 *     scoring weights   → computeVerdict() ONLY
 *     visual/layout     → render* functions ONLY
 *   NEVER mix compute and render logic.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const PCR_BANDS = {
    FLAT:    { max: 10,  label: 'FLAT',    color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
    MILD:    { max: 25,  label: 'MILD',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    STRONG:  { max: 45,  label: 'STRONG',  color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
    EXTREME: { max: Infinity, label: 'EXTREME', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' }
};

const OB_OS_THRESHOLD = { OVERBOUGHT: 80, OVERSOLD: 20 };

const OI_PATTERN = {
    LONG_BUILD:   { label: 'LONG BUILD',   pill: 'pill-green',  score: 1 },
    SHORT_BUILD:  { label: 'SHORT BUILD',  pill: 'pill-red',    score: -1 },
    LONG_UNWIND:  { label: 'LONG UNWIND',  pill: 'pill-orange', score: -0.5 },
    SHORT_COVER:  { label: 'SHORT COVER',  pill: 'pill-cyan',   score: 0.5 },
    MINOR:        { label: 'MINOR',        pill: 'pill-slate',  score: 0 }
};

const OI_SIG_THRESHOLD  = 500000;
const PRM_SIG_THRESHOLD = 5;

// Chart instance registry (for destroy-before-recreate)
const _chartRegistry = {};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function filterJSON3ByCutoff(json3, boundaryTimestamp) {
    /**
     * BOUNDARY RULE: Only use CINs at or before JSON2's timestamp.
     * Enables freeze-frame analysis even if JSON3 has later data.
     */
    const boundary = boundaryTimestamp.replace(/:/g, '');
    const all = json3.data.logdata;
    return all.filter(cin => cin.timestamp <= boundary);
}

function findATM(spot, strikes) {
    /** Nearest 50-point strike to spot */
    const numStrikes = strikes.map(Number).sort((a, b) => a - b);
    let best = numStrikes[0];
    let bestDist = Math.abs(spot - best);
    for (const s of numStrikes) {
        const d = Math.abs(spot - s);
        if (d < bestDist) { best = s; bestDist = d; }
    }
    return best;
}

function getCommonStrikes(j1, j2) {
    const s1 = new Set(Object.keys(j1.per_strike));
    const s2 = new Set(Object.keys(j2.per_strike));
    return [...s1].filter(s => s2.has(s)).sort((a, b) => Number(a) - Number(b));
}

function classifyOIPrm(deltaOI, deltaPrm) {
    /**
     * OI + Premium cross-classification:
     *   OI ↑ + Prm ↑ = LONG BUILD (genuine demand)
     *   OI ↑ + Prm ↓ = SHORT BUILD (writers)
     *   OI ↓ + Prm ↑ = SHORT COVER (squeeze)
     *   OI ↓ + Prm ↓ = LONG UNWIND (exit)
     */
    const oiUp = deltaOI > OI_SIG_THRESHOLD;
    const oiDn = deltaOI < -OI_SIG_THRESHOLD;
    const pUp  = deltaPrm > PRM_SIG_THRESHOLD;
    const pDn  = deltaPrm < -PRM_SIG_THRESHOLD;

    if (oiUp && pUp)  return 'LONG_BUILD';
    if (oiUp && pDn)  return 'SHORT_BUILD';
    if (oiDn && pUp)  return 'SHORT_COVER';
    if (oiDn && pDn)  return 'LONG_UNWIND';
    if (oiUp)         return 'LONG_BUILD';   // OI up, prm flat
    if (oiDn)         return 'LONG_UNWIND';  // OI down, prm flat
    return 'MINOR';
}

function pillHTML(text, pillClass) {
    return `<span class="pill ${pillClass}">${text}</span>`;
}

function fmtNum(n, decimals = 1) {
    if (n === undefined || n === null || isNaN(n)) return '—';
    return Number(n).toFixed(decimals);
}

function fmtLargeNum(n) {
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(0);
}

function signColor(val) {
    if (val > 0) return 'var(--green)';
    if (val < 0) return 'var(--red)';
    return 'var(--text2)';
}

function signPrefix(val, dec = 1) {
    const v = Number(val);
    return (v > 0 ? '+' : '') + v.toFixed(dec);
}

function destroyChart(id) {
    if (_chartRegistry[id]) {
        _chartRegistry[id].destroy();
        delete _chartRegistry[id];
    }
}

function tsToDisplay(ts) {
    /** "144101" → "14:41" */
    const s = String(ts).padStart(6, '0');
    return s.slice(0, 2) + ':' + s.slice(2, 4);
}


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 1: PCR DIVERSION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function computePCRDiversion(filteredCINs) {
    /**
     * FORMULA:  pcx[i] = (pcr[i] - pcr[i-3]) × 1000
     *
     * RETURNS: {
     *   allEntries: [{cin, timestamp, pcr, pcx, band, position, zone, spotDelta, prmRatio}],
     *   last3: [...last 3 entries],
     *   pcrRange: {min, max, range},
     *   sessionStats: {meanAbsPcx, stdevPcx, maxAbsPcx},
     *   signal: {label, description, score}
     * }
     */
    const entries = filteredCINs;
    if (entries.length < 4) return null;

    const pcrs = entries.map(e => e.pcr);
    const pcrMin = Math.min(...pcrs);
    const pcrMax = Math.max(...pcrs);
    const pcrRange = pcrMax - pcrMin || 0.001; // avoid div0

    // Compute pcx for all CINs where i >= 3
    const allEntries = [];
    const absPcxList = [];

    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        let pcx = null, band = null, position = null, zone = null, spotDelta = null;

        if (i >= 3) {
            pcx = (e.pcr - entries[i - 3].pcr) * 1000;
            spotDelta = e.nifty_close - entries[i - 3].nifty_close;
            absPcxList.push(Math.abs(pcx));
        }

        position = ((e.pcr - pcrMin) / pcrRange) * 100;

        if (position > OB_OS_THRESHOLD.OVERBOUGHT) zone = 'OVERBOUGHT';
        else if (position < OB_OS_THRESHOLD.OVERSOLD) zone = 'OVERSOLD';
        else zone = 'MID';

        if (pcx !== null) {
            const ap = Math.abs(pcx);
            if (ap < PCR_BANDS.FLAT.max) band = 'FLAT';
            else if (ap < PCR_BANDS.MILD.max) band = 'MILD';
            else if (ap < PCR_BANDS.STRONG.max) band = 'STRONG';
            else band = 'EXTREME';
        }

        allEntries.push({
            cin: e.cin, timestamp: e.timestamp, pcr: e.pcr,
            pcx, band, position, zone, spotDelta,
            prmRatio: e.premium_ratio, niftyClose: e.nifty_close,
            ceOI: e.sum_oiCE, peOI: e.sum_oiPE,
            cePrm: e.total_ce_premium, pePrm: e.total_pe_premium
        });
    }

    // Session stats
    const mean = absPcxList.reduce((a, b) => a + b, 0) / absPcxList.length;
    const variance = absPcxList.reduce((a, b) => a + (b - mean) ** 2, 0) / absPcxList.length;
    const stdev = Math.sqrt(variance);
    const maxAbsPcx = Math.max(...absPcxList);

    // Last 3
    const last3 = allEntries.filter(e => e.pcx !== null).slice(-3);

    // Signal classification from last 3
    const lastEntry = last3[last3.length - 1] || {};
    const signal = classifyPCRSignal(lastEntry);

    return {
        allEntries,
        last3,
        pcrRange: { min: pcrMin, max: pcrMax, range: pcrRange },
        sessionStats: { meanAbsPcx: mean, stdevPcx: stdev, maxAbsPcx },
        signal
    };
}

function classifyPCRSignal(entry) {
    /**
     * COMPOSITE: pcx direction × position zone → signal
     */
    if (!entry || entry.pcx === null) return { label: 'NO DATA', description: 'Insufficient CINs', score: 0 };

    const { pcx, band, position, zone } = entry;
    const isRising = pcx > 0;
    const isFalling = pcx < 0;
    const isExtreme = band === 'EXTREME' || band === 'STRONG';

    // Rising PCR (PE building)
    if (isRising && zone === 'OVERSOLD') {
        return { label: 'MOMENTUM REVERSAL', description: 'PE building from low base — bullish thrust', score: 0.8 };
    }
    if (isRising && zone === 'OVERBOUGHT') {
        return { label: 'SATURATION', description: 'PE piling at top — pause/reversal imminent', score: -0.3 };
    }
    if (isRising && isExtreme) {
        return { label: 'BULL ACCELERATION', description: 'Strong PE build mid-range — continuation', score: 0.6 };
    }

    // Falling PCR (CE dominating)
    if (isFalling && zone === 'OVERBOUGHT') {
        return { label: 'BEAR MOMENTUM', description: 'CE taking over from bullish peak', score: -0.7 };
    }
    if (isFalling && zone === 'OVERSOLD') {
        return { label: 'EXHAUSTION', description: 'CE maxed out — bounce potential', score: 0.4 };
    }
    if (isFalling && isExtreme) {
        return { label: 'BEAR ACCELERATION', description: 'Strong CE build mid-range — continuation', score: -0.6 };
    }

    // Flat / Mild
    if (band === 'FLAT') {
        if (zone === 'OVERSOLD') return { label: 'RANGE LOW', description: 'PCR stable at low — no trigger', score: -0.1 };
        if (zone === 'OVERBOUGHT') return { label: 'RANGE HIGH', description: 'PCR stable at high — no trigger', score: 0.1 };
        return { label: 'RANGE BOUND', description: 'No momentum either way', score: 0 };
    }

    // Mild with direction
    if (isRising) return { label: 'MILD BULL', description: 'Gentle PE build — watch for acceleration', score: 0.2 };
    if (isFalling) return { label: 'MILD BEAR', description: 'Gentle CE build — watch for acceleration', score: -0.2 };

    return { label: 'NEUTRAL', description: 'No clear signal', score: 0 };
}


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 2: OI BUILD DELTA (JSON1 → JSON2)
// ═══════════════════════════════════════════════════════════════════════════

function computeOIBuild(json1, json2) {
    /**
     * Per-strike OI + Premium delta between anchor and current.
     *
     * RETURNS: {
     *   perStrike: [{strike, ceDeltaOI, peDeltaOI, ceDeltaPrm, peDeltaPrm,
     *                cePattern, pePattern, cePatternInfo, pePatternInfo}],
     *   zones: {support:[], battleground:[], resistance:[]},
     *   netBias: {totalCEGrowth, totalPEGrowth, ratio, direction},
     *   spotDelta: number,
     *   score: number
     * }
     */
    const common = getCommonStrikes(json1, json2);
    const spot2 = json2.meta.nifty_close;
    const spot1 = json1.meta.nifty_close;
    const atm2 = findATM(spot2, common);

    const perStrike = [];
    let totalCEGrowth = 0, totalPEGrowth = 0;

    for (const s of common) {
        const s1 = json1.per_strike[s];
        const s2 = json2.per_strike[s];
        const strike = Number(s);

        const ceDOI = s2.CEdata.total_oi - s1.CEdata.total_oi;
        const peDOI = s2.PEdata.total_oi - s1.PEdata.total_oi;
        const ceDP  = (s2.CEdata.premium || 0) - (s1.CEdata.premium || 0);
        const peDP  = (s2.PEdata.premium || 0) - (s1.PEdata.premium || 0);

        const cePattern = classifyOIPrm(ceDOI, ceDP);
        const pePattern = classifyOIPrm(peDOI, peDP);

        totalCEGrowth += ceDOI;
        totalPEGrowth += peDOI;

        perStrike.push({
            strike, ceDeltaOI: ceDOI, peDeltaOI: peDOI,
            ceDeltaPrm: ceDP, peDeltaPrm: peDP,
            cePattern, pePattern,
            cePatternInfo: OI_PATTERN[cePattern],
            pePatternInfo: OI_PATTERN[pePattern],
            isATM: Math.abs(strike - atm2) <= 25
        });
    }

    // Zone classification relative to current ATM
    const zones = { support: [], battleground: [], resistance: [] };
    for (const ps of perStrike) {
        if (ps.strike < atm2 - 75) zones.support.push(ps);
        else if (ps.strike > atm2 + 75) zones.resistance.push(ps);
        else zones.battleground.push(ps);
    }

    // Net bias
    const ratio = totalPEGrowth !== 0 ? totalCEGrowth / totalPEGrowth : Infinity;
    const direction = ratio > 2 ? 'BEARISH' : ratio < 0.5 ? 'BULLISH' : 'NEUTRAL';

    // Scoring
    let score = 0;
    if (direction === 'BEARISH') score = -0.8;
    else if (direction === 'BULLISH') score = 0.8;
    // Adjust by zone patterns
    const resShortBuilds = zones.resistance.filter(z => z.cePattern === 'SHORT_BUILD').length;
    const supLongBuilds  = zones.support.filter(z => z.pePattern === 'LONG_BUILD').length;
    if (resShortBuilds >= 3) score -= 0.2;
    if (supLongBuilds >= 3) score += 0.2;
    score = Math.max(-1, Math.min(1, score));

    return {
        perStrike, zones,
        netBias: { totalCEGrowth, totalPEGrowth, ratio: ratio.toFixed(1), direction },
        spotDelta: spot2 - spot1,
        atm: atm2,
        score
    };
}


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 3: ATM PREMIUM STRUCTURE + MIGRATION
// ═══════════════════════════════════════════════════════════════════════════

function computeATMPremium(json1, json2) {
    /**
     * ATM identification at both timestamps, straddle migration,
     * OI/Premium ratio, seller breakeven + cushion.
     *
     * RETURNS: {
     *   oldATM, newATM, spotOld, spotNew,
     *   migration: {oldStraddle, newStraddle, change, pctChange, ivDirection},
     *   atmBand: [{strike, ceOIP, peOIP, ceClass, peClass, ceBE, peBE, ceCushion, peCushion}],
     *   vulnerability: string,
     *   score: number
     * }
     */
    const strikes1 = Object.keys(json1.per_strike);
    const strikes2 = Object.keys(json2.per_strike);
    const spot1 = json1.meta.nifty_close;
    const spot2 = json2.meta.nifty_close;

    const oldATM = findATM(spot1, strikes1);
    const newATM = findATM(spot2, strikes2);

    // Straddle migration
    const oldCE = json1.per_strike[String(oldATM)]?.CEdata?.premium || 0;
    const oldPE = json1.per_strike[String(oldATM)]?.PEdata?.premium || 0;
    const newCE = json2.per_strike[String(newATM)]?.CEdata?.premium || 0;
    const newPE = json2.per_strike[String(newATM)]?.PEdata?.premium || 0;
    const oldStraddle = oldCE + oldPE;
    const newStraddle = newCE + newPE;
    const straddleChg = newStraddle - oldStraddle;
    const straddlePct = oldStraddle ? (straddleChg / oldStraddle) * 100 : 0;
    const ivDirection = straddleChg > 5 ? 'IV EXPANDED' : straddleChg < -5 ? 'IV CONTRACTED' : 'IV FLAT';

    // ATM Band (±50 from current ATM)
    const bandStrikes = [newATM - 50, newATM, newATM + 50].map(String);
    const atmBand = [];

    for (const s of bandStrikes) {
        const data = json2.per_strike[s];
        if (!data) continue;
        const ce = data.CEdata;
        const pe = data.PEdata;
        const strike = Number(s);

        const cePrm = ce.premium || 0;
        const pePrm = pe.premium || 0;
        const ceOIP = cePrm > 0 ? ce.total_oi_normalized / cePrm : 999;
        const peOIP = pePrm > 0 ? pe.total_oi_normalized / pePrm : 999;

        const ceClass = ceOIP > 80 ? 'SOLD' : ceOIP < 20 ? 'BOUGHT' : 'MIXED';
        const peClass = peOIP > 80 ? 'SOLD' : peOIP < 20 ? 'BOUGHT' : 'MIXED';

        const ceBE = strike + cePrm;
        const peBE = strike - pePrm;
        const ceCushion = ceBE - spot2;
        const peCushion = spot2 - peBE;

        atmBand.push({
            strike, ceOIP: ceOIP.toFixed(1), peOIP: peOIP.toFixed(1),
            ceClass, peClass, cePrm, pePrm,
            ceBE: ceBE.toFixed(1), peBE: peBE.toFixed(1),
            ceCushion: ceCushion.toFixed(1), peCushion: peCushion.toFixed(1),
            isATM: strike === newATM,
            ceOI: ce.total_oi_normalized, peOI: pe.total_oi_normalized
        });
    }

    // Vulnerability: which side has less cushion at ATM
    const atmEntry = atmBand.find(a => a.isATM);
    let vulnerability = 'BALANCED';
    let score = 0;
    if (atmEntry) {
        const ceCush = parseFloat(atmEntry.ceCushion);
        const peCush = parseFloat(atmEntry.peCushion);
        if (peCush < ceCush * 0.75) { vulnerability = 'PE VULNERABLE'; score = -0.7; }
        else if (ceCush < peCush * 0.75) { vulnerability = 'CE VULNERABLE'; score = 0.7; }
        else score = 0;
    }

    // IV direction affects score
    if (ivDirection === 'IV CONTRACTED') score -= 0.1;
    if (ivDirection === 'IV EXPANDED') score += 0.1;
    score = Math.max(-1, Math.min(1, score));

    return {
        oldATM, newATM, spotOld: spot1, spotNew: spot2,
        migration: { oldStraddle, newStraddle, change: straddleChg, pctChange: straddlePct, ivDirection,
                     oldCE, oldPE, newCE, newPE },
        atmBand, vulnerability, score
    };
}


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 4: OI vs PREMIUM DIVERGENCE (3-way cross-read)
// ═══════════════════════════════════════════════════════════════════════════

function computeDivergence(json1, json2, filteredCINs) {
    /**
     * 3-way cross-analysis:
     *   JSON3 aggregate journey (anchor CIN → boundary CIN)
     *   JSON1→JSON2 per-strike pattern
     *   PEff computation
     *   claude.md pattern matching
     *
     * RETURNS: {
     *   aggregate: {dCeOI, dPeOI, dCePrm, dPePrm, ceOIGrowth, peOIGrowth, ...},
     *   peff: {cePEff, pePEff, interpretation},
     *   trapAlert: {detected, pattern, description},
     *   score: number
     * }
     */
    if (!filteredCINs || filteredCINs.length < 4) return null;

    // Find anchor CIN closest to JSON1 timestamp
    const j1ts = json1.meta.timestamp.replace(/:/g, '');
    let anchorCIN = filteredCINs[0];
    for (const c of filteredCINs) {
        if (c.timestamp <= j1ts) anchorCIN = c;
        else break;
    }
    const boundaryCIN = filteredCINs[filteredCINs.length - 1];

    // Aggregate journey
    const dCeOI  = boundaryCIN.sum_oiCE - anchorCIN.sum_oiCE;
    const dPeOI  = boundaryCIN.sum_oiPE - anchorCIN.sum_oiPE;
    const dCeCOI = boundaryCIN.sum_CoiCE - anchorCIN.sum_CoiCE;
    const dPeCOI = boundaryCIN.sum_CoiPE - anchorCIN.sum_CoiPE;
    const dCePrm = boundaryCIN.total_ce_premium - anchorCIN.total_ce_premium;
    const dPePrm = boundaryCIN.total_pe_premium - anchorCIN.total_pe_premium;
    const dSpot  = boundaryCIN.nifty_close - anchorCIN.nifty_close;
    const dPCR   = (boundaryCIN.pcr - anchorCIN.pcr) * 1000;

    const cePrmPct = anchorCIN.total_ce_premium ? (dCePrm / anchorCIN.total_ce_premium) * 100 : 0;
    const pePrmPct = anchorCIN.total_pe_premium ? (dPePrm / anchorCIN.total_pe_premium) * 100 : 0;
    const oiRatio  = dPeOI !== 0 ? dCeOI / dPeOI : Infinity;

    // PEff computation (aggregate)
    let cePEff = 0, pePEff = 0, peffInterpretation = '';
    if (Math.abs(dSpot) > 1) {
        cePEff = dCePrm / dSpot;
        pePEff = dPePrm / dSpot;
    }

    // PEff interpretation per claude.md
    // When spot FALLS: CE goes ITM (should rise), PE goes OTM (should fall)
    // When spot RISES: CE goes OTM (should fall), PE goes ITM (should rise)
    if (dSpot < -10) {
        // Spot fell
        if (dCePrm < 0) peffInterpretation += 'CE premium FALLING while going ITM → CE sellers crushing IV. ';
        if (dPePrm < 0 && Math.abs(pePrmPct) > 20) peffInterpretation += 'PE premium COLLAPSED despite going closer → MASSIVE PE DISTRIBUTION. ';
        else if (dPePrm < 0) peffInterpretation += 'PE premium falling as expected (going OTM). ';
    } else if (dSpot > 10) {
        // Spot rose
        if (dPePrm < 0 && Math.abs(pePrmPct) > 20) peffInterpretation += 'PE premium EXCESS decay → PEff DISTRIBUTION signal. ';
        if (dCePrm < 0) peffInterpretation += 'CE premium falling despite going ITM → CE sellers active. ';
    } else {
        peffInterpretation = 'Spot barely moved — premium changes are IV/theta driven. ';
    }

    // Trap detection (claude.md Liquidity Harvest Pattern)
    let trapDetected = false;
    let trapPattern = '';
    let trapDescription = '';

    // Check: PE walls exist (high PE OI at support) BUT aggregate PE premium crushed
    const pePrmCrushed = pePrmPct < -25;
    const ceOIDominant = oiRatio > 5;

    if (pePrmCrushed && ceOIDominant) {
        trapDetected = true;
        trapPattern = 'LIQUIDITY HARVEST';
        trapDescription = 'PE walls look like support but PE premium crushed ' +
            fmtNum(pePrmPct, 1) + '%. CE OI grew ' + fmtNum(oiRatio, 1) +
            '× PE → SM building CE fortress while retail buys CE at "support". Fake floor.';
    } else if (pePrmCrushed && dSpot < -50) {
        trapDetected = true;
        trapPattern = 'DISTRIBUTION TRAP';
        trapDescription = 'PE premium crushed ' + fmtNum(pePrmPct, 1) +
            '% on ' + fmtNum(dSpot, 0) + 'pt drop → PE walls are SOLD positions being abandoned.';
    }

    // Score
    let score = 0;
    if (trapDetected) score = -0.9;
    else if (pePrmCrushed) score = -0.5;
    else if (cePrmPct < -20 && dSpot > 50) score = 0.5; // CE crushed on rise = accumulation
    score = Math.max(-1, Math.min(1, score));

    return {
        aggregate: {
            dCeOI, dPeOI, dCeCOI, dPeCOI, dCePrm, dPePrm, dSpot, dPCR,
            cePrmPct, pePrmPct, oiRatio,
            anchorTs: anchorCIN.timestamp, boundaryTs: boundaryCIN.timestamp,
            anchorSpot: anchorCIN.nifty_close, boundarySpot: boundaryCIN.nifty_close,
            anchorPCR: anchorCIN.pcr, boundaryPCR: boundaryCIN.pcr
        },
        peff: { cePEff, pePEff, interpretation: peffInterpretation },
        trapAlert: { detected: trapDetected, pattern: trapPattern, description: trapDescription },
        score
    };
}


// ═══════════════════════════════════════════════════════════════════════════
// MODULE 5: COMPOSITE VERDICT
// ═══════════════════════════════════════════════════════════════════════════

function computeVerdict(m1, m2, m3, m4) {
    /**
     * Weighted composite of all 4 modules.
     * Each module score is [-1, +1].
     * Weights: equal (0.25 each).
     *
     * RETURNS: {
     *   score, label, color,
     *   breakdown: [{module, label, score}],
     *   keyLevels: {resistance, support, danger}
     * }
     */
    const modules = [
        { name: 'PCR Diversion',     score: m1?.signal?.score || 0, label: m1?.signal?.label || 'N/A' },
        { name: 'OI Build',          score: m2?.score || 0, label: m2?.netBias?.direction || 'N/A' },
        { name: 'ATM Premium',       score: m3?.score || 0, label: m3?.vulnerability || 'N/A' },
        { name: 'OI/Prm Divergence', score: m4?.score || 0, label: m4?.trapAlert?.detected ? m4.trapAlert.pattern : 'NORMAL' }
    ];

    const composite = modules.reduce((sum, m) => sum + m.score, 0) / modules.length;

    let label, color;
    if (composite > 0.5)       { label = 'BULLISH';       color = 'var(--green)'; }
    else if (composite > 0.15) { label = 'MILD BULLISH';  color = '#86efac'; }
    else if (composite > -0.15){ label = 'NEUTRAL';        color = 'var(--text2)'; }
    else if (composite > -0.5) { label = 'MILD BEARISH';  color = '#fca5a5'; }
    else                       { label = 'BEARISH';        color = 'var(--red)'; }

    // Key levels from ATM data
    const keyLevels = {};
    if (m3) {
        const atmEntry = m3.atmBand.find(a => a.isATM);
        if (atmEntry) {
            keyLevels.support = atmEntry.peBE;
            keyLevels.resistance = atmEntry.ceBE;
        }
    }
    if (m4?.trapAlert?.detected) {
        keyLevels.trapPattern = m4.trapAlert.pattern;
    }

    return { score: composite, label, color, breakdown: modules, keyLevels };
}


// ═══════════════════════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function renderOIPrmDiversionTab(json1, json2, json3) {
    /**
     * ENTRY POINT — called by tryRender() in HTML.
     * Orchestrates all compute + render.
     */
    const container = document.getElementById('oiprm-content');
    if (!container) return;

    // BOUNDARY: Only use JSON3 CINs up to JSON2 timestamp
    const boundary = json2.meta.timestamp.replace(/:/g, '');
    const filteredCINs = json3 ? filterJSON3ByCutoff(json3, boundary) : [];

    // ═══ COMPUTE ═══
    const m1 = filteredCINs.length >= 4 ? computePCRDiversion(filteredCINs) : null;
    const m2 = computeOIBuild(json1, json2);
    const m3 = computeATMPremium(json1, json2);
    const m4 = filteredCINs.length >= 4 ? computeDivergence(json1, json2, filteredCINs) : null;
    const verdict = computeVerdict(m1, m2, m3, m4);

    // ═══ RENDER ═══
    let html = '';

    // Header stats row
    html += renderHeaderStats(json1, json2, filteredCINs);

    // Section 1: PCR Diversion
    if (m1) html += renderSection1_PCR(m1, filteredCINs);

    // Section 2: OI Build
    html += renderSection2_OIBuild(m2);

    // Section 3: ATM Premium
    html += renderSection3_ATM(m3);

    // Section 4: Divergence
    if (m4) html += renderSection4_Divergence(m4);

    // Section 5: Verdict
    html += renderSection5_Verdict(verdict);

    container.innerHTML = html;

    // Post-render: create charts (need DOM to exist first)
    if (m1) renderPCRSparklineChart(m1);
    renderOIBuildBarChart(m2);
}


// ─── HEADER STATS ───

function renderHeaderStats(json1, json2, filteredCINs) {
    const spot1 = json1.meta.nifty_close;
    const spot2 = json2.meta.nifty_close;
    const dSpot = spot2 - spot1;
    const ts1 = tsToDisplay(json1.meta.timestamp);
    const ts2 = tsToDisplay(json2.meta.timestamp);
    const cinCount = filteredCINs.length;

    return `
    <div class="card" style="border-left: 3px solid var(--blue);">
        <div class="stat-row">
            <div class="stat">
                <div class="label">ANCHOR → CURRENT</div>
                <div class="value mono">${ts1} → ${ts2}</div>
                <div class="delta">${cinCount} CINs analyzed</div>
            </div>
            <div class="stat">
                <div class="label">SPOT</div>
                <div class="value mono" style="color:${signColor(dSpot)}">${fmtNum(spot2, 2)}</div>
                <div class="delta" style="color:${signColor(dSpot)}">${signPrefix(dSpot, 2)} (${signPrefix(dSpot/spot1*100, 2)}%)</div>
            </div>
            <div class="stat">
                <div class="label">PCR (Anchor)</div>
                <div class="value mono">${fmtNum(json1.meta.snapshot_pcr, 2)}</div>
            </div>
            <div class="stat">
                <div class="label">PCR (Current)</div>
                <div class="value mono">${fmtNum(json2.meta.snapshot_pcr, 2)}</div>
                <div class="delta" style="color:${signColor(json2.meta.snapshot_pcr - json1.meta.snapshot_pcr)}">
                    ${signPrefix((json2.meta.snapshot_pcr - json1.meta.snapshot_pcr)*1000, 1)} pcx-units
                </div>
            </div>
            <div class="stat">
                <div class="label">EXPIRY</div>
                <div class="value mono" style="font-size:0.95rem;">${json2.meta.expiry}</div>
            </div>
        </div>
    </div>`;
}


// ─── SECTION 1: PCR DIVERSION ───

function renderSection1_PCR(m1, filteredCINs) {
    const { last3, pcrRange, sessionStats, signal } = m1;

    // Signal badge color
    const sigColor = signal.score > 0.3 ? 'var(--green)' : signal.score < -0.3 ? 'var(--red)' : 'var(--orange)';
    const sigBg = signal.score > 0.3 ? 'var(--green-bg)' : signal.score < -0.3 ? 'var(--red-bg)' : 'var(--orange-bg)';

    // Last 3 cards
    let cardsHTML = '';
    for (const e of last3) {
        const bandInfo = PCR_BANDS[e.band] || PCR_BANDS.FLAT;
        const zoneColor = e.zone === 'OVERBOUGHT' ? 'var(--red)' : e.zone === 'OVERSOLD' ? 'var(--green)' : 'var(--text2)';
        cardsHTML += `
        <div style="background:var(--surface2); border-radius:10px; padding:14px; flex:1; min-width:160px; border-top:3px solid ${bandInfo.color};">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:0.7rem; color:var(--text2); text-transform:uppercase; letter-spacing:1px;">CIN ${e.cin}</span>
                <span class="mono" style="font-size:0.75rem; color:var(--text2);">${tsToDisplay(e.timestamp)}</span>
            </div>
            <div class="mono" style="font-size:1.4rem; font-weight:700; color:${signColor(e.pcx)}; margin-bottom:4px;">
                ${signPrefix(e.pcx, 1)}
            </div>
            <div style="margin-bottom:6px;">
                <span class="pill" style="background:${bandInfo.bg}; color:${bandInfo.color};">${bandInfo.label}</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text2);">
                Position: <span class="mono" style="color:${zoneColor}">${fmtNum(e.position, 1)}%</span>
                <span style="color:${zoneColor}; font-weight:600;">${e.zone}</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text2); margin-top:2px;">
                Spot Δ: <span class="mono" style="color:${signColor(e.spotDelta)}">${signPrefix(e.spotDelta, 1)}</span>
            </div>
        </div>`;
    }

    // PCR position gauge
    const lastEntry = last3[last3.length - 1] || {};
    const pos = lastEntry.position || 50;
    const gaugeColor = pos > 80 ? 'var(--red)' : pos < 20 ? 'var(--green)' : 'var(--blue)';

    return `
    <div class="card">
        <h2><span class="dot" style="background:var(--cyan);"></span>PCR DIVERSION ENGINE</h2>

        <!-- Signal Badge -->
        <div class="scenario-badge" style="background:${sigBg}; color:${sigColor}; border:1px solid ${sigColor}40;">
            ${signal.label} — ${signal.description}
        </div>

        <!-- Last 3 CIN Cards -->
        <div style="display:flex; gap:12px; flex-wrap:wrap; margin:16px 0;">
            ${cardsHTML}
        </div>

        <!-- PCR Position Gauge -->
        <div style="background:var(--surface2); border-radius:10px; padding:16px; margin:12px 0;">
            <div style="font-size:0.75rem; color:var(--text2); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">
                PCR Session Position
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <span class="mono" style="font-size:0.75rem; color:var(--green);">${fmtNum(pcrRange.min, 4)}</span>
                <div style="flex:1; height:12px; background:var(--bg); border-radius:6px; position:relative; overflow:visible;">
                    <!-- Overbought/Oversold zones -->
                    <div style="position:absolute; left:0; width:20%; height:100%; background:rgba(34,197,94,0.15); border-radius:6px 0 0 6px;"></div>
                    <div style="position:absolute; right:0; width:20%; height:100%; background:rgba(239,68,68,0.15); border-radius:0 6px 6px 0;"></div>
                    <!-- Pointer -->
                    <div style="position:absolute; left:${pos}%; top:-3px; width:18px; height:18px; background:${gaugeColor}; border-radius:50%; transform:translateX(-50%); border:2px solid var(--bg);"></div>
                </div>
                <span class="mono" style="font-size:0.75rem; color:var(--red);">${fmtNum(pcrRange.max, 4)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:0.65rem; color:var(--text2);">
                <span>← OVERSOLD (CE heavy)</span>
                <span>OVERBOUGHT (PE heavy) →</span>
            </div>
        </div>

        <!-- Session Stats -->
        <div class="stat-row" style="margin-top:12px;">
            <div class="stat">
                <div class="label">Mean |pcx|</div>
                <div class="value mono">${fmtNum(sessionStats.meanAbsPcx, 2)}</div>
            </div>
            <div class="stat">
                <div class="label">Std Dev</div>
                <div class="value mono">${fmtNum(sessionStats.stdevPcx, 2)}</div>
            </div>
            <div class="stat">
                <div class="label">Max |pcx|</div>
                <div class="value mono">${fmtNum(sessionStats.maxAbsPcx, 1)}</div>
            </div>
            <div class="stat">
                <div class="label">Dynamic Threshold</div>
                <div class="value mono">${fmtNum(sessionStats.meanAbsPcx + 2 * sessionStats.stdevPcx, 1)}</div>
            </div>
        </div>

        <!-- Sparkline Chart Placeholder -->
        <div style="margin-top:16px;">
            <div style="font-size:0.75rem; color:var(--text2); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">
                PCR + Spot Journey
            </div>
            <div class="chart-wrap" style="height:280px;">
                <canvas id="pcrSparklineChart"></canvas>
            </div>
        </div>
    </div>`;
}

function renderPCRSparklineChart(m1) {
    destroyChart('pcrSparklineChart');
    const ctx = document.getElementById('pcrSparklineChart');
    if (!ctx) return;

    const entries = m1.allEntries;
    const labels = entries.map(e => tsToDisplay(e.timestamp));
    const pcrData = entries.map(e => e.pcr);
    const spotData = entries.map(e => e.niftyClose);
    const pcxData = entries.map(e => e.pcx);

    _chartRegistry['pcrSparklineChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'PCR',
                    data: pcrData,
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6,182,212,0.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    yAxisID: 'yPCR'
                },
                {
                    label: 'Spot',
                    data: spotData,
                    borderColor: '#f59e0b88',
                    borderWidth: 1.5,
                    borderDash: [4, 2],
                    tension: 0.3,
                    pointRadius: 0,
                    yAxisID: 'ySpot'
                },
                {
                    label: 'pcx',
                    data: pcxData,
                    type: 'bar',
                    backgroundColor: pcxData.map(v => v === null ? 'transparent' : v > 0 ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'),
                    yAxisID: 'yPcx',
                    barPercentage: 0.6,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { color: '#8b90a5', font: { size: 10 }, boxWidth: 12 } },
                tooltip: {
                    backgroundColor: '#1a1d27', borderColor: '#2e3347', borderWidth: 1,
                    titleColor: '#e2e4ed', bodyColor: '#8b90a5',
                    callbacks: {
                        label: function(ctx) {
                            if (ctx.dataset.label === 'pcx' && ctx.raw === null) return '';
                            return `${ctx.dataset.label}: ${ctx.raw !== null ? Number(ctx.raw).toFixed(ctx.dataset.label === 'Spot' ? 2 : 4) : '—'}`;
                        }
                    }
                }
            },
            scales: {
                x: { display: true, ticks: { color: '#8b90a5', font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 15 }, grid: { color: '#2e334720' } },
                yPCR: { position: 'left', ticks: { color: '#06b6d4', font: { size: 9 } }, grid: { color: '#2e334730' }, title: { display: true, text: 'PCR', color: '#06b6d4', font: { size: 10 } } },
                ySpot: { position: 'right', ticks: { color: '#f59e0b88', font: { size: 9 } }, grid: { display: false }, title: { display: true, text: 'Spot', color: '#f59e0b88', font: { size: 10 } } },
                yPcx: { display: false }
            }
        }
    });
}


// ─── SECTION 2: OI BUILD ───

function renderSection2_OIBuild(m2) {
    const { perStrike, netBias, spotDelta, atm } = m2;
    const biasColor = netBias.direction === 'BEARISH' ? 'var(--red)' : netBias.direction === 'BULLISH' ? 'var(--green)' : 'var(--text2)';
    const biasBg = netBias.direction === 'BEARISH' ? 'var(--red-bg)' : netBias.direction === 'BULLISH' ? 'var(--green-bg)' : 'rgba(148,163,184,0.15)';

    // Build table rows
    let rows = '';
    for (const ps of perStrike) {
        const atmMark = ps.isATM ? ' ★' : '';
        const rowBg = ps.isATM ? 'background:var(--surface2);' : '';
        rows += `
        <tr style="${rowBg}">
            <td class="mono" style="font-weight:${ps.isATM ? '700' : '400'};">${ps.strike}${atmMark}</td>
            <td class="mono" style="color:${signColor(ps.ceDeltaOI)};">${fmtLargeNum(ps.ceDeltaOI)}</td>
            <td class="mono" style="color:${signColor(ps.ceDeltaPrm)};">${signPrefix(ps.ceDeltaPrm, 1)}</td>
            <td>${pillHTML(ps.cePatternInfo.label, ps.cePatternInfo.pill)}</td>
            <td class="mono" style="color:${signColor(ps.peDeltaOI)};">${fmtLargeNum(ps.peDeltaOI)}</td>
            <td class="mono" style="color:${signColor(ps.peDeltaPrm)};">${signPrefix(ps.peDeltaPrm, 1)}</td>
            <td>${pillHTML(ps.pePatternInfo.label, ps.pePatternInfo.pill)}</td>
        </tr>`;
    }

    return `
    <div class="card">
        <h2><span class="dot" style="background:var(--orange);"></span>OI BUILD DELTA (Anchor → Current)</h2>

        <!-- Bias Badge -->
        <div class="scenario-badge" style="background:${biasBg}; color:${biasColor}; border:1px solid ${biasColor}40;">
            ${netBias.direction} — CE grew ${fmtLargeNum(netBias.totalCEGrowth)} vs PE ${fmtLargeNum(netBias.totalPEGrowth)} (ratio: ${netBias.ratio}×)
        </div>

        <div class="stat-row">
            <div class="stat">
                <div class="label">CE OI Growth</div>
                <div class="value mono" style="color:var(--red);">${fmtLargeNum(netBias.totalCEGrowth)}</div>
            </div>
            <div class="stat">
                <div class="label">PE OI Growth</div>
                <div class="value mono" style="color:var(--green);">${fmtLargeNum(netBias.totalPEGrowth)}</div>
            </div>
            <div class="stat">
                <div class="label">Spot Δ</div>
                <div class="value mono" style="color:${signColor(spotDelta)};">${signPrefix(spotDelta, 2)}</div>
            </div>
            <div class="stat">
                <div class="label">Current ATM</div>
                <div class="value mono">${atm}</div>
            </div>
        </div>

        <!-- Bar Chart -->
        <div style="margin:16px 0;">
            <div style="font-size:0.75rem; color:var(--text2); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">
                CE vs PE OI Delta by Strike
            </div>
            <div class="chart-wrap" style="height:320px;">
                <canvas id="oiBuildBarChart"></canvas>
            </div>
        </div>

        <!-- Detailed Table -->
        <div style="overflow-x:auto; margin-top:16px;">
            <table>
                <thead>
                    <tr>
                        <th>Strike</th>
                        <th>CE ΔOI</th><th>CE ΔPrm</th><th>CE Pattern</th>
                        <th>PE ΔOI</th><th>PE ΔPrm</th><th>PE Pattern</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}

function renderOIBuildBarChart(m2) {
    destroyChart('oiBuildBarChart');
    const ctx = document.getElementById('oiBuildBarChart');
    if (!ctx) return;

    const labels = m2.perStrike.map(p => String(p.strike));
    const ceData = m2.perStrike.map(p => p.ceDeltaOI / 1e6);
    const peData = m2.perStrike.map(p => p.peDeltaOI / 1e6);

    _chartRegistry['oiBuildBarChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'CE ΔOI (M)',
                    data: ceData,
                    backgroundColor: ceData.map(v => v > 0 ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.25)'),
                    borderColor: 'rgba(239,68,68,0.8)',
                    borderWidth: 1
                },
                {
                    label: 'PE ΔOI (M)',
                    data: peData,
                    backgroundColor: peData.map(v => v > 0 ? 'rgba(34,197,94,0.6)' : 'rgba(34,197,94,0.25)'),
                    borderColor: 'rgba(34,197,94,0.8)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top', labels: { color: '#8b90a5', font: { size: 10 }, boxWidth: 12 } },
                tooltip: {
                    backgroundColor: '#1a1d27', borderColor: '#2e3347', borderWidth: 1,
                    titleColor: '#e2e4ed', bodyColor: '#8b90a5'
                }
            },
            scales: {
                x: { ticks: { color: '#8b90a5', font: { size: 9 }, maxRotation: 45 }, grid: { color: '#2e334720' } },
                y: { ticks: { color: '#8b90a5', font: { size: 9 } }, grid: { color: '#2e334730' }, title: { display: true, text: 'OI Δ (Millions)', color: '#8b90a5', font: { size: 10 } } }
            }
        }
    });
}


// ─── SECTION 3: ATM PREMIUM ───

function renderSection3_ATM(m3) {
    const { migration, atmBand, vulnerability, oldATM, newATM, spotOld, spotNew } = m3;
    const ivColor = migration.ivDirection === 'IV EXPANDED' ? 'var(--green)' : migration.ivDirection === 'IV CONTRACTED' ? 'var(--red)' : 'var(--text2)';
    const ivBg = migration.ivDirection === 'IV EXPANDED' ? 'var(--green-bg)' : migration.ivDirection === 'IV CONTRACTED' ? 'var(--red-bg)' : 'rgba(148,163,184,0.15)';

    // ATM band cards
    let bandCards = '';
    for (const a of atmBand) {
        const border = a.isATM ? 'border:2px solid var(--blue);' : 'border:1px solid var(--border);';
        const ceClassColor = a.ceClass === 'SOLD' ? 'pill-red' : a.ceClass === 'BOUGHT' ? 'pill-green' : 'pill-slate';
        const peClassColor = a.peClass === 'SOLD' ? 'pill-red' : a.peClass === 'BOUGHT' ? 'pill-green' : 'pill-slate';

        bandCards += `
        <div style="background:var(--surface2); border-radius:10px; padding:16px; flex:1; min-width:180px; ${border}">
            <div style="text-align:center; margin-bottom:10px;">
                <span class="mono" style="font-size:1.1rem; font-weight:700;">${a.strike}</span>
                ${a.isATM ? '<span class="pill pill-blue" style="margin-left:6px;">ATM</span>' : ''}
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.8rem;">
                <div style="text-align:center;">
                    <div style="color:var(--text2); font-size:0.65rem; text-transform:uppercase;">CE OI/P</div>
                    <div class="mono" style="font-weight:600;">${a.ceOIP}</div>
                    ${pillHTML(a.ceClass, ceClassColor)}
                </div>
                <div style="text-align:center;">
                    <div style="color:var(--text2); font-size:0.65rem; text-transform:uppercase;">PE OI/P</div>
                    <div class="mono" style="font-weight:600;">${a.peOIP}</div>
                    ${pillHTML(a.peClass, peClassColor)}
                </div>
            </div>
            <div style="margin-top:10px; font-size:0.75rem; color:var(--text2);">
                <div>CE Prm: <span class="mono">${fmtNum(a.cePrm)}</span> | PE Prm: <span class="mono">${fmtNum(a.pePrm)}</span></div>
                <div>CE OI: <span class="mono">${fmtNum(a.ceOI, 0)}</span> | PE OI: <span class="mono">${fmtNum(a.peOI, 0)}</span></div>
            </div>
        </div>`;
    }

    // Vulnerability
    const vulnColor = vulnerability === 'PE VULNERABLE' ? 'var(--red)' : vulnerability === 'CE VULNERABLE' ? 'var(--green)' : 'var(--text2)';

    // BE bars for ATM
    const atmEntry = atmBand.find(a => a.isATM);
    let beHTML = '';
    if (atmEntry) {
        const maxCushion = Math.max(parseFloat(atmEntry.ceCushion), parseFloat(atmEntry.peCushion)) || 1;
        const cePct = (parseFloat(atmEntry.ceCushion) / maxCushion) * 100;
        const pePct = (parseFloat(atmEntry.peCushion) / maxCushion) * 100;

        beHTML = `
        <div style="background:var(--surface2); border-radius:10px; padding:16px; margin-top:16px;">
            <div style="font-size:0.75rem; color:var(--text2); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">
                Seller Breakeven @ ${atmEntry.strike} ATM
            </div>
            <div class="peff-bar">
                <span class="bar-label" style="color:var(--red);">CE BE: ${atmEntry.ceBE}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${cePct}%; background:var(--red);"></div></div>
                <span class="mono" style="font-size:0.8rem;">${atmEntry.ceCushion}pts</span>
            </div>
            <div class="peff-bar">
                <span class="bar-label" style="color:var(--green);">PE BE: ${atmEntry.peBE}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${pePct}%; background:var(--green);"></div></div>
                <span class="mono" style="font-size:0.8rem;">${atmEntry.peCushion}pts</span>
            </div>
            <div style="text-align:center; margin-top:10px;">
                <span style="font-weight:700; color:${vulnColor};">→ ${vulnerability}</span>
                <span style="color:var(--text2); font-size:0.8rem;"> (smaller cushion = vulnerable side)</span>
            </div>
        </div>`;
    }

    return `
    <div class="card">
        <h2><span class="dot" style="background:var(--purple);"></span>ATM PREMIUM STRUCTURE + MIGRATION</h2>

        <!-- Migration Badge -->
        <div class="scenario-badge" style="background:${ivBg}; color:${ivColor}; border:1px solid ${ivColor}40;">
            ${migration.ivDirection} — Straddle: ${fmtNum(migration.oldStraddle, 2)} → ${fmtNum(migration.newStraddle, 2)}
            (${signPrefix(migration.pctChange, 1)}%)
        </div>

        <!-- Migration Details -->
        <div class="stat-row">
            <div class="stat">
                <div class="label">Old ATM (${oldATM})</div>
                <div class="value mono">${fmtNum(migration.oldStraddle, 2)}</div>
                <div class="delta">CE:${fmtNum(migration.oldCE)} + PE:${fmtNum(migration.oldPE)}</div>
            </div>
            <div class="stat">
                <div class="label">New ATM (${newATM})</div>
                <div class="value mono">${fmtNum(migration.newStraddle, 2)}</div>
                <div class="delta">CE:${fmtNum(migration.newCE)} + PE:${fmtNum(migration.newPE)}</div>
            </div>
            <div class="stat">
                <div class="label">Spot Migration</div>
                <div class="value mono">${fmtNum(spotOld, 2)} → ${fmtNum(spotNew, 2)}</div>
            </div>
        </div>

        <!-- ATM Band Cards -->
        <div style="display:flex; gap:12px; flex-wrap:wrap; margin:16px 0;">
            ${bandCards}
        </div>

        <!-- Seller BE -->
        ${beHTML}
    </div>`;
}


// ─── SECTION 4: DIVERGENCE ───

function renderSection4_Divergence(m4) {
    const { aggregate: agg, peff, trapAlert } = m4;

    // Trap alert
    let trapHTML = '';
    if (trapAlert.detected) {
        trapHTML = `
        <div class="scenario-badge" style="background:var(--red-bg); color:var(--red); border:2px solid var(--red)40; margin-bottom:16px;">
            ⚠️ TRAP DETECTED: ${trapAlert.pattern}<br>
            <span style="font-size:0.85rem; font-weight:400;">${trapAlert.description}</span>
        </div>`;
    }

    return `
    <div class="card">
        <h2><span class="dot" style="background:var(--red);"></span>OI vs PREMIUM DIVERGENCE (3-Way)</h2>

        ${trapHTML}

        <!-- Aggregate Journey -->
        <div style="font-size:0.75rem; color:var(--text2); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">
            Aggregate Journey: ${tsToDisplay(agg.anchorTs)} → ${tsToDisplay(agg.boundaryTs)}
        </div>

        <div class="stat-row">
            <div class="stat">
                <div class="label">CE OI Δ</div>
                <div class="value mono" style="color:var(--red);">${fmtLargeNum(agg.dCeOI)}</div>
            </div>
            <div class="stat">
                <div class="label">PE OI Δ</div>
                <div class="value mono" style="color:var(--green);">${fmtLargeNum(agg.dPeOI)}</div>
            </div>
            <div class="stat">
                <div class="label">CE Prm Δ</div>
                <div class="value mono" style="color:${signColor(agg.dCePrm)};">${signPrefix(agg.dCePrm, 2)} (${signPrefix(agg.cePrmPct, 1)}%)</div>
            </div>
            <div class="stat">
                <div class="label">PE Prm Δ</div>
                <div class="value mono" style="color:${signColor(agg.dPePrm)};">${signPrefix(agg.dPePrm, 2)} (${signPrefix(agg.pePrmPct, 1)}%)</div>
            </div>
            <div class="stat">
                <div class="label">OI Ratio (CE/PE)</div>
                <div class="value mono">${fmtNum(agg.oiRatio, 1)}×</div>
            </div>
        </div>

        <!-- PEff -->
        <div style="background:var(--surface2); border-radius:10px; padding:16px; margin:16px 0;">
            <div style="font-size:0.75rem; color:var(--text2); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">
                Premium Efficiency (PEff) — Aggregate
            </div>
            <div class="stat-row">
                <div class="stat" style="background:var(--bg);">
                    <div class="label">CE PEff</div>
                    <div class="value mono" style="color:${signColor(peff.cePEff)};">${signPrefix(peff.cePEff, 3)}</div>
                    <div class="delta">prm change per spot point</div>
                </div>
                <div class="stat" style="background:var(--bg);">
                    <div class="label">PE PEff</div>
                    <div class="value mono" style="color:${signColor(peff.pePEff)};">${signPrefix(peff.pePEff, 3)}</div>
                    <div class="delta">prm change per spot point</div>
                </div>
            </div>
            <div style="font-size:0.82rem; color:var(--text); margin-top:8px; line-height:1.5;">
                ${peff.interpretation}
            </div>
        </div>

        <!-- PCR Journey -->
        <div style="background:var(--surface2); border-radius:10px; padding:16px;">
            <div style="font-size:0.75rem; color:var(--text2); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">
                PCR Journey
            </div>
            <div style="display:flex; align-items:center; gap:16px;">
                <div class="mono" style="font-size:1.1rem;">${fmtNum(agg.anchorPCR, 4)}</div>
                <div style="flex:1; text-align:center;">
                    <span style="color:${signColor(agg.dPCR)}; font-size:1.3rem;">→ ${signPrefix(agg.dPCR, 1)} pcx →</span>
                </div>
                <div class="mono" style="font-size:1.1rem;">${fmtNum(agg.boundaryPCR, 4)}</div>
            </div>
        </div>
    </div>`;
}


// ─── SECTION 5: COMPOSITE VERDICT ───

function renderSection5_Verdict(verdict) {
    const { score, label, color, breakdown, keyLevels } = verdict;

    // Gauge position (score -1 to +1 mapped to 0-100%)
    const gaugePos = ((score + 1) / 2) * 100;

    // Breakdown rows
    let breakdownHTML = '';
    for (const m of breakdown) {
        const sc = m.score;
        const barWidth = Math.abs(sc) * 50; // 50% max each side
        const barLeft = sc >= 0 ? 50 : 50 - barWidth;
        const barColor = sc > 0 ? 'var(--green)' : sc < 0 ? 'var(--red)' : 'var(--text2)';

        breakdownHTML += `
        <div style="display:flex; align-items:center; gap:12px; margin:8px 0;">
            <div style="width:160px; font-size:0.8rem; color:var(--text2);">${m.name}</div>
            <div style="flex:1; height:8px; background:var(--bg); border-radius:4px; position:relative;">
                <div style="position:absolute; left:50%; top:0; bottom:0; width:1px; background:var(--border);"></div>
                <div style="position:absolute; left:${barLeft}%; width:${barWidth}%; height:100%; background:${barColor}; border-radius:4px; opacity:0.8;"></div>
            </div>
            <div class="mono" style="width:50px; text-align:right; font-size:0.8rem; color:${barColor};">${signPrefix(sc, 2)}</div>
            <div style="width:140px;">${pillHTML(m.label, sc > 0 ? 'pill-green' : sc < 0 ? 'pill-red' : 'pill-slate')}</div>
        </div>`;
    }

    // Key levels
    let levelsHTML = '';
    if (keyLevels.resistance || keyLevels.support) {
        levelsHTML = `
        <div style="display:flex; gap:16px; margin-top:16px; justify-content:center; flex-wrap:wrap;">
            ${keyLevels.resistance ? `<div class="stat" style="text-align:center; border-left:3px solid var(--red);"><div class="label">Resistance (CE BE)</div><div class="value mono">${keyLevels.resistance}</div></div>` : ''}
            ${keyLevels.support ? `<div class="stat" style="text-align:center; border-left:3px solid var(--green);"><div class="label">Support (PE BE)</div><div class="value mono">${keyLevels.support}</div></div>` : ''}
            ${keyLevels.trapPattern ? `<div class="stat" style="text-align:center; border-left:3px solid var(--orange);"><div class="label">Pattern</div><div class="value" style="font-size:0.9rem;">${keyLevels.trapPattern}</div></div>` : ''}
        </div>`;
    }

    return `
    <div class="card" style="border:2px solid ${color}40;">
        <h2><span class="dot" style="background:${color};"></span>COMPOSITE VERDICT</h2>

        <!-- Big Badge -->
        <div style="text-align:center; padding:20px;">
            <div style="font-size:2.2rem; font-weight:700; color:${color}; letter-spacing:1px;">
                ${score > 0 ? '▲' : score < 0 ? '▼' : '■'} ${label}
            </div>
            <div class="mono" style="font-size:1.4rem; color:${color}; margin-top:4px;">
                ${signPrefix(score, 2)}
            </div>
        </div>

        <!-- Score Gauge -->
        <div style="padding:0 20px; margin-bottom:20px;">
            <div style="height:14px; background:linear-gradient(90deg, var(--red) 0%, var(--red-bg) 30%, var(--surface2) 50%, var(--green-bg) 70%, var(--green) 100%); border-radius:7px; position:relative;">
                <div style="position:absolute; left:${gaugePos}%; top:-4px; width:22px; height:22px; background:${color}; border-radius:50%; transform:translateX(-50%); border:3px solid var(--bg); box-shadow:0 0 8px ${color}60;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:0.7rem; color:var(--text2);">
                <span>BEARISH (-1.0)</span>
                <span>NEUTRAL</span>
                <span>BULLISH (+1.0)</span>
            </div>
        </div>

        <!-- Module Breakdown -->
        <div style="background:var(--surface2); border-radius:10px; padding:16px; margin-top:16px;">
            <div style="font-size:0.75rem; color:var(--text2); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">
                Module Breakdown
            </div>
            ${breakdownHTML}
        </div>

        <!-- Key Levels -->
        ${levelsHTML}
    </div>`;
}
