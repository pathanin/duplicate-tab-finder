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

if (typeof module !== 'undefined') module.exports = { findDuplicateGroups, normalizeUrl };
