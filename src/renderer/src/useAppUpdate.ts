import { useEffect, useState } from "react";
import type { UpdateState } from "../../shared/update";

export function useAppUpdate() {
  const [version, setVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    void window.toca.getVersion().then(setVersion);
    let receivedEvent = false;
    let active = true;
    const unsubscribe = window.toca.onUpdateState((next) => {
      receivedEvent = true;
      setUpdate(next);
    });
    void window.toca.getUpdateState().then((initial) => {
      if (active && !receivedEvent) setUpdate(initial);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { version, update, install: () => void window.toca.installUpdate() };
}
