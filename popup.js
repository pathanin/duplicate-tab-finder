// Perf notes: one chrome.tabs.query per refresh; toggles, hover previews and deltas are all computed
// from that cached array. Hover only rebuilds the small peek card, never the list. No background script, so nothing runs while the popup is closed.
const RULES = {
    ignoreHash: 'Ignore #fragments',
    ignoreTracking: 'Ignore tracking params',
};
const $ = id => document.getElementById(id);

const state = {
    tabs: [],
    options: {},
    preview: null,       // rule name being hovered/focused, or null
    lastClosed: [],      // snapshots for undo
};

const countClosing = groups => groups.reduce((n, g) => n + g.close.length, 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------- rendering ----------

const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
};

const urlNode = (url, options) => {
    const span = el('span', 'row-url');
    span.title = url;
    splitUrl(url, options).forEach((seg, i) => {
        // Drop the scheme for readability; the full URL is in the tooltip.
        const text = i === 0 ? seg.text.replace(/^https?:\/\/(www\.)?/, '') : seg.text;
        span.append(seg.ignored ? el('span', 'ignored', text) : text);
    });
    return span;
};

const favicon = tab => {
    const img = el('img', 'favicon');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => { img.style.visibility = 'hidden'; };
    if (tab.favIconUrl) img.src = tab.favIconUrl;
    else img.style.visibility = 'hidden';
    return img;
};

const MARKS = { keep: '●', close: '✕', pinned: '📌' };

const rowNode = (tab, stateName, windowLabel) => {
    const btn = el('button', 'row');
    btn.type = 'button';
    btn.dataset.state = stateName;
    btn.setAttribute('aria-label', `${stateName}: ${tab.url}. Go to tab`);
    btn.append(el('span', 'mark', MARKS[stateName]), urlNode(tab.url, state.options));
    if (tab.pinned) btn.append(el('span', 'badge', 'pinned'));
    if (tab.active) btn.append(el('span', 'badge', 'current'));
    if (windowLabel) btn.append(el('span', 'badge', windowLabel));
    btn.append(el('span', 'go', 'Go →'));
    btn.addEventListener('click', () => focusTab(tab));
    return btn;
};

const groupNode = group => {
    const li = el('li', 'group');
    const head = el('div', 'group-head');
    const closeBtn = el('button', 'secondary', `Close ${group.close.length}`);
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => closeDuplicates(group.url));
    head.append(
        favicon(group.keep),
        el('span', 'group-title', group.keep.title || group.url),
        el('span', 'group-meta', `${group.size} open`),
        closeBtn,
    );

    // Identical URLs in different windows are otherwise indistinguishable.
    const windows = [...new Set(group.tabs.map(t => t.windowId))];
    const rows = el('ul', 'rows');
    for (const tab of group.tabs) {
        const s = tab === group.keep ? 'keep' : group.close.includes(tab) ? 'close' : 'pinned';
        const item = el('li');
        const windowLabel = windows.length > 1 ? `window ${windows.indexOf(tab.windowId) + 1}` : '';
        item.append(rowNode(tab, s, windowLabel));
        rows.append(item);
    }
    li.append(head, rows);
    return li;
};

// Committed state: list, header, rule deltas, footer. Hover never calls this.
function draw() {
    const { tabs, options } = state;
    const groups = findDuplicateGroups(tabs, options);
    const count = countClosing(groups);

    for (const name of Object.keys(RULES)) {
        const diff = countClosing(findDuplicateGroups(tabs, { ...options, [name]: !options[name] })) - count;
        const delta = $(`${name}Delta`);
        delta.textContent = !diff ? '' : options[name] ? `catching ${-diff}` : `+${diff} more`;
        delta.title = !diff ? '' : options[name]
            ? `This rule is catching ${plural(-diff, 'tab')}`
            : `Turning this on would close ${plural(diff, 'more tab')}`;
    }

    $('tally').textContent = count;
    $('tally').parentElement.classList.toggle('zero', count === 0);
    $('summary').textContent = `${plural(tabs.length, 'tab')} open · ${plural(groups.length, 'duplicate group')}`;

    $('groups').replaceChildren(...groups.map(groupNode));
    $('empty').hidden = groups.length > 0;
    $('emptyHint').textContent = tabs.length ? 'Every open tab is unique.' : '';

    const closeAll = $('closeAll');
    closeAll.disabled = count === 0;
    closeAll.textContent = count ? `Close ${plural(count, 'duplicate tab')}` : 'Nothing to close';

    if (state.preview) drawPeek();
}

