import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(readFileSync(new URL("../src/main/updater.ts", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "")
  .replace("export function setupUpdater", "function setupUpdater");

function setup(isPackaged = true) {
  const app = Object.assign(new EventEmitter(), { isPackaged, getVersion: () => "1.3.1" });
  const autoUpdater = new EventEmitter();
  const handlers = new Map();
  let calls = 0;
  let finish;
  let installed = false;
  autoUpdater.checkForUpdates = () => {
    calls++;
    autoUpdater.emit("checking-for-update");
    return new Promise((resolve, reject) => { finish = { resolve, reject }; });
  };
  autoUpdater.quitAndInstall = () => { installed = true; };
  runInNewContext(`${source}\nsetupUpdater();`, {
    app, autoUpdater, BrowserWindow: { getAllWindows: () => [] },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    console: { error() {} }, setInterval: () => 1, clearInterval() {},
  });
  return { autoUpdater, handlers, calls: () => calls, finish: () => finish, installed: () => installed };
}

const test = setup();
const state = () => test.handlers.get("update:state")();
const check = () => test.handlers.get("update:check")();
assert.equal(state().status, "checking");
const pending = check();
assert.equal(test.calls(), 1, "concurrent checks must share one request");
test.autoUpdater.emit("update-not-available");
test.finish().resolve(null);
await pending;
assert.equal(state().status, "up-to-date");
const failed = check();
test.finish().reject(new Error("Network unavailable"));
await failed;
assert.equal(state().status, "error");
assert.equal(state().message, "Network unavailable");
const retry = check();
test.autoUpdater.emit("update-available", { version: "1.3.2" });
test.finish().resolve({});
await retry;
test.autoUpdater.emit("download-progress", { percent: 52.4 });
assert.equal(state().percent, 52);
await check();
assert.equal(test.calls(), 3, "do not restart a download");
test.handlers.get("update:install")();
assert.equal(test.installed(), false);
test.autoUpdater.emit("update-downloaded", { version: "1.3.2" });
await check();
assert.equal(test.calls(), 3, "preserve a ready update");
test.handlers.get("update:install")();
assert.equal(test.installed(), true);
const dev = setup(false);
await dev.handlers.get("update:check")();
assert.equal(dev.calls(), 0, "development must not query releases");
console.log("Updater checks passed: concurrency, errors, retry, download, install and development.");
