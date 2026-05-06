interface Props {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  withGlow?: boolean
}

const sizeMap = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-4xl',
  xl: 'text-6xl',
}

/**
 * Agora wordmark — Fraunces, low-contrast italic for the dotless 'i' tail
 * effect, gold-painted 'a' bookends. The doubled 'a' is the anchor of the
 * mark (Greek public square — a place where the family meets).
 */
export function Wordmark({ size = 'md', withGlow = false }: Props) {
  return (
    <span
      className={`relative inline-flex items-baseline font-display font-medium tracking-tight ${sizeMap[size]}`}
      style={{ color: 'var(--heading)' }}
    >
      {withGlow && (
        <span
          aria-hidden
          className="absolute -inset-3 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at center, var(--gold-300) 0%, transparent 70%)',
            filter: 'blur(14px)',
            opacity: 0.55,
          }}
        />
      )}
      <span className="relative" style={{ color: 'var(--accent-text)' }}>
        a
      </span>
      <span className="relative">gor</span>
      <span className="relative" style={{ color: 'var(--accent-text)' }}>
        a
      </span>
    </span>
  )
}
