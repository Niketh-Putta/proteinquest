(function () {
  const urls = {
    play: 'https://play.google.com/store/apps/details?id=com.proteinquest.app',
    ios: 'https://apps.apple.com/app/id6781790996',
  };
  document.querySelectorAll('[data-store]').forEach((link) => {
    link.href = urls[link.dataset.store];
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });
})();
