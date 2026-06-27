/**
 * Streaming skeleton shown by Next.js while page.tsx awaits auth().
 * Mirrors the visual structure: gradient hero header + tab bar + skeleton rows.
 */

export default function AdminLoading() {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-brand-ivory)', paddingBottom: '80px' }}>
      {/* Hero Header skeleton */}
      <div style={{
        background: 'linear-gradient(135deg, var(--color-brand-charcoal) 0%, var(--color-brand-mauve) 50%, var(--color-brand-mauve-deep) 100%)',
        padding: '60px 24px 0',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{
          position: 'absolute', top: '-60px', right: '-60px',
          width: '300px', height: '300px', borderRadius: '50%',
          background: 'rgba(166,128,38,0.08)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-40px', left: '-40px',
          width: '200px', height: '200px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)', pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative' }}>
          {/* Breadcrumb placeholder */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
            <div style={{ width: '48px', height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.12)' }} />
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
            <div style={{ width: '40px', height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.12)' }} />
          </div>

          {/* Title Row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '24px', paddingBottom: '32px' }}>
            {/* Avatar skeleton */}
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.12)',
            }} />
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ width: '80px', height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.15)', marginBottom: '10px' }} />
              <div style={{ width: '220px', height: '32px', borderRadius: '6px', background: 'rgba(255,255,255,0.12)', marginBottom: '10px' }} />
              <div style={{ width: '160px', height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)' }} />
            </div>
          </div>

          {/* Tab bar skeleton */}
          <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.08)', marginTop: '8px', overflowX: 'auto' }}>
            {[100, 80, 110, 75, 68, 72, 65, 60].map((w, i) => (
              <div
                key={i}
                style={{
                  width: `${w}px`, height: '44px', margin: '0 2px',
                  borderRadius: '4px 4px 0 0',
                  background: i === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                background: 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 4px 24px rgba(15,42,91,0.06)',
              }}
            >
              <div style={{ width: '60%', height: '9px', borderRadius: '4px', background: 'rgba(15,42,91,0.08)', marginBottom: '14px' }} />
              <div style={{ width: '45%', height: '28px', borderRadius: '6px', background: 'rgba(15,42,91,0.1)', marginBottom: '10px' }} />
              <div style={{ width: '55%', height: '9px', borderRadius: '4px', background: 'rgba(15,42,91,0.06)' }} />
            </div>
          ))}
        </div>

        {/* Quick actions skeleton */}
        <div style={{
          background: 'rgba(255,255,255,0.55)',
          border: '1px solid rgba(255,255,255,0.35)',
          borderRadius: '12px',
          padding: '28px',
          boxShadow: '0 4px 24px rgba(15,42,91,0.06)',
        }}>
          <div style={{ width: '130px', height: '18px', borderRadius: '5px', background: 'rgba(15,42,91,0.09)', marginBottom: '22px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ padding: '16px 18px', borderRadius: '8px', background: 'rgba(15,42,91,0.04)', border: '1px solid rgba(15,42,91,0.07)' }}>
                <div style={{ width: '70%', height: '10px', borderRadius: '4px', background: 'rgba(15,42,91,0.09)', marginBottom: '8px' }} />
                <div style={{ width: '85%', height: '9px', borderRadius: '4px', background: 'rgba(15,42,91,0.06)' }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes admin-shimmer {
          0%   { opacity: 1; }
          50%  { opacity: 0.6; }
          100% { opacity: 1; }
        }
        /* Apply shimmer to all skeleton blocks inside this loading screen */
        main > div > div > div,
        main > div[style*="maxWidth"] div > div {
          animation: admin-shimmer 1.6s ease-in-out infinite;
        }
      `}</style>
    </main>
  );
}
