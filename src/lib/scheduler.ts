import cron, { type ScheduledTask } from "node-cron";
import { getSettings } from "./settings";
import { runPipeline } from "./pipeline";

const g = globalThis as unknown as { __adrCronTask?: ScheduledTask };

/**
 * 按设置注册每日定时采集。设置页修改时间后重新调用即可生效。
 * 定时触发与手动"立即运行"走同一个 runPipeline()。
 */
export function applySchedule(): void {
  const { daily_run_time } = getSettings();
  const match = /^(\d{1,2}):(\d{2})$/.exec(daily_run_time);
  if (!match) {
    console.error(`[scheduler] 无效的每日运行时间：${daily_run_time}`);
    return;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (g.__adrCronTask) {
    g.__adrCronTask.stop();
  }
  g.__adrCronTask = cron.schedule(`${minute} ${hour} * * *`, () => {
    console.log("[scheduler] 定时任务触发采集");
    void runPipeline("cron").catch((e) =>
      console.error("[scheduler] 定时采集失败：", e)
    );
  });
  console.log(`[scheduler] 每日采集时间已设为 ${daily_run_time}`);
}
