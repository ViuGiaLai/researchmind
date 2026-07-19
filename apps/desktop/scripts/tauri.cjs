const { spawn } = require("child_process");
const http = require("http");

delete process.env.CARGO_TARGET_DIR;

const args = process.argv.slice(2);
const externalIndex = args.indexOf("--external");
if (externalIndex !== -1) {
  args.splice(externalIndex, 1);
  process.env.RESEARCHMIND_EXTERNAL_BACKEND = "1";
  console.log("[tauri] Using external backend (--external flag)");
}

if (!process.env.RESEARCHMIND_EXTERNAL_BACKEND) {
  const req = http.get("http://127.0.0.1:8765/api/ping", { timeout: 2000 }, (res) => {
    if (res.statusCode === 200) {
      process.env.RESEARCHMIND_EXTERNAL_BACKEND = "1";
      console.log("[tauri] Using external backend at http://127.0.0.1:8765");
    }
    launch();
  });
  req.on("error", () => launch());
  req.on("timeout", () => { req.destroy(); launch(); });
} else {
  launch();
}

function launch() {
  const child = spawn("pnpm", ["exec", "tauri", ...args], {
    stdio: "inherit",
    shell: true,
  });
  child.on("exit", (code) => process.exit(code ?? 1));
}
