import janusReference from '../assets/janus-symbol-reference.png'

interface LogoProps { size?: number; className?: string }

// Original uploaded image; the viewport crops padding without changing its pixels.
export function JanusSymbol({ size = 40, className = '' }: LogoProps) {
  return (
    <svg width={size} height={size * 450 / 490} viewBox="124 82 490 450"
      className={`shrink-0 ${className}`} role="img" aria-label="JANUS symbol">
      <image href={janusReference} width="744" height="558" />
    </svg>
  )
}

export function JanusWordmark({ size = 32, className = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span aria-hidden="true"><JanusSymbol size={size} /></span>
      <span style={{ fontSize: Math.round(size * 0.55), color: '#F1F3F2',
        letterSpacing: '0.18em', fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 600, lineHeight: 1 }}>JANUS</span>
    </span>
  )
}
