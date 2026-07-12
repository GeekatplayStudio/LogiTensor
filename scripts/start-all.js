const { spawn } = require("child_process");
const net = require("net");
const path = require("path");

const isDev = process.argv.includes("--dev");

// Check if port is in use
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      resolve(true); // Port in use
    });
    server.once("listening", () => {
      server.close();
      resolve(false); // Port free
    });
    server.listen(port, "127.0.0.1");
  });
}

async function main() {
  console.log("=========================================");
  console.log("       Starting LogiBoard Canvas Stack   ");
  console.log("=========================================\n");

  // 1. Check & start Python FastAPI backend on port 8000
  const isBackendRunning = await checkPort(8000);
  let backendProcess = null;

  if (!isBackendRunning) {
    console.log("[Backend] FastAPI not running. Starting server inside virtual environment...");
    const venvPath = path.join(__dirname, "..", "backend", ".venv");
    
    // Select path to Python executable inside .venv
    const pythonExe = process.platform === "win32"
      ? path.join(venvPath, "Scripts", "python.exe")
      : path.join(venvPath, "bin", "python");

    const uvicornArgs = ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"];

    backendProcess = spawn(pythonExe, uvicornArgs, {
      cwd: path.join(__dirname, ".."),
      stdio: "pipe",
      shell: true,
    });

    backendProcess.stdout.on("data", (data) => {
      process.stdout.write(`[Backend] ${data}`);
    });

    backendProcess.stderr.on("data", (data) => {
      process.stderr.write(`[Backend Logs] ${data}`);
    });
    
    console.log("✓ Backend startup initiated.\n");
  } else {
    console.log("✓ Backend is already running on port 8000. Skipping launch.\n");
  }

  // 2. Start Next.js Frontend on port 3000
  console.log(`[Frontend] Launching Next.js (${isDev ? "Development" : "Production"} Mode)...`);
  const frontendCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const frontendArgs = isDev ? ["next", "dev"] : ["next", "start"];

  const frontendProcess = spawn(frontendCmd, frontendArgs, {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    shell: true,
  });

  // Graceful shutdown helper
  const cleanUp = () => {
    console.log("\nShutting down LogiBoard stack...");
    if (backendProcess) {
      backendProcess.kill();
      console.log("✓ Backend server terminated.");
    }
    frontendProcess.kill();
    console.log("✓ Frontend server terminated.");
    process.exit(0);
  };

  process.on("SIGINT", cleanUp);
  process.on("SIGTERM", cleanUp);

  frontendProcess.on("exit", (code) => {
    console.log(`[Frontend] process exited with code ${code}`);
    cleanUp();
  });
}

main().catch((err) => {
  console.error("✗ Failed to start LogiBoard stack:", err);
});
