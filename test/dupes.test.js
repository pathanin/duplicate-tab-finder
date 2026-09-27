const test = require('node:test');
const assert = require('node:assert');
const { findDuplicateGroups, normalizeUrl, splitUrl } = require('../dupes.js');

const t = (id, url, extra = {}) => ({ id, url, title: `t${id}`, ...extra });

test('empty list', () => {
    assert.deepStrictEqual(findDuplicateGroups([]), []);
});

test('no duplicates', () => {
    assert.deepStrictEqual(findDuplicateGroups([t(1, 'https://a'), t(2, 'https://b')]), []);
});

test('keeps first tab by default and closes the rest', () => {
    const [g] = findDuplicateGroups([t(1, 'https://a'), t(2, 'https://a'), t(3, 'https://a')]);
    assert.strictEqual(g.keep.id, 1);
    assert.deepStrictEqual(g.close.map(x => x.id), [2, 3]);
});

test('keeps the active tab even when it is not first', () => {
    const [g] = findDuplicateGroups([t(1, 'https://a'), t(2, 'https://a', { active: true })]);
    assert.strictEqual(g.keep.id, 2);
    assert.deepStrictEqual(g.close.map(x => x.id), [1]);
});

test('active beats pinned, pinned beats plain', () => {
    const [g1] = findDuplicateGroups([t(1, 'https://a', { pinned: true }), t(2, 'https://a', { active: true }), t(3, 'https://a')]);
    assert.strictEqual(g1.keep.id, 2);
    const [g2] = findDuplicateGroups([t(1, 'https://a'), t(2, 'https://a', { pinned: true })]);
    assert.strictEqual(g2.keep.id, 2);
});

test('never closes a pinned tab', () => {
    const [g] = findDuplicateGroups([
        t(1, 'https://a', { active: true }), t(2, 'https://a', { pinned: true }), t(3, 'https://a'),
    ]);
    assert.deepStrictEqual(g.close.map(x => x.id), [3]);
});

test('skips browser-internal pages and tabs without url', () => {
    const tabs = [
        t(1, 'chrome://newtab/'), t(2, 'chrome://newtab/'),
        t(3, 'about:newtab'), t(4, 'about:newtab'),
        t(5, undefined), t(6, undefined),
    ];
    assert.deepStrictEqual(findDuplicateGroups(tabs), []);
});

test('group of only pinned tabs is not reported', () => {
    const tabs = [t(1, 'https://a', { pinned: true }), t(2, 'https://a', { pinned: true })];
    assert.deepStrictEqual(findDuplicateGroups(tabs), []);
});

test('reports full group size including pinned tabs', () => {
    const [g] = findDuplicateGroups([
        t(1, 'https://a', { active: true }), t(2, 'https://a', { pinned: true }), t(3, 'https://a'),
    ]);
    assert.strictEqual(g.size, 3);
});

// --- URL normalization options ---

test('normalizeUrl: no options leaves url untouched', () => {
    assert.strictEqual(normalizeUrl('https://a.com/x?utm_source=z#top'), 'https://a.com/x?utm_source=z#top');
});

test('normalizeUrl: ignoreHash strips fragment', () => {
    assert.strictEqual(normalizeUrl('https://a.com/x#top', { ignoreHash: true }), 'https://a.com/x');
    assert.strictEqual(normalizeUrl('https://a.com/x#', { ignoreHash: true }), 'https://a.com/x');
});

test('normalizeUrl: ignoreTracking strips utm_*, fbclid, gclid and keeps other params (sorted)', () => {
    assert.strictEqual(
        normalizeUrl('https://a.com/x?b=2&utm_source=z&UTM_Medium=m&fbclid=1&gclid=2&a=1', { ignoreTracking: true }),
        'https://a.com/x?a=1&b=2');
});

test('normalizeUrl: ignoreTracking drops a now-empty "?"', () => {
    assert.strictEqual(normalizeUrl('https://a.com/x?utm_source=z', { ignoreTracking: true }), 'https://a.com/x');
});

test('normalizeUrl: ignoreTracking keeps fragment unless ignoreHash is also set', () => {
    assert.strictEqual(normalizeUrl('https://a.com/?utm_source=z#h', { ignoreTracking: true }), 'https://a.com/#h');
    assert.strictEqual(normalizeUrl('https://a.com/?utm_source=z#h', { ignoreTracking: true, ignoreHash: true }), 'https://a.com/');
});

test('normalizeUrl: unparseable url is returned as-is', () => {
    assert.strictEqual(normalizeUrl('not a url', { ignoreHash: true, ignoreTracking: true }), 'not a url');
});

test('grouping respects options', () => {
    const tabs = [t(1, 'https://a.com/#one'), t(2, 'https://a.com/#two'), t(3, 'https://a.com/?utm_source=x')];
    assert.deepStrictEqual(findDuplicateGroups(tabs), []);
    const [g1] = findDuplicateGroups(tabs, { ignoreHash: true });
    assert.deepStrictEqual([g1.keep.id, ...g1.close.map(x => x.id)], [1, 2]);
    const [g2] = findDuplicateGroups(tabs, { ignoreHash: true, ignoreTracking: true });
    assert.deepStrictEqual([g2.keep.id, ...g2.close.map(x => x.id)], [1, 2, 3]);
    assert.strictEqual(g2.url, 'https://a.com/');
});

