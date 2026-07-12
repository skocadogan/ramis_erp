import { app } from "electron";
import fs from "fs";
import path from "path";

const isDev = !app.isPackaged;
let logFilePath: string | null = null;

function getLogFilePath(): string {
  if (!logFilePath) {
    const logDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    logFilePath = path.join(logDir, "app.log");
  }
  return logFilePath;
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.stack ?? arg.message;
      }
      if (typeof arg === "string") {
        return arg;
      }
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

function writeToFile(level: string, args: unknown[]): void {
  if (isDev) {
    return;
  }
  try {
    const line = `[${new Date().toISOString()}] [${level}] ${formatArgs(args)}\n`;
    fs.appendFileSync(getLogFilePath(), line, "utf-8");
  } catch {
    // ignore
  }
}

export function log(...args: unknown[]): void {
  if (isDev) {
    console.log(...args);
  }
  writeToFile("INFO", args);
}

export function error(...args: unknown[]): void {
  if (isDev) {
    console.error(...args);
  } else {
    console.error(...args);
  }
  writeToFile("ERROR", args);
}

export function warn(...args: unknown[]): void {
  if (isDev) {
    console.warn(...args);
  }
  writeToFile("WARN", args);
}
