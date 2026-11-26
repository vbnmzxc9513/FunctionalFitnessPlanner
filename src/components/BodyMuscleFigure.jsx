function muscleFill(level) {
  if (level >= 3) return '#0369a1';
  if (level === 2) return '#0284c7';
  if (level === 1) return '#7dd3fc';
  return '#edf2f7';
}

function muscleStroke(level, selected) {
  if (selected) return '#0c4a6e';
  if (level >= 2) return '#0369a1';
  if (level === 1) return '#0284c7';
  return '#cbd5e1';
}

/**
 * Interactive Front / Back anatomical muscle heatmap silhouette.
 * Shared across Plan coverage preview and Records actual-trained analytics.
 */
export default function BodyMuscleFigure({
  side,
  muscleByKey,
  selectedKey,
  onSelect,
  label,
  getLevel = item => item?.intensity ?? item?.days ?? 0,
  getAriaLabel = item => `${item.label} ${item.count ?? item.days ?? 0}`,
}) {
  const regionProps = key => {
    const item = muscleByKey[key] || { key, label: key, days: 0, count: 0, intensity: 0 };
    const level = getLevel(item);
    const selected = selectedKey === key;
    return {
      role: 'button',
      tabIndex: 0,
      'aria-label': getAriaLabel(item),
      'aria-pressed': selected,
      'data-muscle': key,
      className: `muscle-region ${selected ? 'is-selected' : ''}`,
      fill: muscleFill(level),
      stroke: muscleStroke(level, selected),
      strokeWidth: selected ? 2.2 : 1.15,
      onClick: () => onSelect(key),
      onKeyDown: event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(key);
        }
      },
    };
  };

  return (
    <div className="muscle-figure-col">
      <span className="muscle-figure-caption">{label}</span>
      <svg viewBox="0 0 120 228" className="muscle-figure-svg" aria-label={label}>
        {/* Neutral head & neck silhouette */}
        <circle cx="60" cy="20" r="12.5" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.2" />
        <rect x="54.5" y="32" width="11" height="9" rx="4" fill="#e2e8f0" />
        {/* Neutral hands & feet */}
        <ellipse cx="18.5" cy="121" rx="4.5" ry="6.5" fill="#e2e8f0" />
        <ellipse cx="101.5" cy="121" rx="4.5" ry="6.5" fill="#e2e8f0" />
        <ellipse cx="47.5" cy="216" rx="7.5" ry="4.5" fill="#e2e8f0" />
        <ellipse cx="72.5" cy="216" rx="7.5" ry="4.5" fill="#e2e8f0" />

        {side === 'front' ? (
          <>
            {/* Shoulders (Front delts) */}
            <g {...regionProps('shoulder')}>
              <path d="M36 41 C28 42 23 48 23 57 C23 61 27 63 32 62 C35 58 37 52 38 44 Z" />
              <path d="M84 41 C92 42 97 48 97 57 C97 61 93 63 88 62 C85 58 83 52 82 44 Z" />
            </g>
            {/* Chest */}
            <g {...regionProps('chest')}>
              <path d="M39 44 Q49 42 59 46 L59 68 Q48 70 39 65 Q37 55 39 44 Z" />
              <path d="M81 44 Q71 42 61 46 L61 68 Q72 70 81 65 Q83 55 81 44 Z" />
            </g>
            {/* Arms & forearms */}
            <g {...regionProps('arms')}>
              <path d="M23 60 L32 62 L29 89 L20 88 Z" />
              <path d="M20 90 L28 91 L23 115 L15 114 Z" />
              <path d="M97 60 L88 62 L91 89 L100 88 Z" />
              <path d="M100 90 L92 91 L97 115 L105 114 Z" />
            </g>
            {/* Core / Abs */}
            <g {...regionProps('core')}>
              <path d="M41 69 Q60 72 79 69 L76 106 Q60 112 44 106 Z" />
            </g>
            {/* Quads / Front thighs */}
            <g {...regionProps('quads')}>
              <path d="M42 110 Q51 113 58 113 L56 161 Q47 163 40 158 Q38 134 42 110 Z" />
              <path d="M78 110 Q69 113 62 113 L64 161 Q73 163 80 158 Q82 134 78 110 Z" />
            </g>
            {/* Calves / Shins / Ankles */}
            <g {...regionProps('calves')}>
              <path d="M41 164 Q49 166 55 164 L53 209 L44 209 Q39 188 41 164 Z" />
              <path d="M79 164 Q71 166 65 164 L67 209 L76 209 Q81 188 79 164 Z" />
            </g>
          </>
        ) : (
          <>
            {/* Rear shoulders / upper traps */}
            <g {...regionProps('shoulder')}>
              <path d="M48 39 L60 36 L72 39 L84 42 C92 43 97 49 97 58 C93 61 88 61 84 58 L77 49 L43 49 L36 58 C32 61 27 61 23 58 C23 49 28 43 36 42 Z" />
            </g>
            {/* Upper & Mid Back / Lats */}
            <g {...regionProps('back')}>
              <path d="M38 52 L82 52 L77 101 Q60 105 43 101 Z" />
            </g>
            {/* Rear Arms */}
            <g {...regionProps('arms')}>
              <path d="M23 60 L32 62 L29 89 L20 88 Z" />
              <path d="M20 90 L28 91 L23 115 L15 114 Z" />
              <path d="M97 60 L88 62 L91 89 L100 88 Z" />
              <path d="M100 90 L92 91 L97 115 L105 114 Z" />
            </g>
            {/* Glutes */}
            <g {...regionProps('glutes')}>
              <path d="M42 103 Q51 106 59 105 L59 128 Q47 132 39 124 Q38 112 42 103 Z" />
              <path d="M78 103 Q69 106 61 105 L61 128 Q73 132 81 124 Q82 112 78 103 Z" />
            </g>
            {/* Hamstrings */}
            <g {...regionProps('hamstrings')}>
              <path d="M40 128 Q49 133 58 130 L56 161 Q47 163 41 159 Z" />
              <path d="M80 128 Q71 133 62 130 L64 161 Q73 163 79 159 Z" />
            </g>
            {/* Calves */}
            <g {...regionProps('calves')}>
              <path d="M41 164 Q49 166 55 164 L53 209 L44 209 Q38 186 41 164 Z" />
              <path d="M79 164 Q71 166 65 164 L67 209 L76 209 Q82 186 79 164 Z" />
            </g>
          </>
        )}
      </svg>
    </div>
  );
}
