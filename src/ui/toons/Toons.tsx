import type { CSSProperties, ReactNode } from 'react';
import { Bird, type BirdMood } from './Bird';

/** The mascot with something to say. Purely decorative: screens read the same without it. */
export function Guide({
  mood,
  size = 88,
  children,
}: {
  mood: BirdMood;
  size?: number;
  children: ReactNode;
}) {
  return (
    <div className="toon guide">
      <Bird mood={mood} size={size} />
      <p className="speech">{children}</p>
    </div>
  );
}

const CONFETTI_COLORS = ['--accent', '--mark', '--gain', '--loss', '--toon-pink'];

/** A single burst of confetti over its positioned parent. Invisible without motion. */
export function Confetti({ pieces = 40 }: { pieces?: number }) {
  return (
    <div className="toon confetti" aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => (
        <i
          key={i}
          style={
            {
              '--x': `${(i * 37 + 11) % 100}%`,
              '--wait': `${(i % 10) * 0.09}s`,
              '--time': `${2.1 + (i % 5) * 0.28}s`,
              '--spin': `${(i * 67) % 360}deg`,
              '--drift': `${((i * 29) % 80) - 40}px`,
              '--color': `var(${CONFETTI_COLORS[i % CONFETTI_COLORS.length]})`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
