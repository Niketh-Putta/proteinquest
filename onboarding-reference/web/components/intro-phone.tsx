'use client';

import { useEffect, useRef, useState } from 'react';
import './intro-phone.css';

export function IntroPhone() {
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<'enter' | 'play' | 'exit' | 'wait'>('enter');
  const [paused, setPaused] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReduced(query.matches); if (query.matches) setPaused(true); };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (paused || failed) { video.current?.pause(); return; }
    if (phase === 'play') {
      const player = video.current;
      if (player) void player.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
      return;
    }
    const timer = window.setTimeout(() => {
      if (phase === 'enter') setPhase('play');
      else if (phase === 'exit') setPhase('wait');
      else {
        if (video.current) video.current.currentTime = 0;
        setPhase('enter');
      }
    }, phase === 'enter' ? 1200 : phase === 'exit' ? 1200 : 350);
    return () => window.clearTimeout(timer);
  }, [phase, paused, failed]);

  useEffect(() => {
    const visibility = () => {
      if (document.hidden) video.current?.pause();
      else if (phase === 'play' && !paused)
        void video.current?.play().catch(() => setBlocked(true));
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [phase, paused]);

  const toggle = () => {
    if (blocked) {
      void video.current?.play().then(() => {setBlocked(false);setPaused(false);setPhase('play');}).catch(() => setBlocked(true));
    } else setPaused(value => !value);
  };

  return <div className="intro-stage" aria-label="ProteinQuest app demonstration">
    <div className={'intro-handset intro-' + phase + (reduced ? ' intro-reduced' : '')}
      style={{ animationPlayState: paused ? 'paused' : 'running' }}>
      <div className="intro-island" aria-hidden="true"/>
      <div className="intro-display">
        <video ref={video} src="/media/onboarding-demo-hq.mp4" muted playsInline preload="auto"
          aria-label="Watch how to use ProteinQuest"
          onEnded={() => { if(reduced){setPaused(true);if(video.current)video.current.currentTime=0;}else setPhase('exit'); }}
          onError={() => setFailed(true)} />
      </div>
    </div>
    {failed ? <p className="intro-control" role="status">Video unavailable. You can still get started below.</p> :
      (paused || blocked) && <button className="intro-control" type="button" onClick={toggle}
        aria-label={paused || blocked ? 'Play app demonstration' : 'Pause app demonstration'}>
        {paused || blocked ? 'Play demo' : 'Pause demo'}
      </button>}
  </div>;
}
