export default function PaymentReturnPage() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1>Payment received</h1>
        <p>Thanks. SafePay is confirming your payment. The status in your workspace updates within a few moments.</p>
        <a href="/">Back to workspace</a>
      </section>
    </main>
  );
}
