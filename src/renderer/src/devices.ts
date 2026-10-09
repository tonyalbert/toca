export type DeviceKind = "audioinput" | "videoinput";

const STORAGE_KEY: Record<DeviceKind, string> = {
  audioinput: "toca.micDeviceId",
  videoinput: "toca.cameraDeviceId",
};

/** "default" = deixa o Windows escolher (microfone padrão / primeira câmera) */
export const DEFAULT_DEVICE = "default";

export function loadDeviceId(kind: DeviceKind): string {
  try {
    return localStorage.getItem(STORAGE_KEY[kind]) ?? DEFAULT_DEVICE;
  } catch {
    return DEFAULT_DEVICE;
  }
}

export function saveDeviceId(kind: DeviceKind, deviceId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY[kind], deviceId);
  } catch {
    // sem armazenamento: a escolha só vale nesta sessão
  }
}

export interface DeviceOption {
  deviceId: string;
  label: string;
}

/**
 * Microfones ou câmeras disponíveis. Os nomes só aparecem depois que o app já
 * usou o dispositivo uma vez (permissão concedida).
 */
export async function listDevices(kind: DeviceKind): Promise<DeviceOption[]> {
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
    // "communications" é um apelido do Windows que só confunde a lista
    (d) => d.kind === kind && d.deviceId !== "communications",
  );
  const options = devices.map((d, i) => ({
    deviceId: d.deviceId,
    label:
      d.deviceId === DEFAULT_DEVICE
        ? `Padrão do Windows (${d.label.replace(/^Default - /, "") || "microfone"})`
        : d.label || `${kind === "audioinput" ? "Microfone" : "Câmera"} ${i + 1}`,
  }));
  // Para câmeras o Chromium não tem um item "padrão"; criamos um
  if (kind === "videoinput") {
    options.unshift({ deviceId: DEFAULT_DEVICE, label: "Automática (primeira câmera)" });
  }
  return options;
}

/** O dispositivo salvo, se ele ainda estiver conectado; senão o padrão */
export async function availableDeviceId(kind: DeviceKind, deviceId: string): Promise<string> {
  const devices = await listDevices(kind);
  return devices.some((d) => d.deviceId === deviceId) ? deviceId : DEFAULT_DEVICE;
}

/** deviceId para a captura: undefined deixa o sistema escolher */
export function captureDeviceId(deviceId: string): string | undefined {
  return deviceId === DEFAULT_DEVICE ? undefined : deviceId;
}
