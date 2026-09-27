const test = require('node:test');
const assert = require('node:assert');
const { findDuplicateGroups, normalizeUrl } = require('../dupes.js');

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

test('normalizeUrl: ignoreTracking strips utm_*, fbclid, gclid and keeps other params in order', () => {
    assert.strictEqual(
        normalizeUrl('https://a.com/x?b=2&utm_source=z&UTM_Medium=m&fbclid=1&gclid=2&a=1', { ignoreTracking: true }),
        'https://a.com/x?b=2&a=1');
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
