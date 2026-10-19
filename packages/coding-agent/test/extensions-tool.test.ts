import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	createExtensionsToolDefinition,
	type LoadedExtensionSummary,
	summarizeExtension,
} from "../src/core/tools/extensions.ts";

const HOME = "/home/tester";

function extension(overrides: Partial<LoadedExtensionSummary> = {}): LoadedExtensionSummary {
	return {
		name: "zen.ts",
		path: `${HOME}/.pi/agent/extensions/zen.ts`,
		resolvedPath: `${HOME}/pi-zen/extensions/zen.ts`,
		scope: "user",
		origin: "top-level",
		hidden: false,
		commands: [],
		shortcuts: [],
		flags: [],
		tools: [],
		...overrides,
	};
}

async function run(
	list: LoadedExtensionSummary[],
	params: { name?: string } = {},
): Promise<{ text: string; details: Record<string, unknown> }> {
	const tool = createExtensionsToolDefinition({ list: () => list, homeDir: HOME });
	const result = await tool.execute("call", params, undefined, undefined, {} as any);
	const [block] = result.content as Array<{ type: string; text?: string }>;
	return { text: block.text ?? "", details: result.details as Record<string, unknown> };
}

describe("extensions tool", () => {
	it("lists each extension with the source it resolves to", async () => {
		const { text, details } = await run([extension()]);
		expect(text).toContain("- zen.ts -> ~/pi-zen/extensions/zen.ts");
		expect(details.count).toBe(1);
	});

	it("says nothing when the extension is its own source", async () => {
		const file = extension({
			name: "local.ts",
			path: `${HOME}/.pi/agent/extensions/local.ts`,
			resolvedPath: `${HOME}/.pi/agent/extensions/local.ts`,
		});
		const { text } = await run([file]);
		expect(text).toContain("- local.ts -> this file");
	});

	it("shows the commands, shortcuts, tools and flags each one registers", async () => {
		const { text } = await run([
			extension({
				commands: [{ name: "zen", description: "Toggle zen mode" }],
				shortcuts: [{ shortcut: "ctrl+o" }],
			}),
			extension({ name: "gemba.ts", tools: ["set_andon"] }),
		]);
		expect(text).toContain("· /zen ctrl+o");
		expect(text).toContain("· 1 tool");
	});

	it("describes one extension by file name, with what it registers", async () => {
		const { text, details } = await run(
			[extension({ commands: [{ name: "zen", description: "Toggle zen mode" }] })],
			{ name: "zen" },
		);
		expect(text).toContain("zen.ts (user, top-level)");
		expect(text).toContain("loaded from: ~/.pi/agent/extensions/zen.ts");
		expect(text).toContain("source: ~/pi-zen/extensions/zen.ts");
		expect(text).toContain("commands: /zen — Toggle zen mode");
		expect(details.name).toBe("zen.ts");
	});

	it("finds an extension by what it registers", async () => {
		const { text } = await run([extension({ name: "gemba.ts", commands: [{ name: "gemba" }] })], { name: "/gemba" });
		expect(text).toContain("gemba.ts (user, top-level)");
	});

	it("names the loaded extensions when one does not match", async () => {
		const { text, details } = await run([extension()], { name: "nope" });
		expect(text).toBe("No extension matches nope. Loaded: zen.ts");
		expect(details.missing).toBe("nope");
	});

	it("reports an empty harness plainly", async () => {
		const { text } = await run([]);
		expect(text).toBe("No extensions are loaded into this session.");
	});

	it("reports an extension that registers nothing", async () => {
		const { text } = await run([extension()], { name: "zen.ts" });
		expect(text).toContain("registers nothing");
	});
});

describe("summarizeExtension", () => {
	it("resolves a symlinked extension to the file it points at", () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-ext-summary-"));
		const source = join(dir, "zen.ts");
		writeFileSync(source, "export default function () {}");
		const link = join(dir, "linked.ts");
		symlinkSync(source, link);
		const summary = summarizeExtension({
			path: link,
			resolvedPath: link,
			sourceInfo: { scope: "user", origin: "top-level" },
			commands: new Map(),
			shortcuts: new Map(),
			flags: new Map(),
			tools: new Map(),
		});
		expect(summary.name).toBe("linked.ts");
		expect(summary.resolvedPath).toBe(realpathSync(source));
		rmSync(dir, { recursive: true, force: true });
	});

	it("leaves a built-in path alone", () => {
		const summary = summarizeExtension({
			path: "builtin:mcp",
			resolvedPath: "builtin:mcp",
			sourceInfo: { scope: "temporary", origin: "top-level" },
			commands: new Map(),
			shortcuts: new Map(),
			flags: new Map(),
			tools: new Map(),
		});
		expect(summary.resolvedPath).toBe("builtin:mcp");
	});

	it("takes the name from the loaded path, not the resolved one", () => {
		const summary = summarizeExtension({
			path: `${HOME}/.pi/agent/extensions/zen.ts`,
			resolvedPath: `${HOME}/pi-zen/extensions/zen-mode.ts`,
			sourceInfo: { scope: "user", origin: "top-level" },
			commands: new Map([["zen", { name: "zen", description: "Toggle" }]]),
			shortcuts: new Map([["ctrl+o", { shortcut: "ctrl+o" }]]),
			flags: new Map([["zen-strict", { name: "zen-strict", type: "boolean" as const }]]),
			tools: new Map([["set_andon", {}]]),
		});
		expect(summary.name).toBe("zen.ts");
		expect(summary.commands).toEqual([{ name: "zen", description: "Toggle" }]);
		expect(summary.shortcuts).toEqual([{ shortcut: "ctrl+o", description: undefined }]);
		expect(summary.flags).toEqual([{ name: "zen-strict", description: undefined }]);
		expect(summary.tools).toEqual(["set_andon"]);
		expect(summary.hidden).toBe(false);
	});
});