// Floating "what if" card for the hovered rule. Overlays the list, so nothing underneath moves.
const PEEK_ROWS = 5;
function drawPeek() {
    const { tabs, options, preview } = state;
    const peek = $('peek');
    if (!preview) { peek.classList.remove('open'); return; }

    const flipped = { ...options, [preview]: !options[preview] };
    const closeMap = groups => new Map(groups.flatMap(g => g.close.map(t => [t.id, { tab: t, keep: g.keep }])));
    const before = closeMap(findDuplicateGroups(tabs, options));
    const after = closeMap(findDuplicateGroups(tabs, flipped));
    const added = [...after.values()].filter(x => !before.has(x.tab.id));
    const removed = [...before.values()].filter(x => !after.has(x.tab.id));
    const turningOn = !options[preview];

    const head = el('div', 'peek-head');
    const num = added.length - removed.length;
    head.append(
        el('span', 'peek-num' + (num < 0 ? ' minus' : ''), num > 0 ? `+${num}` : num < 0 ? `−${-num}` : '0'),
        el('span', 'peek-text', (added.length ? `${added.length === 1 ? 'tab' : 'tabs'} would close`
            : removed.length ? `${removed.length === 1 ? 'tab' : 'tabs'} would stay open` : 'No tabs affected')
            + ` if you turn ${turningOn ? 'on' : 'off'} “${RULES[preview]}”`),
    );

    const list = el('ul', 'peek-rows');
    const items = [...added.map(x => ['✕', x, flipped]), ...removed.map(x => ['↺', x, options])];
    for (const [mark, { tab, keep }, opts] of items.slice(0, PEEK_ROWS)) {
        const li = el('li', mark === '✕' ? 'add' : 'remove');
        const same = el('span', 'peek-same', `same as ${keep.url.replace(/^https?:\/\/(www\.)?/, '')}`);
        li.append(el('span', 'mark', mark), urlNode(tab.url, opts), same);
        list.append(li);
    }
    if (items.length > PEEK_ROWS) list.append(el('li', 'peek-more', `+${items.length - PEEK_ROWS} more`));

    peek.replaceChildren(head, list);
    peek.classList.add('open');
}

// ---------- data ----------

async function refresh() {
    state.tabs = await chrome.tabs.query({});
    draw();
}

let refreshTimer;
const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 150);
};

// ---------- actions ----------

function focusTab(tab) {
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
}

let toastTimer;
function toast(text, canUndo) {
    $('toastText').textContent = text;
    $('undoBtn').hidden = !canUndo;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 8000);
}

// Closes duplicates for one group key, or all groups when url is omitted.
async function closeDuplicates(url) {
    try {
        // Fresh query so we never act on stale ids.
        const tabs = await chrome.tabs.query({});
        const doomed = findDuplicateGroups(tabs, state.options)
            .filter(g => !url || g.url === url)
            .flatMap(g => g.close);
        if (!doomed.length) return refresh();
        await chrome.tabs.remove(doomed.map(t => t.id));
        state.lastClosed = doomed.map(({ url, windowId, index }) => ({ url, windowId, index }));
        toast(`Closed ${plural(doomed.length, 'tab')}.`, true);
        await refresh();
    } catch (err) {
        toast(`Couldn't close tabs: ${err.message}`, false);
        refresh();
    }
}

async function undo() {
    const snapshots = state.lastClosed.sort((a, b) => a.index - b.index);
    state.lastClosed = [];
    $('toast').hidden = true;
    for (const { url, windowId, index } of snapshots) {
        // The original window may be gone; fall back to the current one.
        await chrome.tabs.create({ url, windowId, index, active: false })
            .catch(() => chrome.tabs.create({ url, active: false }));
    }
    refresh();
}

// ---------- wiring ----------

document.addEventListener('DOMContentLoaded', () => {
    for (const name of Object.keys(RULES)) {
        const box = $(name);
        const rule = box.closest('.rule');
        try { box.checked = localStorage.getItem(name) === '1'; } catch {}
        state.options[name] = box.checked;

        // Hover or keyboard focus previews the effect of flipping the rule.
        // After a flip, hold off previewing until the pointer/focus leaves, so the list shows the committed result.
        let armed = true;
        const start = () => { if (armed && state.preview !== name) { state.preview = name; drawPeek(); } };
        const stop = () => { armed = true; if (state.preview === name) { state.preview = null; drawPeek(); } };
        rule.addEventListener('mouseenter', start);
        rule.addEventListener('mouseleave', stop);
        box.addEventListener('focus', start);
        box.addEventListener('blur', stop);
        box.addEventListener('change', () => {
            state.options[name] = box.checked;
            try { localStorage.setItem(name, box.checked ? '1' : '0'); } catch {}
            armed = false;
            state.preview = null;
            drawPeek();
            draw();
        });
    }

    $('closeAll').addEventListener('click', () => closeDuplicates());
    $('undoBtn').addEventListener('click', undo);

    // Keep the list live while the popup is open. Ignore loading-status churn.
    chrome.tabs.onCreated.addListener(scheduleRefresh);
    chrome.tabs.onRemoved.addListener(scheduleRefresh);
    chrome.tabs.onUpdated.addListener((id, change) => {
        if (change.url || change.title || change.pinned !== undefined || change.favIconUrl) scheduleRefresh();
    });

    refresh();
});
