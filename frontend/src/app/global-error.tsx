'use client';

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, where the normal
 * error.tsx never gets a chance to render. It replaces <html>/<body>, so it cannot rely on
 * providers, fonts, or theme classes — hence the inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          background: '#fdfcfa',
          color: '#251f1c',
          padding: '1.5rem',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Application error
          </h1>
          <p style={{ color: '#6b615c', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            PawfectHome failed to load. Please refresh the page.
          </p>
          {error.digest ? (
            <p style={{ color: '#9a8f89', fontSize: '0.75rem', marginBottom: '1rem' }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              background: 'linear-gradient(135deg, #ff6b5b 0%, #ffa94d 100%)',
              color: '#fff',
              border: 0,
              borderRadius: 12,
              padding: '0.65rem 1.4rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
