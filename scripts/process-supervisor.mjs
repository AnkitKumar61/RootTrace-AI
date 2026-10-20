import { fork } from "node:child_process";

export function supervise({
  commands,
  cwd,
  env,
  shutdownMs = 25000,
  forkProcess = fork,
}) {
  const children = [];
  let stopping = false;
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  function stop(code = 0) {
    if (stopping) return done;
    stopping = true;
    // Both children stop accepting work, then finish their active operations.
    const timer = setTimeout(() => {
      for (const { child } of children)
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
    }, shutdownMs);
    const exits = children.map(
      ({ child }) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null)
            return resolve();
          child.once("exit", resolve);
          if (child.connected) child.send("shutdown", () => {});
          else child.kill("SIGTERM");
        }),
    );
    Promise.all(exits).then(() => {
      clearTimeout(timer);
      finish(code);
    });
    return done;
  }
  for (const [label, file] of commands) {
    try {
      const child = forkProcess(file, [], {
        cwd,
        env,
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        windowsHide: true,
      });
      children.push({ label, child });
      child.on("error", () => {
        console.error(`${label} could not run.`);
        stop(1);
      });
      child.on("exit", () => {
        if (!stopping) {
          console.error(`${label} stopped; shutting down the service.`);
          stop(1);
        }
      });
    } catch {
      console.error(`${label} could not start.`);
      stop(1);
      break;
    }
  }
  return { stop, done };
}
