/**
 * TUI component for managing package resources (enable/disable)
 */

import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import {
	type Component,
	Container,
	type Focusable,
	getKeybindings,
	Input,
	matchesKey,
	Spacer,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { CONFIG_DIR_NAME } from "../../../config.ts";
import type { PathMetadata, ResolvedPaths, ResolvedResource } from "../../../core/package-manager.ts";
import type { PackageSource, SettingsManager } from "../../../core/settings-manager.ts";
import { canonicalizePath, isLocalPath, resolvePath } from "../../../utils/paths.ts";
import { theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { keyHint, rawKeyHint } from "./keybinding-hints.ts";

type ResourceType = "extensions" | "skills" | "prompts" | "themes";
type ConfigWriteScope = "global" | "project";
type ProjectOverrideState = "inherit" | "load" | "unload";
export type ScopedResolvedPaths = Record<ConfigWriteScope, ResolvedPaths>;

const RESOURCE_TYPES = ["extensions", "skills", "prompts", "themes"] as const satisfies readonly ResourceType[];

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
	extensions: "Extensions",
	skills: "Skills",
	prompts: "Prompts",
	themes: "Themes",
};

interface ResourceItem {
	path: string;
	enabled: boolean;
	metadata: PathMetadata;
	resourceType: ResourceType;
	displayName: string;
	groupKey: string;
	subgroupKey: string;
	projectOverride?: boolean;
}

interface ResourceSubgroup {
	type: ResourceType;
	label: string;
	items: ResourceItem[];
}

interface ResourceGroup {
	key: string;
	label: string;
	displaySource: string;
	scope: "user" | "project" | "temporary";
	origin: "package" | "top-level";
	source: string;
	subgroups: ResourceSubgroup[];
}

function formatBaseDir(baseDir: string): string {
	const homeDir = homedir();
	let displayPath: string;

	if (baseDir === homeDir) {
		displayPath = "~";
	} else if (baseDir.startsWith(homeDir)) {
		// Replace home prefix with ~, normalize separators for display
		const rest = baseDir.slice(homeDir.length);
		displayPath = `~${rest.replace(/\\/g, "/")}`;
	} else {
		displayPath = baseDir.replace(/\\/g, "/");
	}

	return displayPath.endsWith("/") ? displayPath : `${displayPath}/`;
}

function getSettingsBaseDir(scope: ResourceGroup["scope"], cwd: string, agentDir: string): string {
	if (scope === "project") {
		return join(cwd, CONFIG_DIR_NAME);
	}
	if (scope === "user") {
		return agentDir;
	}
	return cwd;
}

function getPackageDisplaySource(metadata: PathMetadata, cwd: string, agentDir: string): string {
	if (!isLocalPath(metadata.source)) {
		return metadata.source;
	}
	return resolvePath(metadata.source, getSettingsBaseDir(metadata.scope, cwd, agentDir), { trim: true }).replace(
		/\\/g,
		"/",
	);
}

function getGroupLabel(metadata: PathMetadata, cwd: string, agentDir: string): string {
	if (metadata.origin === "package") {
		const scopeLabel = metadata.scope === "user" ? "global" : metadata.scope;
		return `${getPackageDisplaySource(metadata, cwd, agentDir)} (${scopeLabel})`;
	}
	// Top-level resources
	if (metadata.source === "auto") {
		if (metadata.baseDir) {
			return metadata.scope === "user"
				? `User (${formatBaseDir(metadata.baseDir)})`
				: `Project (${formatBaseDir(metadata.baseDir)})`;
		}
		return metadata.scope === "user" ? `User (${formatBaseDir(agentDir)})` : `Project (${CONFIG_DIR_NAME}/)`;
	}
	return metadata.scope === "user" ? "User settings" : "Project settings";
}

function getResourceItemKey(resourceType: ResourceType, path: string): string {
	return `${resourceType}:${canonicalizePath(path)}`;
}

function getEntryResourceItemKey(entry: FlatEntry): string | undefined {
	return entry.type === "item" ? getResourceItemKey(entry.item.resourceType, entry.item.path) : undefined;
}

function getPatternEntryTarget(entry: string): string {
	return entry.startsWith("!") || entry.startsWith("+") || entry.startsWith("-") ? entry.slice(1) : entry;
}

function getOverrideStateFromEntries(
	entries: string[],
	patterns: Set<string>,
	options?: { plainEntryIsLoad?: boolean; emptyArrayIsUnload?: boolean },
): ProjectOverrideState {
	if (entries.length === 0 && options?.emptyArrayIsUnload) {
		return "unload";
	}

	let state: ProjectOverrideState = "inherit";
	for (const entry of entries) {
		if (!patterns.has(getPatternEntryTarget(entry))) continue;
		if (entry.startsWith("!") || entry.startsWith("-")) {
			state = "unload";
		} else if (entry.startsWith("+") || options?.plainEntryIsLoad) {
			state = "load";
		}
	}
	return state;
}

function buildGroups(
	resolved: ResolvedPaths,
	cwd: string,
	agentDir: string,
	writeScope: ConfigWriteScope,
): ResourceGroup[] {
	const groupMap = new Map<string, ResourceGroup>();

	const addToGroup = (resources: ResolvedResource[], resourceType: ResourceType) => {
		for (const res of resources) {
			const { path, enabled, metadata } = res;
			const groupKey = `${metadata.origin}:${metadata.scope}:${metadata.source}:${metadata.baseDir ?? ""}`;

			if (!groupMap.has(groupKey)) {
				groupMap.set(groupKey, {
					key: groupKey,
					label: getGroupLabel(metadata, cwd, agentDir),
					displaySource:
						metadata.origin === "package" ? getPackageDisplaySource(metadata, cwd, agentDir) : metadata.source,
					scope: metadata.scope,
					origin: metadata.origin,
					source: metadata.source,
					subgroups: [],
				});
			}

			const group = groupMap.get(groupKey)!;
			const subgroupKey = `${groupKey}:${resourceType}`;

			let subgroup = group.subgroups.find((sg) => sg.type === resourceType);
			if (!subgroup) {
				subgroup = {
					type: resourceType,
					label: RESOURCE_TYPE_LABELS[resourceType],
					items: [],
				};
				group.subgroups.push(subgroup);
			}

			const fileName = basename(path);
			const parentFolder = basename(dirname(path));
			let displayName: string;
			if (resourceType === "extensions" && parentFolder !== "extensions") {
				displayName = `${parentFolder}/${fileName}`;
			} else if (resourceType === "skills" && fileName === "SKILL.md") {
				displayName = parentFolder;
			} else {
				displayName = fileName;
			}
			subgroup.items.push({
				path,
				enabled,
				metadata,
				resourceType,
				displayName,
				groupKey,
				subgroupKey,
			});
		}
	};

	addToGroup(resolved.extensions, "extensions");
	addToGroup(resolved.skills, "skills");
	addToGroup(resolved.prompts, "prompts");
	addToGroup(resolved.themes, "themes");

	const groups = Array.from(groupMap.values());
	groups.sort((a, b) => {
		if (writeScope === "project") {
			const projectRank = (group: ResourceGroup): number => {
				if (group.scope === "project" && group.origin === "top-level") return 0;
				if (group.scope === "project" && group.origin === "package") return 1;
				if (group.scope === "user" && group.origin === "package") return 2;
				if (group.scope === "user" && group.origin === "top-level") return 3;
				return 4;
			};
			const rankDiff = projectRank(a) - projectRank(b);
			if (rankDiff !== 0) return rankDiff;
			return a.source.localeCompare(b.source);
		}

		// Global mode: packages first, then top-level; user before project.
		if (a.origin !== b.origin) {
			return a.origin === "package" ? -1 : 1;
		}
		if (a.scope !== b.scope) {
			return a.scope === "user" ? -1 : 1;
		}
		return a.source.localeCompare(b.source);
	});

	// Sort subgroups within each group by type order, and items by name
	const typeOrder: Record<ResourceType, number> = { extensions: 0, skills: 1, prompts: 2, themes: 3 };
	for (const group of groups) {
		group.subgroups.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
		for (const subgroup of group.subgroups) {
			subgroup.items.sort((a, b) => a.displayName.localeCompare(b.displayName));
		}
	}

	return groups;
}

type FlatEntry =
	| { type: "group"; group: ResourceGroup }
	| { type: "subgroup"; subgroup: ResourceSubgroup; group: ResourceGroup }
	| { type: "item"; item: ResourceItem };

class ConfigSelectorHeader implements Component {
	private writeScope: ConfigWriteScope;
	private projectModeAvailable: boolean;

	constructor(writeScope: ConfigWriteScope, projectModeAvailable: boolean) {
		this.writeScope = writeScope;
		this.projectModeAvailable = projectModeAvailable;
	}

	setWriteScope(writeScope: ConfigWriteScope): void {
		this.writeScope = writeScope;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const title = theme.bold(this.writeScope === "project" ? "Project Local Resources" : "Global Resources");
		const sep = theme.fg("muted", " · ");
		const globalMode = this.writeScope === "global" ? theme.fg("accent", "global") : theme.fg("muted", "global");
		const projectMode =
			this.writeScope === "project" ? theme.fg("accent", "project local") : theme.fg("muted", "project local");
		const modeIndicator = `${theme.fg("muted", "Mode: ")}${globalMode}${theme.fg("muted", " | ")}${projectMode}`;
		const scopeHint =
			this.writeScope === "project"
				? theme.fg("muted", `${CONFIG_DIR_NAME}/settings.json · inherited global resources are dimmed`)
				: theme.fg("muted", `~/${CONFIG_DIR_NAME}/agent/settings.json`);
		const switchHint = this.projectModeAvailable ? keyHint("tui.input.tab", "switch mode") + sep : "";
		const actionHint =
			this.writeScope === "project" ? rawKeyHint("space", "cycle inherit/+/-") : rawKeyHint("space", "toggle");
		const hint = switchHint + actionHint + sep + rawKeyHint("esc", "close");
		const hintWidth = visibleWidth(hint);
		const titleWidth = visibleWidth(title);
		const spacing = Math.max(1, width - titleWidth - hintWidth);

		return [
			truncateToWidth(`${title}${" ".repeat(spacing)}${hint}`, width, ""),
			truncateToWidth(`${modeIndicator}${sep}${scopeHint}`, width, ""),
		];
	}
}

class ResourceList implements Component, Focusable {
	private groupsByScope: Record<ConfigWriteScope, ResourceGroup[]>;
	private flatItems: FlatEntry[] = [];
	private filteredItems: FlatEntry[] = [];
	private selectedIndex = 0;
	private searchInput: Input;
	private maxVisible: number;
	private settingsManager: SettingsManager;
	private cwd: string;
	private agentDir: string;
	private writeScope: ConfigWriteScope;
	private inheritedEnabledByKey: Map<string, boolean>;

	public onCancel?: () => void;
	public onExit?: () => void;
	public onToggle?: (item: ResourceItem, newEnabled: boolean) => void;
	public onSwitchMode?: () => void;

	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	constructor(
		groupsByScope: Record<ConfigWriteScope, ResourceGroup[]>,
		settingsManager: SettingsManager,
		cwd: string,
		agentDir: string,
		terminalHeight?: number,
		writeScope: ConfigWriteScope = "global",
	) {
		this.settingsManager = settingsManager;
		this.cwd = cwd;
		this.agentDir = agentDir;
		this.writeScope = writeScope;
		this.groupsByScope = {
			global: groupsByScope.global,
			project: this.mergeProjectPackageDeltaGroups(groupsByScope.project),
		};
		this.inheritedEnabledByKey = this.buildInheritedEnabledMap(groupsByScope.global);
		this.searchInput = new Input();
		// 8 lines of chrome: top spacer + top border + spacer + header (2 lines) + spacer + bottom spacer + bottom border
		const chrome = 8;
		this.maxVisible = Math.max(5, (terminalHeight ?? 24) - chrome);
		this.buildFlatList();
		this.filteredItems = [...this.flatItems];
	}

	setWriteScope(writeScope: ConfigWriteScope): void {
		if (this.writeScope === writeScope) {
			return;
		}
		this.writeScope = writeScope;
		this.buildFlatList();
		this.filterItems(this.searchInput.getValue());
	}

	private get groups(): ResourceGroup[] {
		return this.groupsByScope[this.writeScope];
	}

	private buildInheritedEnabledMap(groups: ResourceGroup[]): Map<string, boolean> {
		const result = new Map<string, boolean>();
		for (const group of groups) {
			for (const subgroup of group.subgroups) {
				for (const item of subgroup.items) {
					result.set(getResourceItemKey(item.resourceType, item.path), item.enabled);
				}
			}
		}
		return result;
	}

	private mergeProjectPackageDeltaGroups(groups: ResourceGroup[]): ResourceGroup[] {
		const mergedGroups: ResourceGroup[] = [];
		for (const group of groups) {
			if (
				group.scope === "project" &&
				group.origin === "package" &&
				this.projectPackageAutoloadDisabled(group.source)
			) {
				const globalGroup = groups.find(
					(candidate) =>
						candidate.scope === "user" &&
						candidate.origin === "package" &&
						this.packageSourceStringMatches(candidate.source, "user", group.source, "project"),
				);
				if (globalGroup) {
					continue;
				}
			}
			if (group.scope !== "user" || group.origin !== "package") {
				mergedGroups.push(group);
				continue;
			}

			const projectGroup = groups.find(
				(candidate) =>
					candidate.scope === "project" &&
					candidate.origin === "package" &&
					this.projectPackageAutoloadDisabled(candidate.source) &&
					this.packageSourceStringMatches(group.source, "user", candidate.source, "project"),
			);
			if (!projectGroup) {
				mergedGroups.push(group);
				continue;
			}

			mergedGroups.push(this.mergePackageGroups(group, projectGroup));
		}
		return mergedGroups;
	}

	private mergePackageGroups(globalGroup: ResourceGroup, projectGroup: ResourceGroup): ResourceGroup {
		const subgroups: ResourceSubgroup[] = [];
		for (const resourceType of RESOURCE_TYPES) {
			const items = new Map<string, ResourceItem>();
			for (const item of globalGroup.subgroups.find((entry) => entry.type === resourceType)?.items ?? []) {
				items.set(item.path, item);
			}
			for (const item of projectGroup.subgroups.find((entry) => entry.type === resourceType)?.items ?? []) {
				items.set(item.path, { ...item, projectOverride: true });
			}
			const mergedItems = Array.from(items.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
			if (mergedItems.length > 0) {
				subgroups.push({
					type: resourceType,
					label: RESOURCE_TYPE_LABELS[resourceType],
					items: mergedItems,
				});
			}
		}
		return {
			...globalGroup,
			key: `${globalGroup.key}:project-delta:${projectGroup.key}`,
			label: `${globalGroup.displaySource} (global with project-local overrides)`,
			scope: "temporary",
			subgroups,
		};
	}

	private buildFlatList(): void {
		this.flatItems = [];
		for (const group of this.groups) {
			this.flatItems.push({ type: "group", group });
			for (const subgroup of group.subgroups) {
				this.flatItems.push({ type: "subgroup", subgroup, group });
				for (const item of subgroup.items) {
					this.flatItems.push({ type: "item", item });
				}
			}
		}
		// Start selection on first item (not header)
		this.selectedIndex = this.flatItems.findIndex((e) => e.type === "item");
		if (this.selectedIndex < 0) this.selectedIndex = 0;
	}

	private getSelectedItemKey(): string | undefined {
		const entry = this.filteredItems[this.selectedIndex];
		return entry ? getEntryResourceItemKey(entry) : undefined;
	}

	private findNextItem(fromIndex: number, direction: 1 | -1): number {
		let idx = fromIndex + direction;
		while (idx >= 0 && idx < this.filteredItems.length) {
			if (this.filteredItems[idx].type === "item") {
				return idx;
			}
			idx += direction;
		}
		return fromIndex; // Stay at current if no item found
	}

	private filterItems(query: string, preferredItemKey = this.getSelectedItemKey()): void {
		if (!query.trim()) {
			this.filteredItems = [...this.flatItems];
			this.selectFirstItem(preferredItemKey);
			return;
		}

		const lowerQuery = query.toLowerCase();
		const matchingItems = new Set<ResourceItem>();
		const matchingSubgroups = new Set<ResourceSubgroup>();
		const matchingGroups = new Set<ResourceGroup>();

		for (const entry of this.flatItems) {
			if (entry.type === "item") {
				const item = entry.item;
				if (
					item.displayName.toLowerCase().includes(lowerQuery) ||
					item.resourceType.toLowerCase().includes(lowerQuery) ||
					item.path.toLowerCase().includes(lowerQuery)
				) {
					matchingItems.add(item);
				}
			}
		}

		// Find which subgroups and groups contain matching items
		for (const group of this.groups) {
			for (const subgroup of group.subgroups) {
				for (const item of subgroup.items) {
					if (matchingItems.has(item)) {
						matchingSubgroups.add(subgroup);
						matchingGroups.add(group);
					}
				}
			}
		}

		this.filteredItems = [];
		for (const entry of this.flatItems) {
			if (entry.type === "group" && matchingGroups.has(entry.group)) {
				this.filteredItems.push(entry);
			} else if (entry.type === "subgroup" && matchingSubgroups.has(entry.subgroup)) {
				this.filteredItems.push(entry);
			} else if (entry.type === "item" && matchingItems.has(entry.item)) {
				this.filteredItems.push(entry);
			}
		}

		this.selectFirstItem(preferredItemKey);
	}

	private selectFirstItem(preferredItemKey?: string): void {
		if (preferredItemKey) {
			const preferredIndex = this.filteredItems.findIndex(
				(entry) => getEntryResourceItemKey(entry) === preferredItemKey,
			);
			if (preferredIndex >= 0) {
				this.selectedIndex = preferredIndex;
				return;
			}
		}
		const firstItemIndex = this.filteredItems.findIndex((e) => e.type === "item");
		this.selectedIndex = firstItemIndex >= 0 ? firstItemIndex : 0;
	}

	updateItem(item: ResourceItem, state: ProjectOverrideState): void {
		const enabled = state === "inherit" ? this.getInheritedEnabled(item) : state === "load";
		const projectOverride = this.writeScope === "project" && state !== "inherit";
		const itemKey = getResourceItemKey(item.resourceType, item.path);

		for (const group of this.groups) {
			for (const subgroup of group.subgroups) {
				for (const found of subgroup.items) {
					if (getResourceItemKey(found.resourceType, found.path) !== itemKey) continue;
					found.enabled = enabled;
					found.projectOverride = projectOverride;
				}
			}
		}
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines: string[] = [];

		// Search input
		lines.push(...this.searchInput.render(width));
		lines.push("");

		if (this.filteredItems.length === 0) {
			lines.push(theme.fg("muted", "  No resources found"));
			return lines;
		}

		// Calculate visible range
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), this.filteredItems.length - this.maxVisible),
		);
		const endIndex = Math.min(startIndex + this.maxVisible, this.filteredItems.length);

		for (let i = startIndex; i < endIndex; i++) {
			const entry = this.filteredItems[i];
			const isSelected = i === this.selectedIndex;

			if (entry.type === "group") {
				// Main group header (no cursor)
				const label = theme.bold(this.getGroupDisplayLabel(entry.group));
				const groupLine = this.isDimmedScope(entry.group.scope)
					? theme.fg("dim", label)
					: theme.fg("accent", label);
				lines.push(truncateToWidth(`  ${groupLine}`, width, ""));
			} else if (entry.type === "subgroup") {
				// Subgroup header (indented, no cursor)
				const color = this.isDimmedScope(entry.group.scope) ? "dim" : "muted";
				const subgroupLine = theme.fg(color, entry.subgroup.label);
				lines.push(truncateToWidth(`    ${subgroupLine}`, width, ""));
			} else {
				// Resource item (cursor only on items)
				const item = entry.item;
				const cursor = isSelected ? "> " : "  ";
				const dimmed = this.isDimmedItem(item);
				const checkbox = this.renderCheckbox(item, dimmed);
				const nameText = isSelected && !dimmed ? theme.bold(item.displayName) : item.displayName;
				const name = dimmed ? theme.fg("dim", nameText) : nameText;
				const suffix = this.getItemSuffix(item);
				lines.push(truncateToWidth(`${cursor}    ${checkbox} ${name}${suffix}`, width, "..."));
			}
		}

		// Scroll indicator
		if (startIndex > 0 || endIndex < this.filteredItems.length) {
			const itemCount = this.filteredItems.filter((e) => e.type === "item").length;
			const currentItemIndex =
				this.filteredItems.slice(0, this.selectedIndex).filter((e) => e.type === "item").length + 1;
			lines.push(theme.fg("dim", `  (${currentItemIndex}/${itemCount})`));
		}

		return lines;
	}

	private getGroupDisplayLabel(group: ResourceGroup): string {
		if (this.writeScope !== "project") {
			return group.label;
		}
		if (
			group.scope === "project" &&
			group.origin === "package" &&
			this.hasMatchingPackageSource(group.source, "project", "user")
		) {
			return `${group.displaySource} (project package replaces global package)`;
		}
		if (group.scope === "user") {
			if (group.origin === "package" && this.hasMatchingPackageSource(group.source, "user", "project")) {
				return `${group.displaySource} (global package shadowed by project override)`;
			}
			return `${group.label} · inherited global`;
		}
		return group.label;
	}

	private isDimmedScope(scope: ResourceGroup["scope"]): boolean {
		return this.writeScope === "project" && scope === "user";
	}

	private isDimmedItem(item: ResourceItem): boolean {
		return (
			this.writeScope === "project" &&
			this.isInheritedGlobalItem(item) &&
			this.getProjectOverrideState(item) === "inherit"
		);
	}

	private renderCheckbox(item: ResourceItem, dimmed: boolean): string {
		if (this.writeScope === "project") {
			const state = this.getProjectOverrideState(item);
			if (state === "load") {
				return theme.fg("success", "[+]");
			}
			if (state === "unload") {
				return theme.fg("warning", "[-]");
			}
			return theme.fg("dim", item.enabled ? "[x]" : "[ ]");
		}
		if (dimmed) {
			return theme.fg("dim", item.enabled ? "[x]" : "[ ]");
		}
		return item.enabled ? theme.fg("success", "[x]") : theme.fg("warning", "[ ]");
	}

	private getItemSuffix(item: ResourceItem): string {
		if (this.writeScope !== "project") {
			return "";
		}
		const state = this.getProjectOverrideState(item);
		if (state === "load") {
			return theme.fg("muted", "  project load");
		}
		if (state === "unload") {
			return theme.fg("muted", "  project unload");
		}
		if (this.isInheritedGlobalItem(item)) {
			return theme.fg("dim", "  inherited global");
		}
		return "";
	}

	handleInput(data: string): void {
		const kb = getKeybindings();

		if (kb.matches(data, "tui.select.up")) {
			this.selectedIndex = this.findNextItem(this.selectedIndex, -1);
			return;
		}
		if (kb.matches(data, "tui.select.down")) {
			this.selectedIndex = this.findNextItem(this.selectedIndex, 1);
			return;
		}
		if (kb.matches(data, "tui.select.pageUp")) {
			// Jump up by maxVisible, then find nearest item
			let target = Math.max(0, this.selectedIndex - this.maxVisible);
			while (target < this.filteredItems.length && this.filteredItems[target].type !== "item") {
				target++;
			}
			if (target < this.filteredItems.length) {
				this.selectedIndex = target;
			}
			return;
		}
		if (kb.matches(data, "tui.select.pageDown")) {
			// Jump down by maxVisible, then find nearest item
			let target = Math.min(this.filteredItems.length - 1, this.selectedIndex + this.maxVisible);
			while (target >= 0 && this.filteredItems[target].type !== "item") {
				target--;
			}
			if (target >= 0) {
				this.selectedIndex = target;
			}
			return;
		}
		if (kb.matches(data, "tui.select.cancel")) {
			this.onCancel?.();
			return;
		}
		if (matchesKey(data, "ctrl+c")) {
			this.onExit?.();
			return;
		}
		if (kb.matches(data, "tui.input.tab")) {
			this.onSwitchMode?.();
			return;
		}
		if (data === " " || kb.matches(data, "tui.select.confirm")) {
			const entry = this.filteredItems[this.selectedIndex];
			if (entry?.type === "item" && this.canEditItem(entry.item)) {
				const selectedItemKey = getResourceItemKey(entry.item.resourceType, entry.item.path);
				const nextState = this.getNextOverrideState(entry.item);
				if (this.setResourceOverride(entry.item, nextState)) {
					this.updateItem(entry.item, nextState);
					this.filterItems(this.searchInput.getValue(), selectedItemKey);
					this.onToggle?.(
						entry.item,
						nextState === "inherit" ? this.getInheritedEnabled(entry.item) : nextState === "load",
					);
				}
			}
			return;
		}

		// Pass to search input
		this.searchInput.handleInput(data);
		this.filterItems(this.searchInput.getValue());
	}

	private setResourceOverride(item: ResourceItem, state: ProjectOverrideState): boolean {
		if (item.metadata.origin === "top-level") {
			return this.setTopLevelResourceOverride(item, state);
		}
		return this.setPackageResourceOverride(item, state);
	}

	private setTopLevelResourceOverride(item: ResourceItem, state: ProjectOverrideState): boolean {
		const scope = this.getWriteScope();
		const settings =
			scope === "project" ? this.settingsManager.getProjectSettings() : this.settingsManager.getGlobalSettings();

		const arrayKey = item.resourceType as "extensions" | "skills" | "prompts" | "themes";
		const current = (settings[arrayKey] ?? []) as string[];
		const patterns = this.getTopLevelOverridePatterns(item, scope);
		const pattern =
			scope === "project" ? this.getProjectTopLevelWritePattern(item) : this.getResourcePattern(item, scope);
		const isInheritedGlobal = scope === "project" && this.isInheritedGlobalItem(item);

		const updated = current.filter((entry) => {
			const target = getPatternEntryTarget(entry);
			const isOverride = entry.startsWith("!") || entry.startsWith("+") || entry.startsWith("-");
			if (isOverride && patterns.has(target)) {
				return false;
			}
			return !(state === "inherit" && isInheritedGlobal && target === pattern);
		});

		if (state !== "inherit") {
			if (isInheritedGlobal && !updated.includes(pattern)) {
				updated.push(pattern);
			}
			updated.push(`${state === "load" ? "+" : "-"}${pattern}`);
		}

		this.setTopLevelResourcePaths(scope, arrayKey, updated);
		return true;
	}

	private setTopLevelResourcePaths(
		scope: "user" | "project",
		arrayKey: "extensions" | "skills" | "prompts" | "themes",
		paths: string[],
	): void {
		if (scope === "project") {
			if (arrayKey === "extensions") {
				this.settingsManager.setProjectExtensionPaths(paths);
			} else if (arrayKey === "skills") {
				this.settingsManager.setProjectSkillPaths(paths);
			} else if (arrayKey === "prompts") {
				this.settingsManager.setProjectPromptTemplatePaths(paths);
			} else if (arrayKey === "themes") {
				this.settingsManager.setProjectThemePaths(paths);
			}
			return;
		}
		if (arrayKey === "extensions") {
			this.settingsManager.setExtensionPaths(paths);
		} else if (arrayKey === "skills") {
			this.settingsManager.setSkillPaths(paths);
		} else if (arrayKey === "prompts") {
			this.settingsManager.setPromptTemplatePaths(paths);
		} else if (arrayKey === "themes") {
			this.settingsManager.setThemePaths(paths);
		}
	}

	private setPackageResourceOverride(item: ResourceItem, state: ProjectOverrideState): boolean {
		const scope = this.getWriteScope();
		const settings =
			scope === "project" ? this.settingsManager.getProjectSettings() : this.settingsManager.getGlobalSettings();

		const packages = [...(settings.packages ?? [])] as PackageSource[];
		let pkgIndex = packages.findIndex((pkg) =>
			this.packageSourceStringMatches(
				item.metadata.source,
				this.getItemScope(item),
				typeof pkg === "string" ? pkg : pkg.source,
				scope,
			),
		);
		if (pkgIndex === -1) {
			if (scope !== "project" || state === "inherit") {
				return false;
			}
			packages.push(this.createPackageOverrideSource(item));
			pkgIndex = packages.length - 1;
		}

		let pkg = packages[pkgIndex];
		if (pkg === undefined) return false;

		if (typeof pkg === "string") {
			pkg = { source: pkg };
			packages[pkgIndex] = pkg;
		}

		const arrayKey = item.resourceType as "extensions" | "skills" | "prompts" | "themes";
		const current = (pkg[arrayKey] ?? []) as string[];
		const pattern = this.getPackageResourcePattern(item);
		const updated = current.filter((entry) => getPatternEntryTarget(entry) !== pattern);

		if (state !== "inherit") {
			updated.push(`${state === "load" ? "+" : "-"}${pattern}`);
		}

		(pkg as Record<string, unknown>)[arrayKey] = updated.length > 0 ? updated : undefined;

		const hasFilters = RESOURCE_TYPES.some((key) => (pkg as Record<string, unknown>)[key] !== undefined);
		if (!hasFilters) {
			if (pkg.autoload === false) {
				packages.splice(pkgIndex, 1);
			} else {
				packages[pkgIndex] = pkg.source;
			}
		}

		if (scope === "project") {
			this.settingsManager.setProjectPackages(packages);
		} else {
			this.settingsManager.setPackages(packages);
		}
		return true;
	}

	private getNextOverrideState(item: ResourceItem): ProjectOverrideState {
		if (this.writeScope !== "project") {
			return item.enabled ? "unload" : "load";
		}

		const state = this.getProjectOverrideState(item);
		const inheritedEnabled = this.getInheritedEnabled(item);
		if (state === "inherit") {
			return inheritedEnabled ? "unload" : "load";
		}
		if (state === "unload") {
			return inheritedEnabled ? "load" : "inherit";
		}
		return inheritedEnabled ? "inherit" : "unload";
	}

	private getProjectOverrideState(item: ResourceItem): ProjectOverrideState {
		if (this.writeScope !== "project") {
			return "inherit";
		}
		if (item.metadata.origin === "top-level") {
			const arrayKey = item.resourceType as "extensions" | "skills" | "prompts" | "themes";
			const entries = (this.settingsManager.getProjectSettings()[arrayKey] ?? []) as string[];
			return getOverrideStateFromEntries(entries, this.getTopLevelOverridePatterns(item, "project"));
		}

		const pkg = this.findMatchingPackageSource(item.metadata.source, this.getItemScope(item), "project");
		if (typeof pkg !== "object") {
			return "inherit";
		}
		const arrayKey = item.resourceType as "extensions" | "skills" | "prompts" | "themes";
		const entries = pkg[arrayKey];
		if (entries === undefined) {
			return "inherit";
		}
		return getOverrideStateFromEntries(entries, new Set([this.getPackageResourcePattern(item)]), {
			plainEntryIsLoad: true,
			emptyArrayIsUnload: true,
		});
	}

	private getInheritedEnabled(item: ResourceItem): boolean {
		const inheritedEnabled = this.inheritedEnabledByKey.get(getResourceItemKey(item.resourceType, item.path));
		if (inheritedEnabled !== undefined) {
			return inheritedEnabled;
		}
		return this.getItemScope(item) === "user" ? item.enabled : true;
	}

	private isInheritedGlobalItem(item: ResourceItem): boolean {
		return (
			this.getItemScope(item) === "user" ||
			this.inheritedEnabledByKey.has(getResourceItemKey(item.resourceType, item.path))
		);
	}

	private getTopLevelOverridePatterns(item: ResourceItem, targetScope: "user" | "project"): Set<string> {
		const patterns = new Set<string>([this.getResourcePattern(item, targetScope), item.path]);
		const targetBaseDir = this.getTopLevelBaseDir(targetScope);
		patterns.add(relative(targetBaseDir, item.path));
		if (item.metadata.baseDir) {
			patterns.add(relative(item.metadata.baseDir, item.path));
		}
		return patterns;
	}

	private getProjectTopLevelWritePattern(item: ResourceItem): string {
		return this.isInheritedGlobalItem(item) ? item.path : this.getResourcePattern(item, "project");
	}

	private canEditItem(item: ResourceItem): boolean {
		return this.writeScope === "project" || this.getItemScope(item) === "user";
	}

	private getItemScope(item: ResourceItem): "user" | "project" {
		return item.metadata.scope === "project" ? "project" : "user";
	}

	private getWriteScope(): "user" | "project" {
		return this.writeScope === "project" ? "project" : "user";
	}

	private getTopLevelBaseDir(scope: "user" | "project"): string {
		return scope === "project" ? join(this.cwd, CONFIG_DIR_NAME) : this.agentDir;
	}

	private getResourcePattern(item: ResourceItem, targetScope: "user" | "project"): string {
		const sourceScope = this.getItemScope(item);
		if (targetScope !== sourceScope) {
			return item.path;
		}
		const baseDir = item.metadata.baseDir ?? this.getTopLevelBaseDir(sourceScope);
		return relative(baseDir, item.path);
	}

	/** Build an autoload=false project delta entry for a package configured in another scope. */
	private createPackageOverrideSource(item: ResourceItem): PackageSource {
		const source = item.metadata.source;
		if (!isLocalPath(source)) {
			return { source, autoload: false };
		}
		const sourcePath = resolvePath(source, this.getTopLevelBaseDir(this.getItemScope(item)), { trim: true });
		return { source: relative(this.getTopLevelBaseDir("project"), sourcePath) || ".", autoload: false };
	}

	private packageSourceStringMatches(
		leftSource: string,
		leftScope: "user" | "project",
		rightSource: string,
		rightScope: "user" | "project",
	): boolean {
		if (leftSource === rightSource) {
			return true;
		}
		if (!isLocalPath(leftSource) || !isLocalPath(rightSource)) {
			return false;
		}
		const leftPath = resolvePath(leftSource, this.getTopLevelBaseDir(leftScope), { trim: true });
		const rightPath = resolvePath(rightSource, this.getTopLevelBaseDir(rightScope), { trim: true });
		return leftPath === rightPath;
	}

	private findMatchingPackageSource(
		source: string,
		sourceScope: "user" | "project",
		targetScope: "user" | "project",
	): PackageSource | undefined {
		const targetSettings =
			targetScope === "project"
				? this.settingsManager.getProjectSettings()
				: this.settingsManager.getGlobalSettings();
		return (targetSettings.packages ?? []).find((pkg) =>
			this.packageSourceStringMatches(source, sourceScope, typeof pkg === "string" ? pkg : pkg.source, targetScope),
		);
	}

	private hasMatchingPackageSource(
		source: string,
		sourceScope: "user" | "project",
		targetScope: "user" | "project",
	): boolean {
		return this.findMatchingPackageSource(source, sourceScope, targetScope) !== undefined;
	}

	private projectPackageAutoloadDisabled(source: string): boolean {
		const pkg = this.findMatchingPackageSource(source, "project", "project");
		return typeof pkg === "object" && pkg.autoload === false;
	}

	private getPackageResourcePattern(item: ResourceItem): string {
		const baseDir = item.metadata.baseDir ?? dirname(item.path);
		return relative(baseDir, item.path);
	}
}

