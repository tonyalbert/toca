const MIC_KEY = "toca.micDeviceId";

/** "default" = segue o microfone padrão do Windows */
export const DEFAULT_DEVICE = "default";

export function loadMicDeviceId(): string {
  try {
    return localStorage.getItem(MIC_KEY) ?? DEFAULT_DEVICE;
  } catch {
    return DEFAULT_DEVICE;
  }
}

export function saveMicDeviceId(deviceId: string): void {
  try {
    localStorage.setItem(MIC_KEY, deviceId);
  } catch {
    // sem armazenamento: a escolha só vale nesta sessão
  }
}

export interface MicOption {
  deviceId: string;
  label: string;
}

/**
 * Microfones disponíveis. Os nomes só aparecem depois que o app já usou o
 * microfone uma vez (permissão concedida).
 */
export async function listMicrophones(): Promise<MicOption[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return (
    devices
      // "communications" é um apelido do Windows que só confunde a lista
      .filter((d) => d.kind === "audioinput" && d.deviceId !== "communications")
      .map((d, i) => ({
        deviceId: d.deviceId,
        label:
          d.deviceId === DEFAULT_DEVICE
            ? `Padrão do Windows (${d.label.replace(/^Default - /, "") || "microfone"})`
            : d.label || `Microfone ${i + 1}`,
      }))
  );
}

/** O microfone salvo, se ele ainda estiver conectado; senão o padrão do Windows */
export async function availableMicDeviceId(deviceId: string): Promise<string> {
  const mics = await listMicrophones();
  return mics.some((m) => m.deviceId === deviceId) ? deviceId : DEFAULT_DEVICE;
}
