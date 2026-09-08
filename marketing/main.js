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

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const targetId = link.getAttribute('href');
      if (!targetId || targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({
        behavior: reducedMotion.matches ? 'auto' : 'smooth',
        block: 'start',
      });
      window.history.pushState(null, '', targetId);
    });
  });
})();
