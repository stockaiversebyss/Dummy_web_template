// ═══════════════════════════════════════════════════════
// premium_analysis.js — Premium Analysis Module v3.0
// Implements: PEff (Premium Efficiency), IV Behavior,
// Seller Affordability, Scenario Classification,
// ATM Premium Migration, Liquidity Harvest Detection
// Based on: OI + Premium Spread Theory v3.0 (Corrected)
// ═══════════════════════════════════════════════════════

// ═══════ PEff CALCULATION ENGINE ═══════

/**
 * Calculate Premium Efficiency over a window of CINs
 * PEff = ΔPremium / ΔSpot
 * @param {Array} logs - PRM logdata array
 * @param {number} startIdx - start index
 * @param {number} endIdx - end index
 * @returns {Object} { cePEff, pePEff, spotMove, cePrmChg, pePrmChg, prChg, pcrChg }
 */
function calcPEff(logs, startIdx, endIdx) {
    const s = logs[startIdx], e = logs[endIdx];
    const spotMove = e.nifty_close - s.nifty_close;
    const cePrmChg = e.total_ce_premium - s.total_ce_premium;
    const pePrmChg = e.total_pe_premium - s.total_pe_premium;
    const cePEff = Math.abs(spotMove) > 2 ? cePrmChg / spotMove : null;
    const pePEff = Math.abs(spotMove) > 2 ? pePrmChg / spotMove : null;
    return {
        cePEff, pePEff, spotMove, cePrmChg, pePrmChg,
        prStart: s.premium_ratio, prEnd: e.premium_ratio,
        prChg: e.premium_ratio - s.premium_ratio,
        pcrStart: s.pcr, pcrEnd: e.pcr,
        pcrChg: e.pcr - s.pcr,
        ceOI: e.sum_oiCE, peOI: e.sum_oiPE,
        ceOIchg: e.sum_oiCE - s.sum_oiCE,
        peOIchg: e.sum_oiPE - s.sum_oiPE,
        ceCOI: e.sum_CoiCE, peCOI: e.sum_CoiPE,
        spotStart: s.nifty_close, spotEnd: e.nifty_close,
        cinStart: s.cin, cinEnd: e.cin,
        tsStart: s.timestamp, tsEnd: e.timestamp
    };
}

/**
 * Classify PEff into signal band
 * Based on v3.0 theory Chapter 6 bands
 */
function classifyPEff(peff, isRising) {
    if (peff === null) return { band: 'SIDEWAYS', color: 'slate', desc: 'Spot flat — use IV only' };
    
    if (isRising) {
        // CE PEff bands on rising spot
        // PE PEff bands on rising spot (inverted — PE should fall)
        if (peff > 3.0) return { band: 'EXCESS_INFLATION', color: 'red', desc: 'Panic buying / squeeze' };
        if (peff > 1.5) return { band: 'STRONG', color: 'green', desc: 'Aggressive response to move' };
        if (peff > 0.5) return { band: 'NORMAL', color: 'green', desc: 'Expected delta behavior' };
        if (peff > 0) return { band: 'WEAK', color: 'orange', desc: 'Weak response — sellers absorbing' };
        if (peff > -0.5) return { band: 'HOLD', color: 'blue', desc: 'Premium holding despite adverse move' };
        if (peff > -1.5) return { band: 'MILD_DECAY', color: 'orange', desc: 'Mild decay — borderline' };
        if (peff > -3.0) return { band: 'NORMAL_DECAY', color: 'slate', desc: 'Normal mechanical decay' };
        return { band: 'CRUSH', color: 'red', desc: 'Excess decay — IV collapse / distribution' };
    } else {
        // Mirror for falling spot
        if (peff < -3.0) return { band: 'EXCESS_INFLATION', color: 'red', desc: 'Panic buying / squeeze' };
        if (peff < -1.5) return { band: 'STRONG', color: 'green', desc: 'Aggressive response to move' };
        if (peff < -0.5) return { band: 'NORMAL', color: 'green', desc: 'Expected delta behavior' };
        if (peff < 0) return { band: 'WEAK', color: 'orange', desc: 'Weak response — sellers absorbing' };
        if (peff < 0.5) return { band: 'HOLD', color: 'blue', desc: 'Premium holding despite adverse move' };
        if (peff < 1.5) return { band: 'MILD_DECAY', color: 'orange', desc: 'Mild decay — borderline' };
        if (peff < 3.0) return { band: 'NORMAL_DECAY', color: 'slate', desc: 'Normal mechanical decay' };
        return { band: 'CRUSH', color: 'red', desc: 'Excess decay — IV collapse / distribution' };
    }
}