export class ConfigSelectorComponent extends Container implements Focusable {
	private header: ConfigSelectorHeader;
	private resourceList: ResourceList;
	private writeScope: ConfigWriteScope;

	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.resourceList.focused = value;
	}

	constructor(
		resolvedPaths: ScopedResolvedPaths,
		settingsManager: SettingsManager,
		cwd: string,
		agentDir: string,
		onClose: () => void,
		onExit: () => void,
		requestRender: () => void,
		terminalHeight?: number,
		writeScope: ConfigWriteScope = "global",
		projectModeAvailable = true,
	) {
		super();

		this.writeScope = writeScope;
		const groupsByScope = {
			global: buildGroups(resolvedPaths.global, cwd, agentDir, "global"),
			project: buildGroups(resolvedPaths.project, cwd, agentDir, "project"),
		};

		// Add header
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.header = new ConfigSelectorHeader(this.writeScope, projectModeAvailable);
		this.addChild(this.header);
		this.addChild(new Spacer(1));

		// Resource list
		this.resourceList = new ResourceList(
			groupsByScope,
			settingsManager,
			cwd,
			agentDir,
			terminalHeight,
			this.writeScope,
		);
		this.resourceList.onCancel = onClose;
		this.resourceList.onExit = onExit;
		this.resourceList.onToggle = () => requestRender();
		if (projectModeAvailable) {
			this.resourceList.onSwitchMode = () => {
				this.switchWriteScope();
				requestRender();
			};
		}
		this.addChild(this.resourceList);

		// Bottom border
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
	}

	private switchWriteScope(): void {
		this.writeScope = this.writeScope === "global" ? "project" : "global";
		this.header.setWriteScope(this.writeScope);
		this.resourceList.setWriteScope(this.writeScope);
	}

	getResourceList(): ResourceList {
		return this.resourceList;
	}
}
