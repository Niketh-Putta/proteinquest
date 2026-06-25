(function () {
  const PLAY_URL =
    'https://play.google.com/store/apps/details?id=com.proteinquest.app';
  const IOS_URL = 'https://apps.apple.com/app/id6781790996';

  document.querySelectorAll('[data-store="play"]').forEach((el) => {
    el.href = PLAY_URL;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
  });

  document.querySelectorAll('[data-store="ios"]').forEach((el) => {
    el.href = IOS_URL;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
  });
})();
