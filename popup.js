(() => {
  const radios = document.querySelectorAll('input[name="renderMode"]');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  chrome.storage.sync.get({ renderMode: 'modal' }, (settings) => {
    for (const radio of radios) {
      if (radio.value === settings.renderMode) {
        radio.checked = true;
        break;
      }
    }
  });

  saveBtn.addEventListener('click', () => {
    const selected = document.querySelector('input[name="renderMode"]:checked');
    if (!selected) return;

    saveBtn.disabled = true;
    statusEl.textContent = 'Zapisywanie...';

    chrome.storage.sync.set({ renderMode: selected.value }, () => {
      statusEl.textContent = 'Zapisano. Przeładowuję stronę...';

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) {
          chrome.tabs.reload(tab.id, () => {
            setTimeout(() => window.close(), 300);
          });
        } else {
          statusEl.textContent = 'Zapisano. Przeładuj stronę ręcznie.';
          saveBtn.disabled = false;
        }
      });
    });
  });
})();
