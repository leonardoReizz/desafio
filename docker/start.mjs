// Sobe o serviço de chamados e o app web no mesmo container.
// Se qualquer um cair, derruba o outro e sai com erro: o CapRover reinicia o container.
import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["--import", "tsx", "src/server.ts"], { cwd: "/app/tickets", stdio: "inherit" }),
  spawn(process.execPath, ["apps/web/server.js"], { cwd: "/app/web", stdio: "inherit" }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 5000).unref();
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!stopping) console.error(`[start] processo ${child.spawnargs.at(-1)} saiu (${signal ?? code}); encerrando o container`);
    stop(code ?? 1);
    if (children.every((c) => c.exitCode !== null || c.signalCode !== null)) process.exit(code ?? 1);
  });
}
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => stop(0));
