import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PROJECT_USER_GITIGNORE_CONTENT = "*\n.*\n";

export function ensureIgnoredProjectUserConfigDir(dir: string): void {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const ignorePath = join(dir, ".gitignore");
	if (!existsSync(ignorePath)) {
		writeFileSync(ignorePath, PROJECT_USER_GITIGNORE_CONTENT, "utf-8");
	}
}
