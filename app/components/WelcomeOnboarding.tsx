'use client';
import { useRef, useState, useSyncExternalStore } from 'react';
import { OnboardingArtwork } from './OnboardingArtwork';
import { ResponsiveOverlay } from './ResponsiveOverlay';
import { Icon } from './Icon';
import { onboardingChanged, readDecision, saveDecision } from '../lib/pwa/onboarding';
const slides = [
  ['Welcome to MapSilip', 'Your Dormitory, Connected.'],
  ['Everything in One Place', 'A Simpler Dormitory Experience.'],
  ['Stay Updated', 'Never Miss Important Updates.'],
  ['Easy Access Anywhere', 'Your Dormitory at Your Fingertips.'],
];
function subscribe(listener: () => void) {
  window.addEventListener(onboardingChanged, listener); window.addEventListener('storage', listener);
  return () => { window.removeEventListener(onboardingChanged, listener); window.removeEventListener('storage', listener); };
}
const snapshot = () => Boolean(readDecision('welcome'));
const serverSnapshot = () => true;
export function WelcomeOnboarding() {
  const done = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [slide, setSlide] = useState(0);
  const start = useRef<{x: number; y: number} | null>(null);
  const go = (next: number) => setSlide(Math.max(0, Math.min(slides.length - 1, next)));
  function finish() { saveDecision('welcome', 'done'); }
  return <ResponsiveOverlay open={!done} onClose={finish} title="Welcome to MapSilip" className="onboarding-overlay">
    <div className="welcome-screen" onKeyDown={event => {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(slide + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(slide - 1); }
    }}>
      <header className="onboarding-topbar"><span className="onboarding-wordmark">Map<span>Silip</span></span><button type="button" onClick={finish}>Skip</button></header>
      <div className="welcome-carousel" aria-roledescription="carousel" aria-label="Discover MapSilip"
        onTouchStart={event => { start.current = {x: event.touches[0].clientX, y: event.touches[0].clientY}; }}
        onTouchEnd={event => {
          if (!start.current) return;
          const dx = start.current.x - event.changedTouches[0].clientX, dy = start.current.y - event.changedTouches[0].clientY;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.25) go(slide + (dx > 0 ? 1 : -1));
          start.current = null;
        }} onTouchCancel={() => { start.current = null; }}>
        <div className="welcome-track" style={{transform: `translate3d(-${slide * 100}%,0,0)`}}>
          {slides.map(([heading, description], index) => <section key={heading} className={`welcome-slide${index === slide ? ' is-active' : ''}`} aria-hidden={index !== slide} inert={index !== slide} aria-roledescription="slide" aria-label={`${index + 1} of ${slides.length}`}>
            <OnboardingArtwork scene={index} priority={index === 0} />
            <div className="welcome-copy"><h1>{heading}</h1><p>{description}</p></div>
          </section>)}
        </div>
      </div>
      <p className="sr-only" role="status">{slide + 1} of {slides.length}: {slides[slide][0]}</p>
      <footer className="welcome-controls"><nav aria-label="Welcome slides">{slides.map(([heading], index) => <button type="button" key={heading} aria-label={`Show slide ${index + 1}`} aria-current={slide === index ? 'step' : undefined} onClick={() => go(index)} />)}</nav><div className={`welcome-actions${slide === slides.length - 1 ? ' welcome-actions--finish' : ''}`}>
        {slide > 0 && <button type="button" className="button button--secondary welcome-back" onClick={() => go(slide - 1)}>Back</button>}
        <button type="button" className="button button--primary" onClick={() => slide === slides.length - 1 ? finish() : go(slide + 1)}>{slide === slides.length - 1 ? 'Get Started' : 'Next'}<Icon name="chevron" /></button>
      </div></footer>
    </div>
  </ResponsiveOverlay>;
}
