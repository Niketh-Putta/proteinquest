(function () {
  const PLAY_URL =
    'https://play.google.com/store/apps/details?id=com.proteinquest.app';

  document.querySelectorAll('[data-store="play"]').forEach((el) => {
    el.href = PLAY_URL;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
  });
})();
