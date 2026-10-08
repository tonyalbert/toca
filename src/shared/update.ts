/** Estado do atualizador automático, compartilhado entre main, preload e renderer */
export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "downloading"; version: string; percent: number }
  | { status: "downloaded"; version: string }
  | { status: "error"; message: string };
