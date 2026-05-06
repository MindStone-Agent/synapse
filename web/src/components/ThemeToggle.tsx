import { useTheme } from '../lib/theme'

/**
 * Theme toggle — sun/moon glyph, gold-tinted on hover. No animation
 * other than the transition; the toggle itself is the moment.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
      style={{
        color: 'var(--text)',
      }}
    >
      <span
        className="absolute inset-0 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: 'var(--accent-soft)' }}
      />
      {isDark ? (
        <svg
          className="relative h-4.5 w-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="18"
          height="18"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg
          className="relative h-4.5 w-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="18"
          height="18"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  )
}
