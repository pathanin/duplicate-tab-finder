// Groups tabs by URL. For each group, keeps the active tab (else a pinned one, else the first)
// and marks the rest for closing. Pinned tabs are never closed.
const INTERNAL_URL = /^(chrome|edge|about|chrome-extension|moz-extension):/;

function findDuplicateGroups(tabs) {
    const byUrl = new Map();
    for (const tab of tabs) {
        if (!tab.url || INTERNAL_URL.test(tab.url)) continue;
        if (!byUrl.has(tab.url)) byUrl.set(tab.url, []);
        byUrl.get(tab.url).push(tab);
    }

    const groups = [];
    for (const [url, group] of byUrl) {
        if (group.length < 2) continue;
        const keep = group.find(t => t.active) || group.find(t => t.pinned) || group[0];
        const close = group.filter(t => t !== keep && !t.pinned);
        if (close.length) groups.push({ url, keep, close, size: group.length });
    }
    return groups;
}

if (typeof module !== 'undefined') module.exports = { findDuplicateGroups };
