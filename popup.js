document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('scanBtn');
    const closeBtn = document.getElementById('closeBtn');
    const duplicateList = document.getElementById('duplicateList');
    const statusDiv = document.getElementById('status');

    // Always query fresh tabs so we never act on ids from a stale scan.
    const getGroups = async () => findDuplicateGroups(await chrome.tabs.query({}));

    const render = (groups) => {
        duplicateList.replaceChildren(...groups.map(displayDuplicateGroup));
        closeBtn.disabled = groups.length === 0;
        return groups.length
            ? `Found ${groups.length} group(s) of duplicate tabs.`
            : 'No duplicate tabs found!';
    };

    const findDuplicates = async () => {
        statusDiv.textContent = 'Scanning...';
        statusDiv.textContent = render(await getGroups());
    };

    const displayDuplicateGroup = ({ url, keep, size }) => {
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

        listItem.append(tabInfoDiv, closeGroupBtn);
        return listItem;
    };

    // Closes duplicates for one URL, or for all URLs when url is omitted.
    const closeDuplicates = async (url) => {
        try {
            const groups = (await getGroups()).filter(g => !url || g.url === url);
            const ids = groups.flatMap(g => g.close.map(t => t.id));
            if (ids.length) await chrome.tabs.remove(ids);
            const remaining = render(await getGroups());
            statusDiv.textContent = ids.length ? `Closed ${ids.length} duplicate tab(s).` : remaining;
        } catch (err) {
            statusDiv.textContent = `Error: ${err.message}`;
        }
    };

    scanBtn.addEventListener('click', findDuplicates);
    closeBtn.addEventListener('click', () => closeDuplicates());

    findDuplicates();
});
