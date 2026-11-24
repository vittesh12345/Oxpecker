import type { CSSProperties, ReactNode } from 'react';
import type { Species } from './cast';

export type CritterMood = 'neutral' | 'happy' | 'worried';

interface Look {
  eyeY: number;
  eyeDx: number;
  mouthY: number;
  /** Ears, horns and anything else that sits behind the head. */
  back: ReactNode;
  head: ReactNode;
  /** Anything drawn over the face, such as a horn on the nose. */
  front?: ReactNode;
}

const mirror = (node: ReactNode) => <g transform="translate(64 0) scale(-1 1)">{node}</g>;
const both = (node: ReactNode) => (
  <>
    {node}
    {mirror(node)}
  </>
);

const LOOKS: Record<Species, Look> = {
  zebra: {
    eyeY: 28,
    eyeDx: 7.5,
    mouthY: 49,
    back: (
      <>
        {both(
          <>
            <ellipse className="skin" cx="19" cy="11" rx="4.6" ry="8" transform="rotate(-22 19 11)" />
            <ellipse className="inner" cx="19.4" cy="12" rx="2" ry="4.6" transform="rotate(-22 19 11)" />
          </>,
        )}
        <path className="dark" d="M25 12 L28 3 L30.5 8 L32 1.5 L33.5 8 L36 3 L39 12 Z" />
      </>
    ),
    head: (
      <>
        <ellipse className="skin" cx="32" cy="31" rx="15.5" ry="19" />
        <path className="stripe" d="M27.5 14.5 L32 18.5 L36.5 14.5 M26 20 L32 24 L38 20" />
        {both(<path className="stripe" d="M17 28.5 L21.5 30 M17 34 L22 34.5 M18.5 39.5 L23 38.5" />)}
        <ellipse className="muzzle" cx="32" cy="46.5" rx="11.5" ry="8.5" />
        {both(<ellipse className="nostril" cx="28" cy="44" rx="1.3" ry="1.7" />)}
      </>
    ),
  },
  giraffe: {
    eyeY: 27,
    eyeDx: 7,
    mouthY: 48.5,
    back: (
      <>
        {both(
          <>
            <path className="skin" d="M23.4 15 L22.8 6 L26.2 6 L27.8 14 Z" />
            <circle className="dark" cx="24.4" cy="4.6" r="2.7" />
            <ellipse className="skin" cx="13" cy="20" rx="7" ry="3.8" transform="rotate(-18 13 20)" />
          </>,
        )}
      </>
    ),
    head: (
      <>
        <ellipse className="skin" cx="32" cy="30" rx="14" ry="18" />
        <path className="patch" d="M22.5 15.5 Q26 12.5 28.5 15.5 Q28 19.5 24 19.5 Q21.5 18 22.5 15.5 Z" />
        <path className="patch" d="M36 13.5 Q40 12.5 41.5 16 Q40 19 37 18 Q35 16 36 13.5 Z" />
        <circle className="patch" cx="20.3" cy="35.5" r="2.3" />
        <circle className="patch" cx="43.8" cy="35" r="2.5" />
        <circle className="patch" cx="32" cy="18" r="1.9" />
        <ellipse className="muzzle" cx="32" cy="45.5" rx="12" ry="9" />
        {both(<ellipse className="nostril" cx="28" cy="43" rx="1.2" ry="1.6" />)}
      </>
    ),
  },
  rhino: {
    eyeY: 27.5,
    eyeDx: 9.5,
    mouthY: 51,
    back: both(
      <>
        <ellipse className="skin" cx="19" cy="11.5" rx="4.6" ry="6.6" transform="rotate(-16 19 11.5)" />
        <ellipse className="inner" cx="19.3" cy="12.2" rx="2" ry="3.6" transform="rotate(-16 19 11.5)" />
      </>,
    ),
    head: (
      <>
        <ellipse className="skin" cx="32" cy="30" rx="16.5" ry="18.5" />
        <ellipse className="muzzle" cx="32" cy="46.5" rx="14.5" ry="10" />
        {both(<ellipse className="nostril" cx="24.5" cy="46.5" rx="1.3" ry="1.8" />)}
      </>
    ),
    front: (
      <>
        <path className="horn" d="M29.6 27 Q32 18.5 34.4 27 Q32 28.6 29.6 27 Z" />
        <path className="horn" d="M26.8 43.5 Q30.5 23 32 23 Q33.5 23 37.2 43.5 Q32 46.6 26.8 43.5 Z" />
      </>
    ),
  },
  hippo: {
    eyeY: 24.5,
    eyeDx: 7.5,
    mouthY: 50,
    back: both(
      <>
        <circle className="skin" cx="19" cy="13" r="4.7" />
        <circle className="inner" cx="19" cy="13.4" r="2.1" />
      </>,
    ),
    head: (
      <>
        <ellipse className="skin" cx="32" cy="28" rx="15" ry="15.5" />
        <ellipse className="muzzle" cx="32" cy="44.5" rx="19" ry="12.5" />
        {both(<ellipse className="nostril" cx="25" cy="38.5" rx="1.9" ry="2.5" />)}
        {both(<rect className="tooth" x="24.2" y="50.4" width="3.4" height="3.8" rx="1.1" />)}
      </>
    ),
  },
  buffalo: {
    eyeY: 28,
    eyeDx: 7,
    mouthY: 49,
    back: both(
      <>
        <path className="horn" d="M20 17 Q3 18 5 3 Q10 11.5 22 11 Z" />
        <ellipse className="skin" cx="12.5" cy="25" rx="6" ry="3.5" transform="rotate(14 12.5 25)" />
      </>,
    ),
    head: (
      <>
        <ellipse className="skin" cx="32" cy="30.5" rx="14.5" ry="18" />
        <path className="dark" d="M25.5 15 Q32 7.5 38.5 15 Q35.5 13.5 32 17.5 Q28.5 13.5 25.5 15 Z" />
        <ellipse className="muzzle" cx="32" cy="46" rx="12" ry="9" />
        {both(<ellipse className="nostril" cx="27.6" cy="43.6" rx="1.4" ry="1.8" />)}
      </>
    ),
  },
};

