// Fake chrome.tabs for rendering store assets with the real popup code.
// ?virtual=1 swaps setTimeout for a clock the stage advances frame by frame (see stage.html).
const params = new URLSearchParams(location.search);

if (params.has('virtual')) {
    let now = 0, nextId = 1;
    const timers = new Map();
    window.setTimeout = (fn, ms = 0) => { timers.set(nextId, { fn, due: now + ms }); return nextId++; };
    window.clearTimeout = id => timers.delete(id);
    window.__advance = dt => {
        now += dt;
        for (const [id, t] of [...timers]) if (t.due <= now) { timers.delete(id); t.fn(); }
    };
}

const icon = (letter, color) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${color}"/>` +
    `<text x="16" y="22" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`);

const ICONS = {
    docs: icon('D', '#3b6ea8'),
    news: icon('N', '#2f7d6b'),
    shop: icon('S', '#b4532a'),
    mail: icon('M', '#6b5ca5'),
    notes: icon('P', '#c28f1a'),
};

const T = (id, index, site, url, title, extra = {}) =>
    ({ id, windowId: 1, index, url, title, favIconUrl: ICONS[site], active: false, pinned: false, ...extra });

window.tabs = [
    T(3, 0, 'news', 'https://news.site/article/42', 'Why tabs multiply', { pinned: true }),
    T(1, 1, 'mail', 'https://mail.app/inbox', 'Inbox (3)'),
    T(2, 2, 'docs', 'https://docs.dev/guide', 'Getting started — Docs', { active: true }),
    T(4, 3, 'docs', 'https://docs.dev/guide#install', 'Getting started — Docs'),
    T(5, 4, 'shop', 'https://shop.com/p?id=9&utm_campaign=fall', 'Wool socks — Shop'),
    T(6, 5, 'news', 'https://news.site/article/42', 'Why tabs multiply'),
    T(7, 6, 'docs', 'https://docs.dev/guide?utm_source=newsletter', 'Getting started — Docs'),
    T(8, 7, 'shop', 'https://shop.com/p?id=9&fbclid=a81f', 'Wool socks — Shop'),
    T(9, 8, 'notes', 'https://notes.app/doc/7', 'Weekly planning'),
    T(10, 9, 'notes', 'https://notes.app/doc/7', 'Weekly planning'),
    T(11, 0, 'news', 'https://news.site/article/42', 'Why tabs multiply', { windowId: 2 }),
];

const ev = () => {
    const fns = [];
    return { addListener: f => fns.push(f), fire: (...a) => fns.forEach(f => f(...a)) };
};
const removed = [];

window.chrome = {
    tabs: {
        onCreated: ev(), onRemoved: ev(), onUpdated: ev(),
        query: async () => tabs.map(t => ({ ...t })),
        remove: async ids => {
            removed.push(...tabs.filter(t => ids.includes(t.id)));
            tabs = tabs.filter(t => !ids.includes(t.id));
            ids.forEach(id => chrome.tabs.onRemoved.fire(id));
        },
        // Undo recreates by URL; restore the original tab so the strip animates it back in place.
        create: async ({ url, windowId }) => {
            const i = removed.findIndex(t => t.url === url && t.windowId === windowId);
            const tab = i >= 0 ? removed.splice(i, 1)[0] : T(100 + tabs.length, 99, 'docs', url, url);
            tabs.push(tab);
            chrome.tabs.onCreated.fire(tab);
            return tab;
        },
        update: async () => {},
    },
    windows: { update: async () => {} },
};
