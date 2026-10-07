import mark from '../lib/logoMark.json';

/**
 * Namin mark: a roof over an open wall, a heart inside and a dot closing the base line.
 * One colour (currentColor by default), so it works on any background. No text.
 */
export function Logo({ height = 36, color = 'currentColor', className }: { height?: number; color?: string; className?: string }) {
  const [x, y, w, h] = mark.viewBox;
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} height={height} width={(height * w) / h} className={className} role="img" aria-label="Namin" fill="none">
      <g stroke={color} strokeWidth={mark.stroke} strokeLinecap="round" strokeLinejoin="round">
        {mark.strokes.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <circle cx={mark.dot.cx} cy={mark.dot.cy} r={mark.dot.r} fill={color} />
      <path d={mark.heart} fill={color} />
    </svg>
  );
}
