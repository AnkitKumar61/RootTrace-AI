try {
  await import("./worker.js");
} catch {
  // Provider connection errors can include private URLs. Log only a safe summary.
  console.error(
    "Worker startup failed. Check database, queue, and environment configuration.",
  );
  process.exit(1);
}
