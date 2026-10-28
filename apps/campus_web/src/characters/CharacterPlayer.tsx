'use client';

import { useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { CHARACTER_FPS, CHARACTER_FRAMES, CHARACTER_SIZE, CHARACTERS, type CharacterName } from './index';

/**
 * Plays an animated character in the page with Remotion's <Player>: looping,
 * muted, no controls. It only runs while on screen, and holds a still frame
 * for people who ask their system for reduced motion.
 */
export function CharacterPlayer({ name, className }: { name: CharacterName; className?: string }) {
  const c = CHARACTERS[name];
  const ref = useRef<PlayerRef>(null);
  const box = useRef<HTMLDivElement>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const player = ref.current;
    const el = box.current;
    if (!player || !el) return;
    if (still) {
      player.pause();
      player.seekTo(c.stillFrame);
      return;
    }
    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? player.play() : player.pause()), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [still, c.stillFrame]);

  return (
    <div ref={box} className={className}>
      <Player
        ref={ref}
        component={c.component}
        durationInFrames={CHARACTER_FRAMES}
        fps={CHARACTER_FPS}
        compositionWidth={CHARACTER_SIZE}
        compositionHeight={CHARACTER_SIZE}
        initialFrame={c.stillFrame}
        loop
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        style={{ width: '100%', height: '100%', background: 'transparent', overflow: 'visible' }}
      />
    </div>
  );
}
