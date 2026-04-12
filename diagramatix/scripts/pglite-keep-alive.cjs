// Auto-restarting PGlite socket server wrapper
const { spawn } = require("child_process");
const path = require("path");

const DB_PATH = "C:/Users/paul/AppData/Local/prisma-dev-nodejs/Data/default/.pglite";
const PORT = 51214;

function startServer() {
  console.log(`[${new Date().toISOString()}] Starting PGlite on port ${PORT}...`);

  const child = spawn(
    process.execPath,
    ["-e", `
      const { PGlite } = require('@electric-sql/pglite');
      const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
      async function start() {
        const db = new PGlite('${DB_PATH.replace(/\\/g, "/")}');
        await db.waitReady;
        const server = new PGLiteSocketServer(db, { port: ${PORT}, host: '0.0.0.0' });
        await server.start();
        console.log('PGlite listening on ${PORT}');
      }
      start().catch(e => { console.error(e.message); process.exit(1); });
    `],
    { stdio: "inherit", cwd: path.resolve(__dirname, "..") }
  );

  child.on("exit", (code) => {
    console.log(`[${new Date().toISOString()}] PGlite exited (code ${code}). Restarting in 1s...`);
    setTimeout(startServer, 1000);
  });
}

startServer();
