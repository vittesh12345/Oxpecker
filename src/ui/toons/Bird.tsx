export type BirdMood = 'idle' | 'wave' | 'cover' | 'cheer' | 'point' | 'think' | 'sad' | 'sleep';

function Eye({ cx, smiling }: { cx: number; smiling: boolean }) {
  if (smiling) {
    return <path className="bird-smile-eye" d={`M${cx - 6} 44 Q${cx} 35 ${cx + 6} 44`} />;
  }
  return (
    <g className="bird-eye">
      <circle className="bird-eyeball" cx={cx} cy="42" r="8.5" />
      <g className="bird-pupil">
        <circle className="bird-iris" cx={cx} cy="42.5" r="4.4" />
        <circle className="bird-glint" cx={cx + 1.6} cy="40.7" r="1.4" />
      </g>
      <ellipse className="bird-lid" cx={cx} cy="42" rx="9.2" ry="9.2" />
      <circle className="bird-ring" cx={cx} cy="42" r="9" />
    </g>
  );
}

/**
 * The mascot: a red-billed oxpecker, drawn front-on. Its pose is set by a
 * class so the stylesheet can hold the pose still or animate it.
 */
export function Bird({ mood = 'idle', size = 96 }: { mood?: BirdMood; size?: number }) {
  return (
    <svg
      className={`toon bird bird--${mood}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse className="bird-shadow" cx="60" cy="110" rx="25" ry="4" />
      <g className="bird-all">
        <path className="bird-tail" d="M41 90 L21 104 L46 101 Z" />
        <path className="bird-feet" d="M51 100 V107 M46 108 H56 M69 100 V107 M64 108 H74" />
        <ellipse className="bird-body" cx="60" cy="78" rx="27" ry="24" />
        <ellipse className="bird-belly" cx="60" cy="85" rx="17" ry="14.5" />
        <g className="bird-head">
          <path className="bird-tuft" d="M54 23 Q55 13 59 21 Q61 11 64 21 Q67 14 67 24" />
          <circle className="bird-skull" cx="60" cy="44" r="23" />
          <circle className="bird-cheek" cx="41" cy="54" r="4" />
          <circle className="bird-cheek" cx="79" cy="54" r="4" />
          <Eye cx={49} smiling={mood === 'cheer'} />
          <Eye cx={71} smiling={mood === 'cheer'} />
          <path className="bird-bill" d="M51 51 Q60 44 69 51 Q65 60 60 64 Q55 60 51 51 Z" />
          <path className="bird-bill-tip" d="M55.4 58 Q60 60 64.6 58 Q62.5 61.5 60 63 Q57.5 61.5 55.4 58 Z" />
        </g>
        <g className="bird-wing bird-wing-l">
          <ellipse cx="34" cy="77" rx="8.5" ry="15" />
        </g>
        <g className="bird-wing bird-wing-r">
          <ellipse cx="86" cy="77" rx="8.5" ry="15" />
        </g>
        {mood === 'sleep' && (
          <g className="bird-zzz">
            <text x="88" y="30">z</text>
            <text x="97" y="19">z</text>
          </g>
        )}
        {mood === 'think' && (
          <g className="bird-dots">
            <circle cx="90" cy="24" r="2.6" />
            <circle cx="99" cy="17" r="3.4" />
            <circle cx="110" cy="9" r="4.4" />
          </g>
        )}
      </g>
    </svg>
  );
}
