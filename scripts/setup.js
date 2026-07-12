const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("=========================================");
console.log("       LogiTensor Development Setup       ");
console.log("=========================================\n");

// 1. Install Node.js dependencies
try {
  console.log("[1/4] Checking Node.js dependencies...");
  execSync("npm install", { stdio: "inherit" });
  console.log("✓ Node.js dependencies check completed.\n");
} catch (err) {
  console.error("✗ Failed to install Node.js dependencies:", err.message);
}

// 2. Setup Python virtual environment
let pythonCmd = "python";
try {
  execSync("python --version", { stdio: "ignore" });
} catch (e) {
  try {
    execSync("py --version", { stdio: "ignore" });
    pythonCmd = "py";
  } catch (err) {
    console.warn("\n[Warning] Python was not found on your system PATH. Please install Python 3.10+.");
    pythonCmd = null;
  }
}

if (pythonCmd) {
  try {
    const venvPath = path.join(__dirname, "..", "backend", ".venv");
    console.log(`[2/4] Setting up Python virtual environment at '${venvPath}'...`);
    
    if (!fs.existsSync(venvPath)) {
      execSync(`${pythonCmd} -m venv "${venvPath}"`, { stdio: "inherit" });
      console.log("✓ Virtual environment created successfully.\n");
    } else {
      console.log("✓ Virtual environment already exists. Skipping creation.\n");
    }
    
    console.log("[3/4] Installing Python requirements (LangGraph, FastAPI, Ollama) inside .venv...");
    const pipPath = process.platform === "win32" 
      ? path.join(venvPath, "Scripts", "pip")
      : path.join(venvPath, "bin", "pip");
      
    const reqPath = path.join(__dirname, "..", "backend", "requirements.txt");
    
    // Upgrade pip first (optional, wrap in try/catch to prevent failure on Windows write-locks)
    try {
      execSync(`"${pipPath}" install --upgrade pip`, { stdio: "ignore" });
    } catch (e) {
      // Ignored
    }
    // Install requirements
    execSync(`"${pipPath}" install -r "${reqPath}"`, { stdio: "inherit" });
    console.log("✓ Python dependencies installed successfully.\n");
  } catch (err) {
    console.error("✗ Failed to setup Python virtual environment:", err.message);
  }
}

// 3. Setup Ollama models
console.log("[4/4] Verifying Ollama installation...");
let hasOllama = false;
try {
  execSync("ollama --version", { stdio: "ignore" });
  hasOllama = true;
  console.log("✓ Ollama CLI is installed and accessible.\n");
} catch (e) {
  console.log("! Ollama CLI is not found on your system.");
  console.log("  To run local LLM/VLM nodes, please download and install Ollama from: https://ollama.com\n");
}

if (hasOllama) {
  try {
    console.log("Pulling default 'llama3' text model (this might take a few minutes)...");
    execSync("ollama pull llama3", { stdio: "inherit" });
    
    console.log("\nPulling default 'llava' vision model (this might take a few minutes)...");
    execSync("ollama pull llava", { stdio: "inherit" });
    console.log("✓ Ollama model pull completed.\n");
  } catch (err) {
    console.warn("! Could not auto-pull Ollama models. Make sure the Ollama application is running locally.");
    console.warn("  You can pull them manually by typing: 'ollama pull llama3' and 'ollama pull llava' in your command prompt.\n");
  }
}

console.log("=========================================");
console.log("            Setup Completed!            ");
console.log("=========================================");
console.log("\nTo start your visual logical workspace:");
console.log("1. Run the Python execution backend server:");
const runCmd = process.platform === "win32"
  ? "backend\\.venv\\Scripts\\uvicorn backend.main:app --reload --port 8000"
  : "source backend/.venv/bin/activate && uvicorn backend.main:app --reload --port 8000";
console.log(`   > ${runCmd}`);
console.log("\n2. Start the Frontend Visual Canvas (in a separate terminal window):");
console.log("   > npm run dev");
console.log("\nOpen your browser at: http://localhost:3000\n");
