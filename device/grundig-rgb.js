(() => {
    'use strict';
    function syncColor() {
        const toggleRow = document.querySelector('input[name="tgl"][value="130"]')?.closest('tr');
        if (toggleRow) toggleRow.hidden = true;
        const marker = document.getElementById('grundig-rgb-state');
        const picker = document.getElementById('color131');
        if (!marker || !picker) return;
        const row = marker.closest('tr');
        if (!row) return;
        const match = row.textContent.match(/=\s*(\d+)/);
        if (!match) return;
        const color = Number(match[1]);
        if (!Number.isInteger(color) || color < 0 || color > 16777215) return;
        if (document.activeElement !== picker) picker.value = '#' + color.toString(16).padStart(6, '0');
        const heading = picker.closest('td')?.querySelector('h5');
        if (heading && heading.textContent !== 'Grundig RGB - barva') heading.textContent = 'Grundig RGB - barva';
        row.hidden = true;
    }
    document.addEventListener('change', event => {
        if (event.target.id !== 'color131') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!/^#[0-9a-f]{6}$/i.test(event.target.value)) return;
        location.href = '/index?setIndex=60&set=' + parseInt(event.target.value.slice(1), 16);
    }, true);
    new MutationObserver(syncColor).observe(document.body, {childList: true, subtree: true});
    syncColor();
})();