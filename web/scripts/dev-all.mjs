// Runs the web app and the worker together for local development. Ctrl+C stops both.
import { spawn } from "node:child_process";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const procs = [
  spawn(npm, ["run", "dev"], { stdio: "inherit", shell: process.platform === "win32" }),
  spawn(npm, ["run", "worker"], { stdio: "inherit", shell: process.platform === "win32" }),
];
const stop = () => procs.forEach((p) => p.kill("SIGINT"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
procs.forEach((p) => p.on("exit", (code) => { if (code) stop(); }));