/**
 * Classify scenario based on PEff + OI behavior
 * Returns: { scenario, bias, confidence, action, color }
 */
function classifyScenario(phase) {
    const { cePEff, pePEff, spotMove, ceOIchg, peOIchg } = phase;
    const isRising = spotMove > 5;
    const isFalling = spotMove < -5;
    const isFlat = !isRising && !isFalling;

    if (isFlat) {
        return { scenario: 'SIDEWAYS / THETA FARM', bias: 'NEUTRAL', confidence: 'N/A',
            action: 'No PEff signal — check IV decay rate', color: 'orange' };
    }

    if (isRising) {
        // PE behavior on rise is the key
        if (pePEff !== null && pePEff > -0.5) {
            // PE holding or rising on price rise = GENUINE SUPPORT
            if (peOIchg > 0) {
                return { scenario: 'PE SHORT + GENUINE SUPPORT', bias: 'BULLISH', confidence: 'HIGH',
                    action: 'Buy dips to PE wall — support is real', color: 'green' };
            } else {
                return { scenario: 'PE COVERING (not fresh support)', bias: 'MILD BULLISH', confidence: 'MEDIUM',
                    action: 'Cautious long — PE exiting, not fresh conviction', color: 'cyan' };
            }
        }
        if (pePEff !== null && pePEff < -3.0) {
            // PE crushing on rise = DISTRIBUTION
            if (peOIchg > 0) {
                return { scenario: 'PE SHORT + DISTRIBUTION TRAP', bias: 'BEARISH', confidence: 'HIGH',
                    action: 'DO NOT buy dip — PE wall is fake. Wait for break.', color: 'red' };
            } else {
                return { scenario: 'PE LIQUIDATION', bias: 'BEARISH', confidence: 'HIGH',
                    action: 'PE sellers exiting + premium crushing = downside ahead', color: 'red' };
            }
        }
        // CE behavior on rise
        if (cePEff !== null && cePEff < 0) {
            return { scenario: 'CE CRUSH ON RISE = DISTRIBUTION OVERHEAD', bias: 'BEARISH', confidence: 'MEDIUM',
                action: 'CE melting despite rise — institutions selling CE into rally', color: 'orange' };
        }
        // Normal range
        return { scenario: 'NORMAL MECHANICAL MOVE', bias: 'FOLLOW TREND', confidence: 'LOW',
            action: 'PEff in normal range — no special institutional signal', color: 'slate' };
    }

    if (isFalling) {
        // CE behavior on fall is the key
        if (cePEff !== null && cePEff > -0.5) {
            // CE holding on fall = GENUINE RESISTANCE
            if (ceOIchg > 0) {
                return { scenario: 'CE SHORT + GENUINE RESISTANCE', bias: 'BEARISH', confidence: 'HIGH',
                    action: 'Short rallies to CE wall — resistance is real', color: 'red' };
            } else {
                return { scenario: 'CE COVERING (not fresh resistance)', bias: 'MILD BEARISH', confidence: 'MEDIUM',
                    action: 'Cautious short — CE exiting, not fresh conviction', color: 'orange' };
            }
        }
        if (cePEff !== null && cePEff < -3.0) {
            // CE crushing on fall = ACCUMULATION
            if (ceOIchg > 0) {
                return { scenario: 'CE SHORT + BULLISH ACCUMULATION', bias: 'BULLISH', confidence: 'HIGH',
                    action: 'DO NOT short — CE wall is fake. Institutions accumulating.', color: 'green' };
            } else {
                return { scenario: 'CE LIQUIDATION', bias: 'BULLISH', confidence: 'MEDIUM',
                    action: 'CE unwinding on fall = upside pressure building', color: 'green' };
            }
        }
        // PE behavior on fall
        if (pePEff !== null && pePEff < 0) {
            return { scenario: 'PE CRUSH ON FALL = FAKE SUPPORT', bias: 'BEARISH', confidence: 'MEDIUM',
                action: 'PE premium not rising on fall — no genuine buying below', color: 'red' };
        }
        return { scenario: 'NORMAL MECHANICAL MOVE', bias: 'FOLLOW TREND', confidence: 'LOW',
            action: 'PEff in normal range — no special institutional signal', color: 'slate' };
    }
}

/**
 * Seller Affordability Map
 * Uses premium data from OI JSON (per-strike)
 */
