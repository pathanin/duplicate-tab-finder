// Groups tabs by URL. For each group, keeps the active tab (else a pinned one, else the first)
// and marks the rest for closing. Pinned tabs are never closed.
const INTERNAL_URL = /^(chrome|edge|about|chrome-extension|moz-extension):/;
const TRACKING_PARAM = /^(utm_.*|fbclid|gclid)$/i;

// Returns the key used to decide whether two URLs are duplicates.
function normalizeUrl(url, { ignoreHash = false, ignoreTracking = false } = {}) {
    if (!ignoreHash && !ignoreTracking) return url;
    let u;
    try { u = new URL(url); } catch { return url; }
    if (ignoreHash) u.hash = '';
    if (ignoreTracking) {
        for (const key of [...u.searchParams.keys()]) {
            if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
        }
        if (!u.searchParams.size) u.search = '';
    }
    return u.href;
}

// Splits a URL into [{ text, ignored }] segments marking what normalizeUrl would drop.
// Works on the raw string so the segments always rejoin to the exact original.
function splitUrl(url, { ignoreHash = false, ignoreTracking = false } = {}) {
    const segs = [];
    const push = (text, ignored) => {
        if (!text) return;
        const last = segs[segs.length - 1];
        if (last && last.ignored === ignored) last.text += text;
        else segs.push({ text, ignored });
    };

    const hashAt = url.indexOf('#');
    const base = hashAt < 0 ? url : url.slice(0, hashAt);
    const queryAt = base.indexOf('?');

    if (queryAt < 0) {
        push(base, false);
    } else {
        const tokens = base.slice(queryAt + 1).split('&');
        const isTracking = tok => ignoreTracking && TRACKING_PARAM.test(tok.split('=')[0]);
        push(base.slice(0, queryAt), false);
        push('?', tokens.every(isTracking));
        let keptBefore = false;
        tokens.forEach((tok, i) => {
            const sep = i < tokens.length - 1 ? '&' : '';
            if (isTracking(tok)) {
                // Take the separator on whichever side keeps the remaining URL readable.
                push(keptBefore ? '&' + tok : tok + sep, true);
            } else {
                push(keptBefore ? '&' + tok : tok, false);
                keptBefore = true;
            }
        });
    }
    if (hashAt >= 0) push(url.slice(hashAt), ignoreHash);
    return segs;
}

function findDuplicateGroups(tabs, options) {
    const byUrl = new Map();
    for (const tab of tabs) {
        if (!tab.url || INTERNAL_URL.test(tab.url)) continue;
        const key = normalizeUrl(tab.url, options);
        if (!byUrl.has(key)) byUrl.set(key, []);
        byUrl.get(key).push(tab);
    }

    const groups = [];
    for (const [url, group] of byUrl) {
        if (group.length < 2) continue;
        const keep = group.find(t => t.active) || group.find(t => t.pinned) || group[0];
        const close = group.filter(t => t !== keep && !t.pinned);
        if (close.length) groups.push({ url, keep, close, tabs: group, size: group.length });
    }
    return groups;
}

if (typeof module !== 'undefined') module.exports = { findDuplicateGroups, normalizeUrl, splitUrl };
