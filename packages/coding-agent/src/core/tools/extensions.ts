/**
 * Reports what is loaded into this session and where each extension came from.
 *
 * Extensions repaint the TUI, own keybindings and register commands and tools,
 * so behaviour with no home in the working repository has to be traceable. A
 * tool keeps that out of the prompt: the paths cost nothing until asked for.
 */

import { realpathSync } from "node:fs";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import nodePath from "path";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../extensions/types.ts";
import { isSyntheticPath, type SourceOrigin, type SourceScope } from "../source-info.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const extensionsSchema = Type.Object({
	name: Type.Optional(
		Type.String({
			description:
				"One extension to describe in full — its file name, or a command, shortcut, flag or tool it registers",
		}),
	),
});

export const extensionsToolSystemPromptContribution = {
	snippet:
		"Show the pi extensions loaded into this session and where each one came from — check it before assuming behaviour in the TUI comes from the working directory",
	guidelines: [],
} as const;

export type ExtensionsToolInput = Static<typeof extensionsSchema>;

/** One loaded extension, as the tool reports it. */
export interface LoadedExtensionSummary {
	name: string;
	/** Path as it was loaded, which may be a symlink. */
	path: string;
	/** The file the path resolves to: the extension's own source repo. */
	resolvedPath: string;
	scope: SourceScope;
	origin: SourceOrigin;
	hidden: boolean;
	commands: { name: string; description?: string }[];
	shortcuts: { shortcut: string; description?: string }[];
	flags: { name: string; description?: string }[];
	tools: string[];
}

export interface ExtensionsToolOptions {
	/** The extensions loaded for this session. Called per invocation, so reloads are seen. */
	list?: () => LoadedExtensionSummary[];
	/** Directory used to shorten paths for display. Default: the session cwd. */
	homeDir?: string;
}

export interface ExtensionsToolDetails {
	count?: number;
	name?: string;
	missing?: string;
}

function shorten(path: string, home: string | undefined): string {
	if (!home || !path.startsWith(`${home}/`)) return path;
	return `~${path.slice(home.length)}`;
}

/** Where an extension lives. A symlinked extension resolves to its own checkout. */
function origin(extension: LoadedExtensionSummary, home: string | undefined): string {
	if (isSyntheticPath(extension.path)) return "built in";
	return extension.resolvedPath === extension.path ? "this file" : shorten(extension.resolvedPath, home);
}

