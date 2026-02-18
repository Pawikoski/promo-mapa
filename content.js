(() => {
  chrome.storage.sync.get({ renderMode: 'modal' }, (settings) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('dist/injected.js');
    script.dataset.olxMapRenderMode = settings.renderMode;
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  });
})();
