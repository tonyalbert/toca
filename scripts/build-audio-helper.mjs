// Compila native/audio-capture/Program.cs com o csc do .NET Framework 4, que já
// vem no Windows (não precisa instalar Visual Studio nem .NET SDK).
// Saída: native/out/toca-audio-capture.exe (empacotado pelo electron-builder).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

if (process.platform !== "win32") {
  console.log("• toca-audio-capture: só existe no Windows, pulando");
  process.exit(0);
}

const csc = join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
if (!existsSync(csc)) {
  console.error(`✖ csc.exe não encontrado em ${csc}`);
  process.exit(1);
}

// Caminhos absolutos do Windows: o csc entende "/" como início de opção
const source = resolve("native", "audio-capture", "Program.cs");
const output = resolve("native", "out", "toca-audio-capture.exe");

mkdirSync(resolve("native", "out"), { recursive: true });
execFileSync(csc, ["/nologo", "/optimize+", "/target:exe", "/platform:x64", `/out:${output}`, source], {
  stdio: "inherit",
});
console.log("• toca-audio-capture.exe compilado");
