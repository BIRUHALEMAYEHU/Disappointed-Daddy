import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Per-user settings, stored in ~/.disappointed-dad/config.json. */
export interface UserConfig {
  apiKey?: string;
  model?: string;
  provider?: "anthropic" | "ollama" | "hosted";
  daddyUnlocked?: boolean;
  /** Hosted mode: personal token from `dad login`, and which server issued it. */
  hostedToken?: string;
  hostedLogin?: string;
  serverUrl?: string;
}

/** The hosted free tier. Override with `dad config set-server <url>` or DAD_SERVER_URL (e.g. http://localhost:3000 for local dev). */
export const DEFAULT_SERVER_URL = "https://disappointed-daddy.vercel.app";

/** Per-project settings, committed by a team in .disappointed-dad.json. */
export interface ProjectConfig {
  daddyMode?: boolean;
}

const userFile = () => path.join(os.homedir(), ".disappointed-dad", "config.json");

export function loadUserConfig(): UserConfig {
  try {
    return JSON.parse(fs.readFileSync(userFile(), "utf8")) as UserConfig;
  } catch {
    return {};
  }
}

export function saveUserConfig(config: UserConfig) {
  fs.mkdirSync(path.dirname(userFile()), { recursive: true });
  fs.writeFileSync(userFile(), JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}

export function userConfigPath() {
  return userFile();
}

export function loadProjectConfig(root: string): ProjectConfig {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, ".disappointed-dad.json"), "utf8")) as ProjectConfig;
  } catch {
    return {};
  }
}
