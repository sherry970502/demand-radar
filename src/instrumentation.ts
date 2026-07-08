export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { applySchedule } = await import("./lib/scheduler");
    applySchedule();
  }
}