function formatCount(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The commands, shortcuts, tools and flags it registers, on one line. */
function footprint(extension: LoadedExtensionSummary): string {
	const parts: string[] = [];
	const direct = [
		...extension.commands.map((command) => `/${command.name}`),
		...extension.shortcuts.map((shortcut) => shortcut.shortcut),
	];
	if (direct.length > 0) parts.push(direct.join(" "));
	if (extension.tools.length > 0) parts.push(formatCount(extension.tools.length, "tool"));
	if (extension.flags.length > 0) parts.push(formatCount(extension.flags.length, "flag"));
	return parts.join(" · ");
}

function describe(extension: LoadedExtensionSummary, home: string | undefined): string {
	const lines = [`${extension.name} (${extension.scope}, ${extension.origin})`];
	lines.push(`  loaded from: ${shorten(extension.path, home)}`);
	if (!isSyntheticPath(extension.path) && extension.resolvedPath !== extension.path) {
		lines.push(`  source: ${shorten(extension.resolvedPath, home)}`);
	}
	if (extension.hidden) lines.push("  hidden from the tool list");
	const { commands, shortcuts, flags, tools } = extension;
	if (commands.length === 0 && shortcuts.length === 0 && flags.length === 0 && tools.length === 0) {
		lines.push("  registers nothing: no commands, shortcuts, flags or tools");
	}
	if (commands.length > 0) {
		lines.push(
			`  commands: ${commands.map((c) => `/${c.name}${c.description ? ` — ${c.description}` : ""}`).join("; ")}`,
		);
	}
	if (shortcuts.length > 0) {
		lines.push(
			`  shortcuts: ${shortcuts.map((s) => `${s.shortcut}${s.description ? ` — ${s.description}` : ""}`).join("; ")}`,
		);
	}
	if (flags.length > 0) {
		lines.push(`  flags: ${flags.map((f) => `--${f.name}${f.description ? ` — ${f.description}` : ""}`).join("; ")}`);
	}
	if (tools.length > 0) lines.push(`  tools: ${tools.join(", ")}`);
	return lines.join("\n");
}

export function createExtensionsToolDefinition(
	options?: ExtensionsToolOptions,
): ToolDefinition<typeof extensionsSchema, ExtensionsToolDetails> {
	const home = options?.homeDir;
	const list = options?.list ?? (() => []);
	return {
		name: "extensions",
		label: "extensions",
		description: `List the extensions loaded into this session, or describe one. Extensions can change rendering, keybindings, status rows and commands, so when the TUI behaves in a way the working repository does not explain, check here first: each extension's source is its own checkout, not the directory you are working in. Naming one returns everything it registers.`,
		promptSnippet: extensionsToolSystemPromptContribution.snippet,
		parameters: extensionsSchema,
		async execute(_toolCallId, { name }: ExtensionsToolInput) {
			const all = list();
			if (all.length === 0) {
				return {
					content: [{ type: "text", text: "No extensions are loaded into this session." }],
					details: { count: 0 },
				};
			}

			if (name) {
				const wanted = name.replace(/^[-/]+/, "");
				const found =
					all.find((extension) => extension.name === wanted) ??
					all.find((extension) => extension.name.replace(/\.ts$/, "") === wanted) ??
					all.find((extension) =>
						[
							...extension.commands.map((command) => command.name),
							...extension.shortcuts.map((shortcut) => shortcut.shortcut),
							...extension.flags.map((flag) => flag.name),
							...extension.tools,
						].includes(wanted),
					);
				if (!found) {
					const names = all.map((extension) => extension.name).join(", ");
					return {
						content: [{ type: "text", text: `No extension matches ${name}. Loaded: ${names}` }],
						details: { count: all.length, missing: name },
					};
				}
				return {
					content: [{ type: "text", text: describe(found, home) }],
					details: { count: all.length, name: found.name },
				};
			}

			const lines = all.map((extension) => {
				const source =
					extension.resolvedPath !== extension.path ? shorten(extension.resolvedPath, home) : "this file";
				const summary = footprint(extension);
				return `- ${extension.name} -> ${source}${summary ? ` · ${summary}` : ""}`;
			});
			return {
				content: [
					{
						type: "text",
						text: `${all.length} extension${all.length === 1 ? "" : "s"} loaded, each resolving to its own source:\n${lines.join("\n")}\n\nName one for the commands, shortcuts, flags and tools it registers.`,
					},
				],
				details: { count: all.length },
			};
		},
	};
}

export function createExtensionsTool(options?: ExtensionsToolOptions): AgentTool<any> {
	return wrapToolDefinition(createExtensionsToolDefinition(options));
}

/** A symlink is the only clue to where an extension's source lives. */
function resolveRealPath(path: string, fallback: string): string {
	try {
		return realpathSync(path);
	} catch {
		return fallback;
	}
}

/** Project a loaded extension onto the fields the tool reports. */
export function summarizeExtension(extension: {
	path: string;
	resolvedPath: string;
	hidden?: boolean;
	sourceInfo: { scope: SourceScope; origin: SourceOrigin };
	commands: Map<string, { name: string; description?: string }>;
	shortcuts: Map<string, { shortcut: string; description?: string }>;
	flags: Map<string, { name: string; description?: string }>;
	tools: Map<string, unknown>;
}): LoadedExtensionSummary {
	return {
		name: nodePath.basename(extension.path),
		path: extension.path,
		resolvedPath: isSyntheticPath(extension.path)
			? extension.path
			: resolveRealPath(extension.path, extension.resolvedPath),
		scope: extension.sourceInfo.scope,
		origin: extension.sourceInfo.origin,
		hidden: extension.hidden ?? false,
		commands: [...extension.commands.values()].map(({ name, description }) => ({ name, description })),
		shortcuts: [...extension.shortcuts.values()].map(({ shortcut, description }) => ({ shortcut, description })),
		flags: [...extension.flags.values()].map(({ name, description }) => ({ name, description })),
		tools: [...extension.tools.keys()],
	};
}