test('group exposes all its tabs for preview, in original order', () => {
    const [g] = findDuplicateGroups([
        t(1, 'https://a', { pinned: true }), t(2, 'https://a', { active: true }), t(3, 'https://a'),
    ]);
    assert.deepStrictEqual(g.tabs.map(x => x.id), [1, 2, 3]);
});

// --- splitUrl: segments for highlighting the ignored parts of a URL ---

const ignored = segs => segs.filter(s => s.ignored).map(s => s.text).join('');
const joined = segs => segs.map(s => s.text).join('');

test('splitUrl: no options = one plain segment', () => {
    assert.deepStrictEqual(splitUrl('https://a.com/x?utm_source=z#h'), [{ text: 'https://a.com/x?utm_source=z#h', ignored: false }]);
});

test('splitUrl: segments always rejoin to the original url', () => {
    for (const url of ['https://a.com/', 'https://a.com/x?a=1&utm_x=2#h', 'https://a.com/?#', 'weird?utm_a&&b=%20#']) {
        assert.strictEqual(joined(splitUrl(url, { ignoreHash: true, ignoreTracking: true })), url);
    }
});

test('splitUrl: ignoreHash marks the fragment', () => {
    assert.strictEqual(ignored(splitUrl('https://a.com/x#top', { ignoreHash: true })), '#top');
});

test('splitUrl: ignoreTracking marks tracking params with their separator', () => {
    assert.strictEqual(ignored(splitUrl('https://a.com/x?id=9&utm_source=z&fbclid=1', { ignoreTracking: true })), '&utm_source=z&fbclid=1');
});

test('splitUrl: when every param is tracking, the "?" is marked too', () => {
    assert.strictEqual(ignored(splitUrl('https://a.com/x?utm_source=z&gclid=1', { ignoreTracking: true })), '?utm_source=z&gclid=1');
});

test('splitUrl: first real param after a leading tracking param keeps url readable', () => {
    // "?utm=1&id=9" -> ignored "utm_source=1&", kept "?id=9"-like reading
    const segs = splitUrl('https://a.com/?utm_source=1&id=9', { ignoreTracking: true });
    assert.strictEqual(ignored(segs), 'utm_source=1&');
    assert.strictEqual(segs.filter(s => !s.ignored).map(s => s.text).join(''), 'https://a.com/?id=9');
});

// --- YouTube timestamps / share tags ---

test('ignoreTracking: YouTube t= and si= are ignored', () => {
    const o = { ignoreTracking: true };
    const base = 'https://www.youtube.com/watch?v=uMUbbu3dwh0';
    assert.strictEqual(normalizeUrl(base + '&t=481s', o), base);
    assert.strictEqual(normalizeUrl(base + '&si=abc&t=5', o), base);
    assert.strictEqual(normalizeUrl('https://youtu.be/uMUbbu3dwh0?t=10', o), 'https://youtu.be/uMUbbu3dwh0');
    assert.strictEqual(normalizeUrl('https://m.youtube.com/watch?v=x&t=1', o), 'https://m.youtube.com/watch?v=x');
});

test('ignoreTracking: t= is kept on non-YouTube sites and different videos stay distinct', () => {
    const o = { ignoreTracking: true };
    assert.strictEqual(normalizeUrl('https://a.com/x?t=5', o), 'https://a.com/x?t=5');
    assert.strictEqual(normalizeUrl('https://notyoutube.com/x?t=5', o), 'https://notyoutube.com/x?t=5');
    assert.notStrictEqual(normalizeUrl('https://www.youtube.com/watch?v=A&t=1', o), normalizeUrl('https://www.youtube.com/watch?v=B&t=1', o));
});

test('ignoreTracking: YouTube video with and without timestamp are duplicates', () => {
    const tabs = [t(1, 'https://www.youtube.com/watch?v=uMUbbu3dwh0&t=481s'), t(2, 'https://www.youtube.com/watch?v=uMUbbu3dwh0')];
    assert.strictEqual(findDuplicateGroups(tabs, { ignoreTracking: true }).length, 1);
    assert.strictEqual(findDuplicateGroups(tabs).length, 0);
});

test('splitUrl: marks YouTube timestamp, not t= elsewhere', () => {
    const ignoredText = segs => segs.filter(s => s.ignored).map(s => s.text).join('');
    assert.strictEqual(ignoredText(splitUrl('https://www.youtube.com/watch?v=x&t=481s', { ignoreTracking: true })), '&t=481s');
    assert.strictEqual(ignoredText(splitUrl('https://a.com/x?t=5', { ignoreTracking: true })), '');
});

// --- More tracking params, site rules, trailing slash, param order (all under ignoreTracking) ---

