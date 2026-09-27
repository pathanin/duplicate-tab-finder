// Groups tabs by URL. For each group, keeps the active tab (else a pinned one, else the first)
// and marks the rest for closing. Pinned tabs are never closed.
const INTERNAL_URL = /^(chrome|edge|about|chrome-extension|moz-extension):/;
// Params that never change the page: ad click IDs, email/analytics campaign tags, social share tags.
const TRACKING_PARAM = new RegExp('^(' + [
    'utm_.*', 'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'gad_source', '_gl', 'msclkid',
    'twclid', 'ttclid', 'li_fat_id', 'yclid', 'rdt_cid', 'igshid', 'igsh',
    'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'mkt_tok', 'oly_enc_id', 'oly_anon_id', 'vero_id',
    'pk_.*', 'mtm_.*', 's_cid',
].join('|') + ')$', 'i');
// Params that are junk only on specific sites (optionally a path), since the same names mean real things elsewhere.
const SITE_PARAMS = [
    [/(^|\.)(youtube\.com|youtu\.be)$/i, /^(t|si)$/],                       // timestamp, share tag
    [/(^|\.)spotify\.com$/i, /^si$/],
    [/(^|\.)(x|twitter)\.com$/i, /^(s|t)$/],
    [/(^|\.)medium\.com$/i, /^source$/],
    // Google Search session state. Keeps q and result filters (tbm, tbs, udm, start, hl).
    [/(^|\.)google\.[a-z.]+$/i, /^(ei|ved|sxsrf|sca_esv|oq|gs_l\w*|sclient|uact|aqs|sourceid|client|ie|rlz|biw|bih|dpr|iflsig|fbs|lei|sei|sa|source|prmd)$/, /^\/search$/],
];

const isIgnoredParam = (u, key) => TRACKING_PARAM.test(key) ||
    (!!u && SITE_PARAMS.some(([h, p, path]) => h.test(u.hostname) && p.test(key) && (!path || path.test(u.pathname))));
const parse = url => { try { return new URL(url); } catch { return null; } };

// Returns the key used to decide whether two URLs are duplicates.
function normalizeUrl(url, { ignoreHash = false, ignoreTracking = false } = {}) {
    if (!ignoreHash && !ignoreTracking) return url;
    const u = parse(url);
    if (!u) return url;
    if (ignoreHash) u.hash = '';
    if (ignoreTracking) {
        for (const key of [...u.searchParams.keys()]) {
            if (isIgnoredParam(u, key)) u.searchParams.delete(key);
        }
        u.searchParams.sort();
        if (!u.searchParams.size) u.search = '';
        u.pathname = u.pathname.replace(/\/+$/, '') || '/';
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
    const parsed = parse(url);
    const beforeQuery = queryAt < 0 ? base : base.slice(0, queryAt);
    // Trailing slash (not the root "/") is dropped by normalizeUrl.
    const slash = ignoreTracking && parsed && parsed.pathname.length > 1 ? beforeQuery.match(/\/+$/)?.[0] || '' : '';
    push(beforeQuery.slice(0, beforeQuery.length - slash.length), false);
    push(slash, true);

    if (queryAt >= 0) {
        const tokens = base.slice(queryAt + 1).split('&');
        const isTracking = tok => ignoreTracking && isIgnoredParam(parsed, tok.split('=')[0]);
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