function calcSellerAffordability(oiJson) {
    if (!oiJson) return { ce: [], pe: [] };
    const spot = oiJson.meta?.nifty_close || 0;
    const ce = [], pe = [];

    for (const [k, v] of Object.entries(oiJson.per_strike || {})) {
        const strike = Number(k);
        const ceData = v.CEdata || {};
        const peData = v.PEdata || {};
        
        // CE sellers: only above spot (OTM CEs with significant OI)
        if (strike >= spot && ceData.total_oi_normalized > 500 && ceData.premium > 5) {
            const be = strike + ceData.premium;
            const buffer = be - spot;
            ce.push({ strike, premium: ceData.premium, breakeven: be, buffer: buffer.toFixed(0),
                oi: ceData.total_oi_normalized, coi: ceData.change_in_oi_normalized });
        }
        // PE sellers: only below spot (OTM PEs with significant OI)
        if (strike <= spot && peData.total_oi_normalized > 500 && peData.premium > 5) {
            const be = strike - peData.premium;
            const buffer = spot - be;
            pe.push({ strike, premium: peData.premium, breakeven: be, buffer: buffer.toFixed(0),
                oi: peData.total_oi_normalized, coi: peData.change_in_oi_normalized });
        }
    }

    ce.sort((a, b) => a.strike - b.strike);
    pe.sort((a, b) => b.strike - a.strike);
    return { ce: ce.slice(0, 6), pe: pe.slice(0, 6), spot };
}

/**
 * ATM Premium Migration Analysis
 * Tracks how ATM premium changes as ATM strike shifts
 */
function calcATMPremiumMigration(oiJson) {
    if (!oiJson) return null;
    const spot = oiJson.meta?.nifty_close || 0;
    const atmStrike = Math.round(spot / 50) * 50;
    const strikes = [atmStrike - 100, atmStrike - 50, atmStrike, atmStrike + 50, atmStrike + 100];
    
    const result = strikes.map(s => {
        const data = oiJson.per_strike?.[String(s)];
        if (!data) return null;
        const ce = data.CEdata || {};
        const pe = data.PEdata || {};
        return {
            strike: s, dist: s - spot,
            cePrm: ce.premium || 0, pePrm: pe.premium || 0,
            ceOI: ce.total_oi_normalized || 0, peOI: pe.total_oi_normalized || 0,
            ceCOI: ce.change_in_oi_normalized || 0, peCOI: pe.change_in_oi_normalized || 0,
            straddle: (ce.premium || 0) + (pe.premium || 0)
        };
    }).filter(Boolean);
    
    return { spot, atmStrike, strikes: result };
}

/**
 * Detect Liquidity Harvest Pattern
 * CE OI rising + CE premium inflated at support = retail buying bounce from SM sellers
 */
function detectLiquidityHarvest(oiJson, prmData) {
    if (!oiJson || !prmData) return null;
    const spot = oiJson.meta?.nifty_close || 0;
    const logs = prmData.data?.logdata || [];
    if (logs.length < 5) return null;

    // Get current PR and PCR
    const latest = logs[logs.length - 1];
    const cin5 = logs[Math.min(4, logs.length - 1)];
    
    // Check PE wall zones (below spot)
    const peWalls = [];
    for (const [k, v] of Object.entries(oiJson.per_strike || {})) {
        const s = Number(k);
        if (s < spot && s > spot - 300) {
            const peNorm = v.PEdata?.total_oi_normalized || 0;
            const peCOI = v.PEdata?.change_in_oi_normalized || 0;
            if (peNorm > 1000) peWalls.push({ strike: s, peNorm, peCOI });
        }
    }

    // Check CE activity at/near support levels
    const ceBuildAtSupport = [];
    for (const pw of peWalls) {
        const ceAtStrike = oiJson.per_strike?.[String(pw.strike)]?.CEdata;
        if (ceAtStrike && ceAtStrike.change_in_oi_normalized > 200) {
            ceBuildAtSupport.push({
                strike: pw.strike,
                peWall: pw.peNorm,
                ceCOI: ceAtStrike.change_in_oi_normalized,
                cePrm: ceAtStrike.premium,
                signal: 'LIQUIDITY HARVEST — retail buying CE at SM\'s PE wall'
            });
        }
    }

    return {
        detected: ceBuildAtSupport.length > 0,
        zones: ceBuildAtSupport,
        pr: latest?.premium_ratio,
        pcr: latest?.pcr
    };
}

// ═══════ PHASE SPLITTER ═══════
function splitIntoPhases(logs, numPhases = 4) {
    const size = Math.floor(logs.length / numPhases);
    const phases = [];
    const labels = ['Phase 1: OPEN', 'Phase 2: MID-AM', 'Phase 3: AFTERNOON', 'Phase 4: CLOSE'];
    if (numPhases === 5) labels.push('Phase 5: LATE');
    
    for (let i = 0; i < numPhases; i++) {
        const start = i * size;
        const end = i === numPhases - 1 ? logs.length - 1 : (i + 1) * size - 1;
        const peff = calcPEff(logs, start, end);
        const scenario = classifyScenario(peff);
        phases.push({ ...peff, label: labels[i] || `Phase ${i+1}`, scenario });
    }
    return phases;
}