function Face({ look, mood }: { look: Look; mood: CritterMood }) {
  const { eyeY, eyeDx, mouthY } = look;
  const eyes = [32 - eyeDx, 32 + eyeDx];
  const mouth =
    mood === 'happy'
      ? `M27 ${mouthY - 1} Q32 ${mouthY + 5} 37 ${mouthY - 1}`
      : mood === 'worried'
        ? `M27.5 ${mouthY + 2} Q32 ${mouthY - 2.6} 36.5 ${mouthY + 2}`
        : `M28 ${mouthY} Q32 ${mouthY + 1.8} 36 ${mouthY}`;

  return (
    <>
      {eyes.map((cx, index) =>
        mood === 'happy' ? (
          <path
            key={cx}
            className="line"
            d={`M${cx - 4} ${eyeY + 1.5} Q${cx} ${eyeY - 4.5} ${cx + 4} ${eyeY + 1.5}`}
          />
        ) : (
          <g key={cx}>
            <circle className="eyeball" cx={cx} cy={eyeY} r="4.7" />
            <circle className="pupil" cx={cx} cy={eyeY + 0.4} r="2.5" />
            <circle className="glint" cx={cx + 0.9} cy={eyeY - 0.7} r="0.85" />
            <ellipse className="lid" cx={cx} cy={eyeY} rx="5.2" ry="5.2" />
            {mood === 'worried' && (
              <path
                className="line"
                d={
                  index === 0
                    ? `M${cx - 4.5} ${eyeY - 6.6} L${cx + 3} ${eyeY - 9}`
                    : `M${cx + 4.5} ${eyeY - 6.6} L${cx - 3} ${eyeY - 9}`
                }
              />
            )}
          </g>
        ),
      )}
      {mood === 'happy' &&
        eyes.map((cx, index) => (
          <circle key={cx} className="blush" cx={cx + (index === 0 ? -3 : 3)} cy={eyeY + 7} r="2.4" />
        ))}
      <path className="line" d={mouth} />
    </>
  );
}

interface Props {
  species: Species;
  mood?: CritterMood;
  size?: number;
  /** Staggers blinking and swaying so a row of characters does not move in unison. */
  delay?: number;
}

/** A cartoon animal head standing in for one of the people in a scenario. */
export function Critter({ species, mood = 'neutral', size = 48, delay = 0 }: Props) {
  const look = LOOKS[species];
  return (
    <span
      className={`toon critter critter--${species} is-${mood}`}
      style={{ width: size, height: size, '--delay': `${delay}s` } as CSSProperties}
    >
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle className="badge" cx="32" cy="33" r="30" />
        <g className="critter-head">
          {look.back}
          {look.head}
          <Face look={look} mood={mood} />
          {look.front}
        </g>
      </svg>
    </span>
  );
}
