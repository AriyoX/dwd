export default function Loading() {
  return (
    <main
      id="main-content"
      className="page-shell loading-shell"
      role="status"
      aria-label="Loading your night"
    >
      <div className="skeleton" style={{ height: 40, width: 160 }} />
      <div className="skeleton" style={{ height: 64, width: '75%' }} />
      <div className="skeleton" style={{ height: 220 }} />
      <div className="skeleton" style={{ height: 90 }} />
      <span className="muted small">Loading your night…</span>
    </main>
  );
}
