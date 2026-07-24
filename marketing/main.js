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

  const carousel = document.getElementById('screenshot-carousel');
  if (!carousel) return;

  const stage = carousel.querySelector('.carousel__stage');
  const slides = [...carousel.querySelectorAll('.carousel__slide')];
  const prevBtn = carousel.querySelector('.carousel__btn--prev');
  const nextBtn = carousel.querySelector('.carousel__btn--next');
  const dotsRoot = carousel.querySelector('.carousel__dots');
  let index = 0;
  let lockScroll = false;
  let settleTimer = 0;

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel__dot';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', `Screenshot ${i + 1} of ${slides.length}`);
    dot.addEventListener('click', () => goTo(i));
    dotsRoot.appendChild(dot);
  });

  const dots = [...dotsRoot.querySelectorAll('.carousel__dot')];

  function nearestIndex() {
    const stageRect = stage.getBoundingClientRect();
    const stageCenter = stageRect.left + stageRect.width / 2;
    let best = 0;
    let bestDist = Infinity;
    slides.forEach((slide, i) => {
      const rect = slide.getBoundingClientRect();
      const slideCenter = rect.left + rect.width / 2;
      const dist = Math.abs(slideCenter - stageCenter);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }

  function scrollSlideToCenter(slide, behavior = 'smooth') {
    const stageRect = stage.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    const delta =
      slideRect.left +
      slideRect.width / 2 -
      (stageRect.left + stageRect.width / 2);
    const nextLeft = Math.max(0, stage.scrollLeft + delta);
    if (Math.abs(delta) < 0.5) return;
    stage.scrollTo({ left: nextLeft, behavior });
  }

  function updateActive(nextIndex) {
    index = Math.max(0, Math.min(nextIndex, slides.length - 1));
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === slides.length - 1;

    slides.forEach((slide, i) => {
      const offset = Math.abs(i - index);
      slide.classList.toggle('is-active', offset === 0);
      slide.classList.toggle('is-near', offset === 1);
      slide.setAttribute('aria-hidden', offset === 0 ? 'false' : 'true');
    });

    dots.forEach((dot, i) => {
      dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
  }

  function goTo(nextIndex, behavior = 'smooth') {
    const target = Math.max(0, Math.min(nextIndex, slides.length - 1));
    const slide = slides[target];
    if (!slide) return;
    lockScroll = true;
    updateActive(target);
    // Wait a frame so active scale applies, then center the layout box.
    requestAnimationFrame(() => {
      scrollSlideToCenter(slide, behavior);
      window.setTimeout(
        () => {
          scrollSlideToCenter(slide, 'auto');
          lockScroll = false;
        },
        behavior === 'smooth' ? 420 : 32,
      );
    });
  }

  function settleToNearest() {
    if (lockScroll) return;
    const nearest = nearestIndex();
    updateActive(nearest);
    scrollSlideToCenter(slides[nearest], 'smooth');
  }

  stage.addEventListener(
    'scroll',
    () => {
      if (lockScroll) return;
      updateActive(nearestIndex());
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settleToNearest, 90);
    },
    { passive: true },
  );

  stage.addEventListener('scrollend', () => {
    settleToNearest();
  });

  prevBtn.addEventListener('click', () => goTo(index - 1));
  nextBtn.addEventListener('click', () => goTo(index + 1));

  carousel.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(index + 1);
    }
  });

  let dragging = false;
  let dragStartX = 0;
  let dragStartScroll = 0;
  let dragMoved = false;

  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;
    dragging = true;
    dragMoved = false;
    dragStartX = event.clientX;
    dragStartScroll = stage.scrollLeft;
    stage.classList.add('is-dragging');
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const delta = event.clientX - dragStartX;
    if (Math.abs(delta) > 3) dragMoved = true;
    stage.scrollLeft = dragStartScroll - delta;
  });

  function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-dragging');
    try {
      stage.releasePointerCapture(event.pointerId);
    } catch (_) {
      /* ignore */
    }
    goTo(nearestIndex(), 'smooth');
  }

  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener(
    'click',
    (event) => {
      if (dragMoved) {
        event.preventDefault();
        event.stopPropagation();
        dragMoved = false;
      }
    },
    true,
  );

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => goTo(index, 'auto'), 80);
  });

  slides.forEach((slide) => {
    const img = slide.querySelector('img');
    if (img && !img.complete) {
      img.addEventListener('load', () => goTo(index, 'auto'), { once: true });
    }
  });

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => goTo(0, 'auto'));
  }

  requestAnimationFrame(() => goTo(0, 'auto'));
})();
