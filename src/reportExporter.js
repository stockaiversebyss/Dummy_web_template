/**
 * ═══════════════════════════════════════════════════════════════════
 *  reportExporter.js — Report Download System for relcapa_viewer
 *  Version: 1.0 | 28-Feb-2026
 *  
 *  Features:
 *    - Per-tab Markdown report download (📥 button per tab)
 *    - "Download All" button for consolidated report
 *    - DOM text extraction for legacy tabs (no JS modification)
 *    - Native getReportData() for GamaZone tab
 *    - Pure client-side (Blob + URL.createObjectURL)
 *    - Zero external dependencies
 *  
 *  Integration: Add <script src="reportExporter.js"></script> in root HTML
 *               + call initReportExporter() after DOM ready
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════ CONFIGURATION ═══════
const REPORT_CONFIG = {
    tabs: [
        { id: 'oi',       label: 'OI Analysis',       contentId: 'oi-content',       hasNativeExport: false },
        { id: 'premium',  label: 'Premium Analysis',  contentId: 'premium-content',  hasNativeExport: false },
        { id: 'combined', label: 'Combined Verdict',  contentId: 'combined-content', hasNativeExport: false },
        { id: 'oiprm',    label: 'OI_Prm_Diversion',  contentId: 'oiprm-content',    hasNativeExport: false },
        { id: 'gamazone', label: 'GamaZone',          contentId: 'gamazone-content', hasNativeExport: true, exportFn: 'getGamaZoneReportData' }
    ],
    filePrefix: 'NIFTY_Report',
    downloadAllLabel: '📥 Download All Reports'
};

// ═══════ CORE: Download helper ═══════
function _re_downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ═══════ CORE: Generate timestamp for filenames ═══════
function _re_timestamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

// ═══════ CORE: Extract report from DOM (legacy tabs) ═══════
function _re_extractFromDOM(contentId) {
    const el = document.getElementById(contentId);
    if (!el || !el.innerHTML.trim()) return null;

    let report = '';

    // Extract stat rows
    const stats = el.querySelectorAll('.stat');
    if (stats.length > 0) {
        const statPairs = [];
        stats.forEach(s => {
            const label = s.querySelector('.label');
            const value = s.querySelector('.value');
            const delta = s.querySelector('.delta');
            if (label && value) {
                let line = `${label.textContent.trim()}: ${value.textContent.trim()}`;
                if (delta) line += ` (${delta.textContent.trim()})`;
                statPairs.push(line);
            }
        });
        if (statPairs.length > 0) {
            report += statPairs.join(' | ') + '\n\n';
        }
    }

    // Extract tables
    const tables = el.querySelectorAll('table');
    tables.forEach((table, tIdx) => {
        // Get preceding card header if exists
        const card = table.closest('.card');
        if (card) {
            const h2 = card.querySelector('h2');
            if (h2) report += `### ${h2.textContent.trim()}\n`;
        }

        const rows = table.querySelectorAll('tr');
        if (rows.length === 0) return;

        // Determine column widths
        const allCells = [];
        rows.forEach(row => {
            const cells = row.querySelectorAll('th, td');
            const rowData = [];
            cells.forEach(cell => rowData.push(cell.textContent.trim()));
            allCells.push(rowData);
        });

        if (allCells.length === 0) return;

        const maxCols = Math.max(...allCells.map(r => r.length));
        const colWidths = [];
        for (let c = 0; c < maxCols; c++) {
            colWidths.push(Math.max(...allCells.map(r => (r[c] || '').length), 3));
        }

        // Format as Markdown table
        allCells.forEach((row, rIdx) => {
            const line = row.map((cell, c) => cell.padEnd(colWidths[c] || 3)).join(' | ');
            report += `| ${line} |\n`;
            if (rIdx === 0) {
                report += '| ' + colWidths.map(w => '-'.repeat(w)).join(' | ') + ' |\n';
            }
        });
        report += '\n';
    });

    // Extract scenario badges / verdict badges
    const badges = el.querySelectorAll('.scenario-badge, [style*="border:2px"]');
    badges.forEach(b => {
        report += `> ${b.textContent.trim().replace(/\n+/g, ' | ')}\n\n`;
    });

    // Extract any remaining card text content not in tables/stats
    const cards = el.querySelectorAll('.card');
    cards.forEach(card => {
        const h2 = card.querySelector('h2');
        const hasTables = card.querySelectorAll('table').length > 0;
        const hasStats = card.querySelectorAll('.stat').length > 0;
        
        // Only extract narrative/insight divs
        const narratives = card.querySelectorAll('[style*="background:var(--surface2)"]');
        narratives.forEach(n => {
            if (n.textContent.trim().length > 20) {
                report += `> ${n.textContent.trim()}\n\n`;
            }
        });
    });

    // If nothing structured was found, fallback to plain text
    if (!report.trim()) {
        const text = el.innerText.trim();
        if (text) report = text + '\n';
    }

    return report || null;
}

// ═══════ CORE: Get report for a single tab ═══════
function _re_getTabReport(tabConfig) {
    // Try native export first
    if (tabConfig.hasNativeExport && tabConfig.exportFn && typeof window[tabConfig.exportFn] === 'function') {
        return window[tabConfig.exportFn]();
    }
    // Fallback: DOM extraction
    const content = _re_extractFromDOM(tabConfig.contentId);
    if (content) {
        return `# ${tabConfig.label}\n${content}`;
    }
    return null;
}

// ═══════ CORE: Get metadata header ═══════
function _re_getMetaHeader() {
    let meta = '';
    // Try to extract from loaded JSON data (global state)
    if (typeof json2Data !== 'undefined' && json2Data && json2Data.meta) {
        const m = json2Data.meta;
        meta += `Symbol: ${m.symbol || 'NIFTY'} | Expiry: ${m.expiry || '—'} | Date: ${m.date_pulled || '—'}\n`;
        meta += `Snapshot: ${m.timestamp || '—'} | Spot: ${m.nifty_close || '—'} | PCR: ${m.snapshot_pcr || '—'}\n`;
    }
    if (typeof json1Data !== 'undefined' && json1Data && json1Data.meta) {
        meta += `Anchor: ${json1Data.meta.timestamp || '—'} | Spot: ${json1Data.meta.nifty_close || '—'}\n`;
    }
    return meta;
}

// ═══════ PUBLIC: Download single tab report ═══════
function downloadTabReport(tabId) {
    const tabConfig = REPORT_CONFIG.tabs.find(t => t.id === tabId);
    if (!tabConfig) { console.warn('Tab not found:', tabId); return; }

    const report = _re_getTabReport(tabConfig);
    if (!report) {
        alert(`No data available for ${tabConfig.label}. Load the required JSON files first.`);
        return;
    }

    let content = `# NIFTY Analysis Report — ${tabConfig.label}\n`;
    content += `Generated: ${new Date().toLocaleString()}\n`;
    content += _re_getMetaHeader();
    content += `\n---\n\n`;
    content += report;

    const filename = `${REPORT_CONFIG.filePrefix}_${tabId}_${_re_timestamp()}.md`;
    _re_downloadFile(content, filename);
}

// ═══════ PUBLIC: Download all tabs report ═══════
function downloadAllReports() {
    let content = `# NIFTY Full Analysis Report\n`;
    content += `Generated: ${new Date().toLocaleString()}\n`;
    content += _re_getMetaHeader();
    content += `\n${'='.repeat(60)}\n\n`;

    let tabCount = 0;
    REPORT_CONFIG.tabs.forEach(tabConfig => {
        const report = _re_getTabReport(tabConfig);
        if (report) {
            content += `${'─'.repeat(60)}\n`;
            content += report;
            content += `\n`;
            tabCount++;
        }
    });

    if (tabCount === 0) {
        alert('No reports available. Load JSON files and ensure tabs have data.');
        return;
    }

    content += `${'='.repeat(60)}\n`;
    content += `End of Report — ${tabCount} tab(s) exported\n`;

    const filename = `${REPORT_CONFIG.filePrefix}_ALL_${_re_timestamp()}.md`;
    _re_downloadFile(content, filename);
}

// ═══════ UI INJECTION: Add download buttons ═══════
function initReportExporter() {
    // Wait for nav to exist
    const nav = document.getElementById('mainNav');
    if (!nav) {
        // Retry after short delay (nav might not be visible yet)
        setTimeout(initReportExporter, 500);
        return;
    }

    // Check if already initialized
    if (document.getElementById('re-download-bar')) return;

    // Create download bar (sits below nav)
    const bar = document.createElement('div');
    bar.id = 're-download-bar';
    bar.style.cssText = 'display:none;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 16px;';

    // Per-tab buttons
    REPORT_CONFIG.tabs.forEach(tab => {
        const btn = document.createElement('button');
        btn.className = 're-dl-btn';
        btn.textContent = `📥 ${tab.label}`;
        btn.title = `Download ${tab.label} report`;
        btn.onclick = () => downloadTabReport(tab.id);
        btn.style.cssText = `padding:6px 12px;border:1px solid var(--border);background:var(--surface);color:var(--text2);
            font-family:'DM Sans',sans-serif;font-size:0.72rem;font-weight:600;cursor:pointer;border-radius:6px;
            transition:all 0.2s;`;
        btn.onmouseenter = () => { btn.style.borderColor = 'var(--blue)'; btn.style.color = 'var(--text)'; };
        btn.onmouseleave = () => { btn.style.borderColor = 'var(--border)'; btn.style.color = 'var(--text2)'; };
        bar.appendChild(btn);
    });

    // Separator
    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;height:24px;background:var(--border);margin:0 4px;';
    bar.appendChild(sep);

    // Download All button
    const allBtn = document.createElement('button');
    allBtn.textContent = REPORT_CONFIG.downloadAllLabel;
    allBtn.onclick = downloadAllReports;
    allBtn.style.cssText = `padding:6px 14px;border:1px solid var(--orange);background:rgba(245,158,11,0.1);color:var(--orange);
        font-family:'DM Sans',sans-serif;font-size:0.75rem;font-weight:700;cursor:pointer;border-radius:6px;
        transition:all 0.2s;`;
    allBtn.onmouseenter = () => { allBtn.style.background = 'rgba(245,158,11,0.2)'; };
    allBtn.onmouseleave = () => { allBtn.style.background = 'rgba(245,158,11,0.1)'; };
    bar.appendChild(allBtn);

    // Insert after nav
    nav.parentNode.insertBefore(bar, nav.nextSibling);

    // Hook into nav visibility — show download bar when nav is visible
    const observer = new MutationObserver(() => {
        if (nav.style.display === 'flex') {
            bar.style.display = 'flex';
        }
    });
    observer.observe(nav, { attributes: true, attributeFilter: ['style'] });

    // Also check immediately
    if (nav.style.display === 'flex') bar.style.display = 'flex';
}

// ═══════ AUTO-INIT ═══════
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReportExporter);
} else {
    initReportExporter();
}
