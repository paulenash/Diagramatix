export default function TestPage() {
  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Hello World!</h1>
      <p>If you can see this, Next.js is working.</p>
      <p>Time: {new Date().toISOString()}</p>
    </div>
  );
}
