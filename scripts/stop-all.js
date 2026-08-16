const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RUN_FILE = path.join(__dirname, ".run.json");

function killTree(pid) {
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { shell: true });
    return result.status === 0;
  }
  try {
    process.kill(-pid, "SIGTERM");
    return true;
  } catch (e) {
    try {
      process.kill(pid, "SIGTERM");
      return true;
    } catch (e2) {
      return false;
    }
  }
}

function main() {
  if (!fs.existsSync(RUN_FILE)) {
    console.log("No running LogiTensor stack found (nothing to stop).");
    return;
  }

  const state = JSON.parse(fs.readFileSync(RUN_FILE, "utf8"));

  if (state.backend) {
    const ok = killTree(state.backend.pid);
    console.log(
      ok
        ? `✓ Backend server (pid ${state.backend.pid}, port ${state.backend.port}) terminated.`
        : `! Backend server (pid ${state.backend.pid}) was not running.`
    );
  }

  if (state.frontend) {
    const ok = killTree(state.frontend.pid);
    console.log(
      ok
        ? `✓ Frontend server (pid ${state.frontend.pid}, port ${state.frontend.port}) terminated.`
        : `! Frontend server (pid ${state.frontend.pid}) was not running.`
    );
  }

  fs.unlinkSync(RUN_FILE);
  console.log("\nLogiTensor stack stopped.");
}

main();
