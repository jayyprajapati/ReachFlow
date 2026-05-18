import React from 'react';

export default function ProgressRing({
  percent = 0,
  size = 36,
  strokeWidth = 3,
  color = 'var(--rf-accent)',
  track = 'var(--rf-border)',
  children,
}) {
  const r = (size - strokeWidth * 2) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(Math.max(percent, 0), 100) / 100);
  const mid = size / 2;

  return (
    <div className="rml-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ display: 'block' }}>
        <circle cx={mid} cy={mid} r={r} fill="none" stroke={track} strokeWidth={strokeWidth} />
        <circle
          cx={mid} cy={mid} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={off}
          strokeLinecap="round"
          transform={`rotate(-90 ${mid} ${mid})`}
          style={{ transition: 'stroke-dashoffset 0.55s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      {children && <div className="rml-ring__inner">{children}</div>}
    </div>
  );
}
