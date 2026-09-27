const test = require('node:test');
const assert = require('node:assert');
const { findDuplicateGroups } = require('../dupes.js');

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
