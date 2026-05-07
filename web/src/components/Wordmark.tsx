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
 * Synapse wordmark — Fraunces, with the bookend `s` and `e` painted gold,
 * and a tiny gold "synaptic gap" dot between `syn` and `apse`. The neural
 * metaphor (signal jumping the gap) earns the dot.
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
        s
      </span>
      <span className="relative">yn</span>
      <span
        aria-hidden
        className="relative inline-block mx-[0.05em] -translate-y-[0.18em]"
        style={{
          width: '0.18em',
          height: '0.18em',
          borderRadius: '999px',
          background: 'var(--accent-text)',
        }}
      />
      <span className="relative">aps</span>
      <span className="relative" style={{ color: 'var(--accent-text)' }}>
        e
      </span>
    </span>
  )
}
