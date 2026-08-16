const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const isDev = process.argv.includes("--dev");
const RUN_FILE = path.join(__dirname, ".run.json");

function writeRunFile(backend, frontend) {
  fs.writeFileSync(
    RUN_FILE,
    JSON.stringify(
      {
        backend: { pid: backend.process.pid, port: backend.port },
        frontend: { pid: frontend.process.pid, port: frontend.port },
      },
      null,
      2
    )
  );
}

function removeRunFile() {
  try {
    fs.unlinkSync(RUN_FILE);
  } catch (e) {
    // Already gone.
  }
}

// spawn() with shell:true wraps the real server in a shell (and, on Windows,
// npx.cmd chains a cmd.exe wrapper too), so proc.kill() only kills that
// wrapper and leaves the actual server running. Kill the whole process tree.
function killTree(pid) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", shell: true });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch (e) {
      try {
        process.kill(pid, "SIGTERM");
      } catch (e2) {
        // Already gone.
      }
    }
  }
}

// Starts the FastAPI backend, retrying on the next port up whenever the
// chosen one is actually taken. We don't pre-probe the port with a throwaway
// socket — probes bind a different address family/host than uvicorn does and
// can report a false "free" (e.g. an orphaned uvicorn left over from a prior
// run, or a socket bound to 127.0.0.1 only). Trying the real bind and reading
// its own error is the only reliable signal.
function startBackend(startPort, maxAttempts = 20) {
  return new Promise((resolve, reject) => {
    const venvPath = path.join(__dirname, "..", "backend", ".venv");
    const pythonExe = process.platform === "win32"
      ? path.join(venvPath, "Scripts", "python.exe")
      : path.join(venvPath, "bin", "python");

    const tryPort = (port, attemptsLeft) => {
      if (attemptsLeft <= 0) {
        reject(new Error(`No available backend port found starting at ${startPort}`));
        return;
      }

      console.log(`[Backend] Starting server inside virtual environment on port ${port}...`);
      const uvicornArgs = ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", String(port)];
      const proc = spawn(pythonExe, uvicornArgs, {
        cwd: path.join(__dirname, ".."),
        stdio: "pipe",
        shell: true,
        detached: process.platform !== "win32",
      });

      let settled = false;

      const onBindError = () => {
        if (settled) return;
        settled = true;
        proc.kill();
        console.log(`⚠ Port ${port} is already in use. Trying port ${port + 1}...`);
        tryPort(port + 1, attemptsLeft - 1);
      };

      proc.stdout.on("data", (data) => {
        process.stdout.write(`[Backend] ${data}`);
        if (!settled && /application startup complete/i.test(data.toString())) {
          settled = true;
          console.log(`✓ Backend running on port ${port}.\n`);
          resolve({ process: proc, port });
        }
      });

      proc.stderr.on("data", (data) => {
        process.stderr.write(`[Backend Logs] ${data}`);
        const text = data.toString();
        if (/address already in use|only one usage of each socket address|10048|eaddrinuse/i.test(text)) {
          onBindError();
        } else if (!settled && /application startup complete/i.test(text)) {
          settled = true;
          console.log(`✓ Backend running on port ${port}.\n`);
          resolve({ process: proc, port });
        }
      });

      proc.on("exit", (code) => {
        if (!settled && code !== 0) {
          settled = true;
          reject(new Error(`Backend process exited early with code ${code}`));
        }
      });
    };

    tryPort(startPort, maxAttempts);
  });
}

// Starts the Next.js frontend, retrying on the next port up when the chosen
// one is taken (same actual-bind-and-retry approach as the backend, since
// Next reports EADDRINUSE on stderr/stdout rather than exiting cleanly).
function startFrontend(startPort, backendPort, maxAttempts = 20) {
  return new Promise((resolve, reject) => {
    const frontendCmd = process.platform === "win32" ? "npx.cmd" : "npx";

    const tryPort = (port, attemptsLeft) => {
      if (attemptsLeft <= 0) {
        reject(new Error(`No available frontend port found starting at ${startPort}`));
        return;
      }

      console.log(`[Frontend] Launching Next.js (${isDev ? "Development" : "Production"} Mode) on port ${port}...`);
      const args = (isDev ? ["next", "dev"] : ["next", "start"]).concat(["-p", String(port)]);
      const proc = spawn(frontendCmd, args, {
        cwd: path.join(__dirname, ".."),
        stdio: "pipe",
        shell: true,
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          NEXT_PUBLIC_API_URL: `http://localhost:${backendPort}`,
        },
      });

      let settled = false;

      const onBindError = () => {
        if (settled) return;
        settled = true;
        proc.kill();
        console.log(`⚠ Port ${port} is already in use. Trying port ${port + 1}...`);
        tryPort(port + 1, attemptsLeft - 1);
      };

      const onData = (data) => {
        process.stdout.write(data);
        const text = data.toString();
        if (/eaddrinuse|address already in use|only one usage of each socket address|10048/i.test(text)) {
          onBindError();
        } else if (!settled && /(ready in|started server)/i.test(text)) {
          settled = true;
          console.log(`✓ Frontend running on port ${port}.\n`);
          resolve({ process: proc, port });
        }
      };

      proc.stdout.on("data", onData);
      proc.stderr.on("data", onData);

      proc.on("exit", (code) => {
        if (!settled && code !== 0) {
          settled = true;
          reject(new Error(`Frontend process exited early with code ${code}`));
        }
      });
    };

    tryPort(startPort, maxAttempts);
  });
}

async function main() {
  console.log("=========================================");
  console.log("       Starting LogiTensor Canvas Stack   ");
  console.log("=========================================\n");

  const backend = await startBackend(8000);
  const frontend = await startFrontend(3000, backend.port);

  writeRunFile(backend, frontend);
  console.log(`(Run 'npm run stop' from another terminal to shut this stack down.)\n`);

  // Graceful shutdown helper
  const cleanUp = () => {
    console.log("\nShutting down LogiTensor stack...");
    killTree(backend.process.pid);
    console.log("✓ Backend server terminated.");
    killTree(frontend.process.pid);
    console.log("✓ Frontend server terminated.");
    removeRunFile();
    process.exit(0);
  };

  process.on("SIGINT", cleanUp);
  process.on("SIGTERM", cleanUp);

  frontend.process.on("exit", (code) => {
    console.log(`[Frontend] process exited with code ${code}`);
    cleanUp();
  });
}

main().catch((err) => {
  console.error("✗ Failed to start LogiTensor stack:", err);
  removeRunFile();
  process.exit(1);
});
