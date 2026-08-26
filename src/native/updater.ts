export interface AvailableUpdate {
  version: string;
  date: string | null;
  body: string | null;
  install: () => Promise<void>;
}

/** Checks GitHub Releases in the installed app. Browser development stays offline. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!(typeof window !== "undefined" && "__TAURI_INTERNALS__" in window)) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    date: update.date ?? null,
    body: update.body ?? null,
    install: async () => {
      await update.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    },
  };
}