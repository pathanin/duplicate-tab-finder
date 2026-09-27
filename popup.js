document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('scanBtn');
    const closeBtn = document.getElementById('closeBtn');
    const duplicateList = document.getElementById('duplicateList');
    const statusDiv = document.getElementById('status');
    const toggles = ['ignoreHash', 'ignoreTracking'];

    // Toggle state is a per-browser convenience; storage may be unavailable, so never depend on it.
    for (const name of toggles) {
        const box = document.getElementById(name);
        try { box.checked = localStorage.getItem(name) === '1'; } catch {}
        box.addEventListener('change', () => {
            try { localStorage.setItem(name, box.checked ? '1' : '0'); } catch {}
            findDuplicates();
        });
    }

    const getOptions = () =>
        Object.fromEntries(toggles.map(name => [name, document.getElementById(name).checked]));

    const countClosing = (groups) => groups.reduce((n, g) => n + g.close.length, 0);

    // Always query fresh tabs so we never act on ids from a stale scan.
    const getGroups = async () => findDuplicateGroups(await chrome.tabs.query({}), getOptions());

    const render = async () => {
        const tabs = await chrome.tabs.query({});
        const options = getOptions();
        const groups = findDuplicateGroups(tabs, options);
        const closing = countClosing(groups);

        // Show next to each toggle how flipping it would change the number of tabs closed.
        for (const name of toggles) {
            const diff = countClosing(findDuplicateGroups(tabs, { ...options, [name]: !options[name] })) - closing;
            document.getElementById(`${name}Delta`).textContent = diff ? `(${diff > 0 ? '+' : ''}${diff} tabs)` : '';
        }

        duplicateList.replaceChildren(...groups.map(displayDuplicateGroup));
        closeBtn.disabled = groups.length === 0;
        return groups.length
            ? `${closing} tab(s) will be closed in ${groups.length} group(s).`
            : 'No duplicate tabs found!';
    };

    const findDuplicates = async () => {
        statusDiv.textContent = 'Scanning...';
        statusDiv.textContent = await render();
    };

    const tabRow = (tab, tag) => {
        const row = document.createElement('li');
        row.className = tag.toLowerCase();
        const tagEl = document.createElement('span');
        tagEl.className = 'tag';
        tagEl.textContent = tag;
        const urlEl = document.createElement('span');
        urlEl.className = 'row-url';
        urlEl.textContent = urlEl.title = tab.url;
        row.append(tagEl, urlEl);
        return row;
    };

    const displayDuplicateGroup = ({ url, keep, close, tabs, size }) => {
        const listItem = document.createElement('li');

        const tabInfoDiv = document.createElement('div');
        tabInfoDiv.className = 'tab-info';

        const urlElement = document.createElement('span');
        urlElement.className = 'url';
        urlElement.textContent = keep.title || url;
        urlElement.title = url;

        const countElement = document.createElement('span');
        countElement.className = 'count';
        countElement.textContent = `(${size} tabs open)`;

        tabInfoDiv.append(urlElement, countElement);

        const closeGroupBtn = document.createElement('button');
        closeGroupBtn.className = 'close-group-btn';
        closeGroupBtn.textContent = 'Close Group';
        closeGroupBtn.addEventListener('click', () => closeDuplicates(url));

        // Preview exactly which tabs stay and which go.
        const rows = document.createElement('ul');
        rows.className = 'tab-rows';
        rows.append(...tabs.map(tab =>
            tabRow(tab, tab === keep ? 'Keep' : close.includes(tab) ? 'Close' : 'Pinned')));

        listItem.append(tabInfoDiv, closeGroupBtn, rows);
        return listItem;
    };

    // Closes duplicates for one group key, or for all groups when url is omitted.
    const closeDuplicates = async (url) => {
        try {
            const groups = (await getGroups()).filter(g => !url || g.url === url);
            const ids = groups.flatMap(g => g.close.map(t => t.id));
            if (ids.length) await chrome.tabs.remove(ids);
            const remaining = await render();
            statusDiv.textContent = ids.length ? `Closed ${ids.length} duplicate tab(s).` : remaining;
        } catch (err) {
            statusDiv.textContent = `Error: ${err.message}`;
        }
    };

    scanBtn.addEventListener('click', findDuplicates);
    closeBtn.addEventListener('click', () => closeDuplicates());

    findDuplicates();
});
