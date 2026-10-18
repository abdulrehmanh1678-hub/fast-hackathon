export default function PaymentCancelPage() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1>Payment cancelled</h1>
        <p>No charge was made. You can go back and try again whenever you are ready.</p>
        <a href="/">Back to workspace</a>
      </section>
    </main>
  );
}
