(function () {
  const urls = {
    play: 'https://play.google.com/store/apps/details?id=com.proteinquest.app',
    ios: 'https://apps.apple.com/app/id6781790996',
  };

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function websiteId() {
    try {
      const key = 'pq_web_id';
      let id = sessionStorage.getItem(key);
      if (id) return id;
      id = uuid();
      sessionStorage.setItem(key, id);
      return id;
    } catch {
      return uuid();
    }
  }

  function sanitizeUtm(params) {
    const out = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach((key) => {
      const value = params.get(key);
      if (value) out[key] = value.slice(0, 80).replace(/[^\w.-]/g, '');
    });
    return out;
  }

  function track(eventName, properties) {
    const url = 'https://csxdkvpvcasuknhnprxp.supabase.co/functions/v1/ingest-analytics';
    const key = 'sb_publishable_Zg6Jj70nqJcd7OGof5iP6w_9My7yS9F';
    const params = new URLSearchParams(window.location.search);
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        events: [{
          event_id: uuid(),
          event_name: eventName,
          event_time: new Date().toISOString(),
          schema_version: 1,
          environment: 'production',
          platform: 'web',
          install_id: websiteId(),
          channel: params.get('utm_source') || 'unknown',
          properties: { ...sanitizeUtm(params), ...properties, page: location.pathname },
        }],
      }),
      keepalive: true,
    }).catch(() => {});
  }

  track('landing_viewed', { placement: 'marketing_home', referrer: document.referrer ? 'external' : 'direct' });

  document.querySelectorAll('[data-store]').forEach((link) => {
    link.href = urls[link.dataset.store];
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.addEventListener('click', () => {
      track('store_link_clicked', {
        destination: link.dataset.store,
        placement: link.getAttribute('data-placement') || 'marketing',
      });
    });
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
