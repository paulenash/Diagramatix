import pg from "pg";

export default async function TestDb2Page() {
  let result = "not tested";
  try {
    const pool = new pg.Pool({
      connectionString: "postgres://postgres:postgres@localhost:5432/diagramatix",
      max: 1
    });
    const r = await pool.query('SELECT email, name FROM "User"');
    result = JSON.stringify(r.rows);
    await pool.end();
  } catch (e) {
    result = "ERROR: " + (e instanceof Error ? e.message : String(e));
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Direct PG Test</h1>
      <p>Users: {result}</p>
    </div>
  );
}
