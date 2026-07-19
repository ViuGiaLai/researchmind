const { spawn } = require("child_process");
const http = require("http");

const args = process.argv.slice(2);
const externalIndex = args.indexOf("--external");
if (externalIndex !== -1) {
  args.splice(externalIndex, 1);
  process.env.RESEARCHMIND_EXTERNAL_BACKEND = "1";
}

if (process.env.CI) {
  // CI: just run Tauri directly, no local backend check needed
  spawn("pnpm", ["exec", "tauri", ...args], { stdio: "inherit", shell: true })
    .on("exit", (code) => process.exit(code ?? 1));
} else {
  // Local dev: check for running backend, clear stale CARGO_TARGET_DIR
  delete process.env.CARGO_TARGET_DIR;
  if (process.env.RESEARCHMIND_EXTERNAL_BACKEND) {
    spawn("pnpm", ["exec", "tauri", ...args], { stdio: "inherit", shell: true })
      .on("exit", (code) => process.exit(code ?? 1));
  } else {
    let launched = false;
    const launch = () => {
      if (launched) return;
      launched = true;
      spawn("pnpm", ["exec", "tauri", ...args], { stdio: "inherit", shell: true })
        .on("exit", (code) => process.exit(code ?? 1));
    };
    const req = http.get("http://127.0.0.1:8765/api/ping", { timeout: 2000 }, (res) => {
      if (res.statusCode === 200) {
        process.env.RESEARCHMIND_EXTERNAL_BACKEND = "1";
      }
      launch();
    });
    req.on("error", () => launch());
    req.on("timeout", () => { req.destroy(); });
    // After 3s, just launch anyway regardless of ping result
    setTimeout(launch, 3000);
  }
}
