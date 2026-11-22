// Removes dist/ so a build never leaves files of an older build behind.
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

rmSync(resolve(dirname(fileURLToPath(import.meta.url)), "../dist"), { recursive: true, force: true });