// ═══════ ROLLING PEff ═══════
function rollingPEff(logs, windowCINs = 15) {
    const results = [];
    for (let i = 0; i < logs.length - windowCINs; i += windowCINs) {
        const peff = calcPEff(logs, i, i + windowCINs);
        const isRising = peff.spotMove > 5;
        const isFalling = peff.spotMove < -5;
        const ceBand = classifyPEff(peff.cePEff, isRising);
        const peBand = classifyPEff(peff.pePEff, isRising);
        results.push({ ...peff, ceBand, peBand });
    }
    return results;
}

// ═══════ CHART INSTANCES ═══════
let prmLineChart = null, peffBarChart = null, affordChart = null;

// ═══════ RENDER PREMIUM TAB ═══════
function renderPremiumTab(prmJson, oiJson) {
    const container = document.getElementById('premium-content');
    const logs = prmJson.data?.logdata || [];
    if (logs.length < 10) { container.innerHTML = '<div class="card"><p>Insufficient PRM data (need 10+ CINs)</p></div>'; return; }

    const first = logs[0], last = logs[logs.length - 1];
    const phases = splitIntoPhases(logs, 4);
    const rolling = rollingPEff(logs, 15);
    const afford = calcSellerAffordability(oiJson);
    const atm = calcATMPremiumMigration(oiJson);
    const harvest = detectLiquidityHarvest(oiJson, prmJson);

    let html = '';

    // ── Session Summary ──
    html += `<div class="stat-row">
        <div class="stat"><div class="label">Spot</div><div class="value" style="color:var(--cyan)">${first.nifty_close} → ${last.nifty_close}</div>
            <div class="delta mono" style="color:${last.nifty_close >= first.nifty_close ? 'var(--green)' : 'var(--red)'}">${(last.nifty_close - first.nifty_close) > 0 ? '+' : ''}${(last.nifty_close - first.nifty_close).toFixed(1)}pts</div></div>
        <div class="stat"><div class="label">Premium Ratio</div><div class="value">${first.premium_ratio.toFixed(4)} → ${last.premium_ratio.toFixed(4)}</div>
            <div class="delta mono" style="color:${last.premium_ratio > first.premium_ratio ? 'var(--red)' : 'var(--green)'}">${(last.premium_ratio - first.premium_ratio) > 0 ? '+' : ''}${(last.premium_ratio - first.premium_ratio).toFixed(4)}</div></div>
        <div class="stat"><div class="label">PCR</div><div class="value">${first.pcr.toFixed(4)} → ${last.pcr.toFixed(4)}</div>
            <div class="delta mono" style="color:${last.pcr > first.pcr ? 'var(--green)' : 'var(--red)'}">${(last.pcr - first.pcr) > 0 ? '+' : ''}${(last.pcr - first.pcr).toFixed(4)}</div></div>
        <div class="stat"><div class="label">CE Premium</div><div class="value">${first.total_ce_premium.toFixed(1)} → ${last.total_ce_premium.toFixed(1)}</div>
            <div class="delta mono">${(last.total_ce_premium - first.total_ce_premium).toFixed(1)} (${((last.total_ce_premium - first.total_ce_premium)/first.total_ce_premium*100).toFixed(1)}%)</div></div>
        <div class="stat"><div class="label">PE Premium</div><div class="value">${first.total_pe_premium.toFixed(1)} → ${last.total_pe_premium.toFixed(1)}</div>
            <div class="delta mono">${(last.total_pe_premium - first.total_pe_premium).toFixed(1)} (${((last.total_pe_premium - first.total_pe_premium)/first.total_pe_premium*100).toFixed(1)}%)</div></div>
    </div>`;

    // ── Premium + Spot Line Chart ──
    html += `<div class="card"><h2><span class="dot" style="background:var(--purple)"></span>Premium Ratio + Spot Journey</h2>
        <div class="chart-wrap" style="height:300px"><canvas id="c_prm_line"></canvas></div></div>`;

    // ── Phase-by-Phase PEff Analysis ──
    html += `<div class="card"><h2><span class="dot" style="background:var(--blue)"></span>Phase-by-Phase PEff Analysis (v3.0)</h2>
        <table><thead><tr><th>Phase</th><th>Spot Move</th><th>CE PEff</th><th>PE PEff</th><th>PR Δ</th><th>CE OI Δ</th><th>PE OI Δ</th><th>Scenario</th></tr></thead><tbody>`;
    
    for (const ph of phases) {
        const sc = ph.scenario;
        const pillClass = `pill-${sc.color}`;
        html += `<tr>
            <td style="text-align:left;font-weight:600">${ph.label}<br><span class="mono" style="font-size:0.7rem;color:var(--text2)">CIN ${ph.cinStart}-${ph.cinEnd}</span></td>
            <td class="mono" style="color:${ph.spotMove > 5 ? 'var(--green)' : ph.spotMove < -5 ? 'var(--red)' : 'var(--text2)'}">${ph.spotMove > 0 ? '+' : ''}${ph.spotMove.toFixed(1)}</td>
            <td class="mono" style="font-weight:600">${ph.cePEff !== null ? (ph.cePEff > 0 ? '+' : '') + ph.cePEff.toFixed(2) : 'FLAT'}</td>
            <td class="mono" style="font-weight:600">${ph.pePEff !== null ? (ph.pePEff > 0 ? '+' : '') + ph.pePEff.toFixed(2) : 'FLAT'}</td>
            <td class="mono">${ph.prChg > 0 ? '+' : ''}${ph.prChg.toFixed(4)}</td>
            <td class="mono">${(ph.ceOIchg/1e5).toFixed(0)}L</td>
            <td class="mono">${(ph.peOIchg/1e5).toFixed(0)}L</td>
            <td><span class="pill ${pillClass}" style="font-size:0.7rem">${sc.bias}</span><br><span style="font-size:0.7rem;color:var(--text2)">${sc.scenario}</span></td>
        </tr>`;
    }
    html += `</tbody></table></div>`;

    // ── Rolling PEff Chart ──
    html += `<div class="card"><h2><span class="dot" style="background:var(--orange)"></span>Rolling PEff (30-min windows)</h2>
        <div class="chart-wrap" style="height:300px"><canvas id="c_peff_bar"></canvas></div></div>`;

    // ── Seller Affordability ──
    if (afford.ce.length || afford.pe.length) {
        html += `<div class="card"><h2><span class="dot" style="background:var(--cyan)"></span>Seller Affordability Map (from OI JSON)</h2>
            <p style="color:var(--text2);font-size:0.85rem;margin-bottom:12px">Spot: ${afford.spot} | Shows how much adverse move each seller can absorb</p>
            <div class="grid-2">
                <div><h3 style="color:var(--green);margin-bottom:8px">CE Sellers (Above Spot)</h3>
                    <table><thead><tr><th>Strike</th><th>Premium</th><th>Breakeven</th><th>Buffer</th><th>OI (Norm)</th></tr></thead><tbody>
                    ${afford.ce.map(r => `<tr><td class="mono">${r.strike}</td><td class="mono">₹${r.premium.toFixed(1)}</td>
                        <td class="mono">${r.breakeven.toFixed(0)}</td><td class="mono" style="color:var(--green)">${r.buffer}pts</td>
                        <td class="mono">${r.oi.toFixed(0)}</td></tr>`).join('')}
                    </tbody></table>
                </div>
                <div><h3 style="color:var(--red);margin-bottom:8px">PE Sellers (Below Spot)</h3>
                    <table><thead><tr><th>Strike</th><th>Premium</th><th>Breakeven</th><th>Buffer</th><th>OI (Norm)</th></tr></thead><tbody>
                    ${afford.pe.map(r => `<tr><td class="mono">${r.strike}</td><td class="mono">₹${r.premium.toFixed(1)}</td>
                        <td class="mono">${r.breakeven.toFixed(0)}</td><td class="mono" style="color:var(--red)">${r.buffer}pts</td>
                        <td class="mono">${r.oi.toFixed(0)}</td></tr>`).join('')}
                    </tbody></table>
                </div>
            </div>`;
        
        // Asymmetry check
        const avgCEbuffer = afford.ce.length ? afford.ce.reduce((a,b) => a + parseFloat(b.buffer), 0) / afford.ce.length : 0;
        const avgPEbuffer = afford.pe.length ? afford.pe.reduce((a,b) => a + parseFloat(b.buffer), 0) / afford.pe.length : 0;
        const asymmetry = avgCEbuffer - avgPEbuffer;
        html += `<div style="margin-top:12px;padding:12px;border-radius:8px;background:${asymmetry > 50 ? 'var(--red-bg)' : asymmetry < -50 ? 'var(--green-bg)' : 'var(--orange-bg)'}">
            <span style="font-weight:600">Affordability Asymmetry:</span> CE avg buffer: ${avgCEbuffer.toFixed(0)}pts | PE avg buffer: ${avgPEbuffer.toFixed(0)}pts | 
            <span style="font-weight:700;color:${asymmetry > 50 ? 'var(--red)' : asymmetry < -50 ? 'var(--green)' : 'var(--orange)'}">
            ${asymmetry > 50 ? '↓ BEARISH — PE sellers have LESS cushion' : asymmetry < -50 ? '↑ BULLISH — CE sellers have LESS cushion' : '≈ BALANCED — symmetric affordability'}</span>
        </div></div>`;
    }

    // ── ATM Premium Migration ──
    if (atm && atm.strikes.length) {
        html += `<div class="card"><h2><span class="dot" style="background:var(--purple)"></span>ATM Premium Migration</h2>
            <p style="color:var(--text2);font-size:0.85rem;margin-bottom:12px">ATM: ${atm.atmStrike} | Spot: ${atm.spot.toFixed(1)}</p>
            <table><thead><tr><th>Strike</th><th>Distance</th><th>CE Prm</th><th>PE Prm</th><th>Straddle</th><th>CE OI</th><th>PE OI</th><th>CE COI</th><th>PE COI</th></tr></thead><tbody>
            ${atm.strikes.map(s => {
                const isATM = s.strike === atm.atmStrike;
                return `<tr style="${isATM ? 'background:var(--blue-bg)' : ''}">
                    <td class="mono" style="${isATM ? 'font-weight:700;color:var(--blue)' : ''}">${s.strike}${isATM ? ' (ATM)' : ''}</td>
                    <td class="mono">${s.dist > 0 ? '+' : ''}${s.dist.toFixed(0)}</td>
                    <td class="mono" style="color:var(--green)">₹${s.cePrm.toFixed(1)}</td>
                    <td class="mono" style="color:var(--red)">₹${s.pePrm.toFixed(1)}</td>
                    <td class="mono" style="font-weight:600">₹${s.straddle.toFixed(1)}</td>
                    <td class="mono">${s.ceOI.toFixed(0)}</td>
                    <td class="mono">${s.peOI.toFixed(0)}</td>
                    <td class="mono" style="color:${s.ceCOI > 0 ? 'var(--green)' : 'var(--red)'}">${s.ceCOI.toFixed(0)}</td>
                    <td class="mono" style="color:${s.peCOI > 0 ? 'var(--green)' : 'var(--red)'}">${s.peCOI.toFixed(0)}</td>
                </tr>`;
            }).join('')}
            </tbody></table></div>`;
    }

    // ── Liquidity Harvest Detection ──
    if (harvest && harvest.detected) {
        html += `<div class="card" style="border-color:var(--red)"><h2><span class="dot" style="background:var(--red)"></span>⚠ LIQUIDITY HARVEST DETECTED</h2>
            <p style="color:var(--red);font-weight:600;margin-bottom:12px">Retail buying CE at SM's PE wall — classic trap pattern</p>
            <table><thead><tr><th>Strike (PE Wall)</th><th>PE Wall Size</th><th>CE Fresh COI</th><th>CE Premium</th><th>Signal</th></tr></thead><tbody>
            ${harvest.zones.map(z => `<tr>
                <td class="mono" style="font-weight:700">${z.strike}</td>
                <td class="mono">${z.peWall.toFixed(0)}</td>
                <td class="mono" style="color:var(--green)">${z.ceCOI.toFixed(0)}</td>
                <td class="mono">₹${z.cePrm.toFixed(1)}</td>
                <td style="font-size:0.8rem;color:var(--red)">${z.signal}</td>
            </tr>`).join('')}
            </tbody></table>
            <div style="margin-top:12px;padding:12px;border-radius:8px;background:var(--red-bg);color:var(--red)">
                <strong>Interpretation:</strong> SM selling CEs to retail at inflated premiums. Retail thinks support will hold. SM will break the PE wall after harvesting CE premium. PE wall = bait, CE sales = harvest, break = kill.
            </div>
        </div>`;
    }

    container.innerHTML = html;

    // ── Render Charts ──
    const chartOpts = { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8b90a5', font: { family: 'DM Sans', size: 11 } } } },
        scales: { x: { ticks: { color: '#8b90a5', font: { size: 9 } }, grid: { color: '#2e3347' } },
                  y: { ticks: { color: '#8b90a5' }, grid: { color: '#2e3347' } } } };

    // Premium + Spot Line
    if (prmLineChart) prmLineChart.destroy();
    const cinLabels = logs.map(l => l.timestamp);
    prmLineChart = new Chart(document.getElementById('c_prm_line'), { type: 'line', data: {
        labels: cinLabels,
        datasets: [
            { label: 'Premium Ratio', data: logs.map(l => l.premium_ratio), borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.1)', fill: true, yAxisID: 'y', tension: 0.3, pointRadius: 0 },
            { label: 'Spot', data: logs.map(l => l.nifty_close), borderColor: '#06b6d4', backgroundColor: 'transparent', yAxisID: 'y1', tension: 0.3, pointRadius: 0, borderWidth: 2 },
            { label: 'PCR', data: logs.map(l => l.pcr), borderColor: '#f59e0b', backgroundColor: 'transparent', yAxisID: 'y', tension: 0.3, pointRadius: 0, borderDash: [5,5], borderWidth: 1 }
        ] }, options: { ...chartOpts, scales: {
            ...chartOpts.scales,
            y: { ...chartOpts.scales.y, position: 'left', title: { display: true, text: 'PR / PCR', color: '#8b90a5' } },
            y1: { position: 'right', ticks: { color: '#06b6d4' }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Spot', color: '#06b6d4' } }
        } } });

    // PEff Bar Chart
    if (peffBarChart) peffBarChart.destroy();
    peffBarChart = new Chart(document.getElementById('c_peff_bar'), { type: 'bar', data: {
        labels: rolling.map(r => `${r.tsStart}-${r.tsEnd}`),
        datasets: [
            { label: 'CE PEff', data: rolling.map(r => r.cePEff), backgroundColor: rolling.map(r => r.cePEff !== null ? (r.cePEff > 0 ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)') : 'rgba(148,163,184,0.3)'), borderWidth: 0 },
            { label: 'PE PEff', data: rolling.map(r => r.pePEff), backgroundColor: rolling.map(r => r.pePEff !== null ? (r.pePEff > 0 ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)') : 'rgba(148,163,184,0.2)'), borderWidth: 0 }
        ] }, options: { ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y,
            title: { display: true, text: 'PEff (premium pts per spot pt)', color: '#8b90a5' } } } } });
}

// ═══════ RENDER COMBINED VERDICT TAB ═══════
function renderCombinedTab(j1, j2, prmJson) {
    const container = document.getElementById('combined-content');
    const logs = prmJson.data?.logdata || [];
    if (logs.length < 10) { container.innerHTML = '<div class="card"><p>Need PRM data</p></div>'; return; }

    const phases = splitIntoPhases(logs, 4);
    const afford = calcSellerAffordability(j2);
    const harvest = detectLiquidityHarvest(j2, prmJson);
    const last = logs[logs.length - 1];
    const first = logs[0];

    // Score the session
    let bullScore = 0, bearScore = 0;
    for (const ph of phases) {
        if (ph.scenario.bias.includes('BULLISH')) bullScore += ph.scenario.confidence === 'HIGH' ? 3 : ph.scenario.confidence === 'MEDIUM' ? 2 : 1;
        if (ph.scenario.bias.includes('BEARISH')) bearScore += ph.scenario.confidence === 'HIGH' ? 3 : ph.scenario.confidence === 'MEDIUM' ? 2 : 1;
    }

    // PR trend
    if (last.premium_ratio > 1.5) bearScore += 2;
    else if (last.premium_ratio < 0.8) bullScore += 2;

    // PCR trend
    if (last.pcr > 0.7) bullScore += 1;
    if (last.pcr < 0.5) bearScore += 1;

    // Affordability
    const avgCEbuf = afford.ce.length ? afford.ce.reduce((a,b) => a + parseFloat(b.buffer), 0) / afford.ce.length : 0;
    const avgPEbuf = afford.pe.length ? afford.pe.reduce((a,b) => a + parseFloat(b.buffer), 0) / afford.pe.length : 0;
    if (avgCEbuf - avgPEbuf > 50) bearScore += 1;
    if (avgPEbuf - avgCEbuf > 50) bullScore += 1;

    // Harvest
    if (harvest?.detected) bearScore += 2;

    const totalScore = bullScore - bearScore;
    let verdict, verdictColor, verdictBg;
    if (totalScore >= 4) { verdict = 'STRONGLY BULLISH'; verdictColor = '#22c55e'; verdictBg = 'var(--green-bg)'; }
    else if (totalScore >= 2) { verdict = 'BULLISH'; verdictColor = '#22c55e'; verdictBg = 'var(--green-bg)'; }
    else if (totalScore >= 1) { verdict = 'MILD BULLISH'; verdictColor = '#06b6d4'; verdictBg = 'var(--cyan-bg)'; }
    else if (totalScore >= -1) { verdict = 'NEUTRAL / RANGE'; verdictColor = '#f59e0b'; verdictBg = 'var(--orange-bg)'; }
    else if (totalScore >= -3) { verdict = 'BEARISH'; verdictColor = '#ef4444'; verdictBg = 'var(--red-bg)'; }
    else { verdict = 'STRONGLY BEARISH'; verdictColor = '#ef4444'; verdictBg = 'var(--red-bg)'; }

    let html = '';

    // Verdict banner
    html += `<div class="scenario-badge" style="background:${verdictBg};color:${verdictColor};font-size:1.4rem;border:2px solid ${verdictColor}">
        ${verdict}<br><span style="font-size:0.85rem;font-weight:400">Bull Score: ${bullScore} | Bear Score: ${bearScore} | Net: ${totalScore > 0 ? '+' : ''}${totalScore}</span>
    </div>`;

    // Score breakdown
    html += `<div class="card"><h2><span class="dot" style="background:${verdictColor}"></span>Score Breakdown</h2>
        <table><thead><tr><th>Factor</th><th>Bull</th><th>Bear</th><th>Source</th></tr></thead><tbody>`;
    
    for (const ph of phases) {
        const isBull = ph.scenario.bias.includes('BULLISH');
        const isBear = ph.scenario.bias.includes('BEARISH');
        const pts = ph.scenario.confidence === 'HIGH' ? 3 : ph.scenario.confidence === 'MEDIUM' ? 2 : 1;
        html += `<tr><td style="text-align:left">${ph.label}: ${ph.scenario.scenario}</td>
            <td class="mono" style="color:var(--green)">${isBull ? '+' + pts : '—'}</td>
            <td class="mono" style="color:var(--red)">${isBear ? '+' + pts : '—'}</td>
            <td>PEff: CE ${ph.cePEff !== null ? ph.cePEff.toFixed(2) : 'flat'} / PE ${ph.pePEff !== null ? ph.pePEff.toFixed(2) : 'flat'}</td></tr>`;
    }
    
    html += `<tr><td style="text-align:left">Premium Ratio: ${last.premium_ratio.toFixed(3)}</td>
        <td class="mono" style="color:var(--green)">${last.premium_ratio < 0.8 ? '+2' : '—'}</td>
        <td class="mono" style="color:var(--red)">${last.premium_ratio > 1.5 ? '+2' : '—'}</td>
        <td>PR ${last.premium_ratio > 1.5 ? '> 1.5 = bearish' : last.premium_ratio < 0.8 ? '< 0.8 = bullish' : 'neutral'}</td></tr>`;
    html += `<tr><td style="text-align:left">PCR: ${last.pcr.toFixed(3)}</td>
        <td class="mono" style="color:var(--green)">${last.pcr > 0.7 ? '+1' : '—'}</td>
        <td class="mono" style="color:var(--red)">${last.pcr < 0.5 ? '+1' : '—'}</td>
        <td>PCR ${last.pcr > 0.7 ? '> 0.7 = PE dominant' : last.pcr < 0.5 ? '< 0.5 = CE dominant' : 'balanced'}</td></tr>`;
    html += `<tr><td style="text-align:left">Seller Affordability Asymmetry</td>
        <td class="mono" style="color:var(--green)">${avgPEbuf - avgCEbuf > 50 ? '+1' : '—'}</td>
        <td class="mono" style="color:var(--red)">${avgCEbuf - avgPEbuf > 50 ? '+1' : '—'}</td>
        <td>CE buf: ${avgCEbuf.toFixed(0)}pts | PE buf: ${avgPEbuf.toFixed(0)}pts</td></tr>`;
    if (harvest?.detected) {
        html += `<tr style="background:var(--red-bg)"><td style="text-align:left;color:var(--red)">⚠ Liquidity Harvest Detected</td>
            <td>—</td><td class="mono" style="color:var(--red)">+2</td>
            <td style="color:var(--red)">${harvest.zones.length} zone(s) — retail buying CE at PE wall</td></tr>`;
    }
    html += `<tr style="background:var(--surface2);font-weight:700"><td style="text-align:left">TOTAL</td>
        <td class="mono" style="color:var(--green)">${bullScore}</td>
        <td class="mono" style="color:var(--red)">${bearScore}</td>
        <td style="color:${verdictColor}">${verdict}</td></tr>`;
    html += `</tbody></table></div>`;

    // Action recommendations
    html += `<div class="card"><h2><span class="dot" style="background:var(--orange)"></span>Trade Recommendations</h2>`;
    for (const ph of phases) {
        if (ph.scenario.confidence !== 'LOW' && ph.scenario.bias !== 'NEUTRAL') {
            html += `<div style="padding:8px 12px;margin:4px 0;border-radius:8px;background:var(--surface2)">
                <span class="pill pill-${ph.scenario.color}">${ph.scenario.bias}</span>
                <span style="margin-left:8px;font-size:0.85rem">${ph.label}: ${ph.scenario.action}</span>
            </div>`;
        }
    }
    html += `</div>`;

    container.innerHTML = html;
}
