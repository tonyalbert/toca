import { useEffect, useState } from "react";
import type { UpdateState } from "../../shared/update";

export function useAppUpdate() {
  const [version, setVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    void window.toca.getVersion().then(setVersion);
    void window.toca.getUpdateState().then(setUpdate);
    return window.toca.onUpdateState(setUpdate);
  }, []);

  return { version, update, install: () => void window.toca.installUpdate() };
}