const same = (a, b) => assert.strictEqual(normalizeUrl(a, { ignoreTracking: true }), normalizeUrl(b, { ignoreTracking: true }), `${a} vs ${b}`);
const differ = (a, b) => assert.notStrictEqual(normalizeUrl(a, { ignoreTracking: true }), normalizeUrl(b, { ignoreTracking: true }), `${a} vs ${b}`);

test('ignoreTracking: common ad/email/analytics/social params are ignored everywhere', () => {
    const params = ['msclkid', 'dclid', 'gbraid', 'wbraid', 'gad_source', 'gclsrc', '_gl', 'twclid', 'ttclid',
        'li_fat_id', 'yclid', 'rdt_cid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'mkt_tok', 'oly_enc_id',
        'oly_anon_id', 'vero_id', 'pk_campaign', 'mtm_source', 's_cid', 'igshid', 'igsh'];
    for (const p of params) same(`https://a.com/x?id=1&${p}=zzz`, 'https://a.com/x?id=1');
});

test('ignoreTracking: similar-looking real params are kept', () => {
    differ('https://a.com/x?gl=us', 'https://a.com/x');
    differ('https://a.com/x?pk=5', 'https://a.com/x');
    differ('https://a.com/x?s=5', 'https://a.com/x');
});

test('ignoreTracking: Spotify si and X/Twitter s,t are ignored only on those hosts', () => {
    same('https://open.spotify.com/track/abc?si=123', 'https://open.spotify.com/track/abc');
    same('https://x.com/u/status/1?s=20&t=abc', 'https://x.com/u/status/1');
    same('https://twitter.com/u/status/1?s=46', 'https://twitter.com/u/status/1');
    differ('https://a.com/x?si=1', 'https://a.com/x');
});

test('ignoreTracking: Google Search session junk is ignored, the query is not', () => {
    same('https://www.google.com/search?q=cats&ei=abc&ved=0ah&sxsrf=x&sca_esv=1&oq=cat&gs_lp=zz&sclient=gws-wiz',
        'https://www.google.com/search?q=cats');
    same('https://www.google.co.uk/search?q=cats&ei=1', 'https://www.google.co.uk/search?q=cats');
    differ('https://www.google.com/search?q=cats', 'https://www.google.com/search?q=dogs');
    differ('https://www.google.com/search?q=cats&tbm=isch', 'https://www.google.com/search?q=cats');
});

test('ignoreTracking: Medium source= is ignored on medium.com only', () => {
    same('https://medium.com/@u/post-123?source=rss----1', 'https://medium.com/@u/post-123');
    same('https://blog.medium.com/post-123?source=x', 'https://blog.medium.com/post-123');
    differ('https://a.com/x?source=1', 'https://a.com/x');
});

test('ignoreTracking: trailing slash on the path is ignored', () => {
    same('https://a.com/docs/', 'https://a.com/docs');
    same('https://a.com/docs/?id=1', 'https://a.com/docs?id=1');
    same('https://a.com/', 'https://a.com');
    differ('https://a.com/docs', 'https://a.com/doc');
});

test('ignoreTracking: parameter order is ignored, values are not', () => {
    same('https://a.com/x?a=1&b=2', 'https://a.com/x?b=2&a=1');
    differ('https://a.com/x?a=1&b=2', 'https://a.com/x?a=2&b=1');
});

test('without ignoreTracking, slash and order still matter', () => {
    assert.notStrictEqual(normalizeUrl('https://a.com/docs/'), normalizeUrl('https://a.com/docs'));
    assert.notStrictEqual(normalizeUrl('https://a.com/x?a=1&b=2'), normalizeUrl('https://a.com/x?b=2&a=1'));
});

test('splitUrl: marks trailing slash and site-specific params', () => {
    const o = { ignoreTracking: true };
    assert.strictEqual(ignored(splitUrl('https://a.com/docs/', o)), '/');
    assert.strictEqual(ignored(splitUrl('https://a.com/docs/?id=1', o)), '/');
    assert.strictEqual(ignored(splitUrl('https://a.com/', o)), '');
    assert.strictEqual(ignored(splitUrl('https://www.google.com/search?q=cats&ei=abc', o)), '&ei=abc');
    assert.strictEqual(ignored(splitUrl('https://medium.com/p?source=x', o)), '?source=x');
    assert.strictEqual(joined(splitUrl('https://a.com/docs/?id=1#h', o)), 'https://a.com/docs/?id=1#h');
});

test('ignoreTracking: Google junk rule applies only to /search, not other Google pages', () => {
    differ('https://docs.google.com/document/d/1/edit?source=x', 'https://docs.google.com/document/d/1/edit');
    differ('https://www.google.com/maps?client=x', 'https://www.google.com/maps');
    same('https://www.google.com/search?q=cats&ei=1', 'https://www.google.com/search?q=cats');
    assert.strictEqual(ignored(splitUrl('https://docs.google.com/d?source=x', { ignoreTracking: true })), '');
});
