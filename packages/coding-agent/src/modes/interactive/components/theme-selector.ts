import {
	Box,
	Container,
	type SelectItem,
	SelectList,
	type SelectListLayoutOptions,
	Spacer,
	Text,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { getAvailableThemes, getSelectListTheme, theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

const THEME_SELECT_LIST_LAYOUT: SelectListLayoutOptions = {
	minPrimaryColumnWidth: 12,
	maxPrimaryColumnWidth: 32,
};

export interface ThemeSelectorOptions {
	title?: string;
	description?: string;
	detectedTheme?: string;
	detectedThemeLabel?: string;
	detectionDescription?: string;
	availableThemes?: string[];
	border?: boolean;
	maxVisible?: number;
	hint?: string;
}

class ThemeDemoComponent {
	constructor(private readonly getSelectedTheme: () => string) {}

	invalidate(): void {
		// No cached state to invalidate.
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const push = (line = "") => lines.push(truncateToWidth(line, width, ""));

		push(` ${theme.fg("mdHeading", theme.bold("Preview"))} ${theme.fg("dim", `(${this.getSelectedTheme()})`)}`);
		push();

		const userBox = new Box(1, 1, (text: string) => theme.bg("userMessageBg", text));
		userBox.addChild(new Text(theme.fg("userMessageText", "Fix the config parser regression."), 0, 0));
		lines.push(...userBox.render(width));

		push();
		push(" I found the issue and will patch it.");
		push();

		const toolBox = new Box(1, 1, (text: string) => theme.bg("toolSuccessBg", text));
		toolBox.addChild(
			new Text(`${theme.fg("toolTitle", theme.bold("edit"))} ${theme.fg("accent", "src/config.ts")}`, 0, 0),
		);
		toolBox.addChild(new Spacer(1));
		toolBox.addChild(
			new Text(
				[
					theme.fg("toolDiffContext", "      ..."),
					theme.fg("toolDiffContext", "  41 const raw = readConfig();"),
					theme.fg("toolDiffRemoved", "- 42 if (!value) return defaultValue;"),
					theme.fg("toolDiffAdded", "+ 42 if (value === undefined) return defaultValue;"),
					theme.fg("toolDiffContext", "  43 return value;"),
					theme.fg("toolDiffContext", "      ..."),
				].join("\n"),
				0,
				0,
			),
		);
		lines.push(...toolBox.render(width));

		push();
		push(" Fixed. Empty strings are preserved.");

		return lines;
	}
}

/**
 * Component that renders a theme selector with a small live preview.
 */
export class ThemeSelectorComponent extends Container {
	private selectList: SelectList;
	private selectedTheme: string;
	private title: string;
	private description: string | undefined;
	private detectionDescription: string | undefined;
	private hint: string;
	private showBorder: boolean;
	private border = new DynamicBorder();
	private demo: ThemeDemoComponent;

	constructor(
		currentTheme: string,
		onSelect: (themeName: string) => void,
		onCancel: () => void,
		onPreview: (themeName: string) => void,
		options: ThemeSelectorOptions = {},
	) {
		super();
		this.selectedTheme = currentTheme;
		this.title = options.title ?? "Theme";
		this.description = options.description;
		this.detectionDescription = options.detectionDescription;
		this.hint = options.hint ?? "Enter to select · Esc to go back";
		this.showBorder = options.border ?? true;
		this.demo = new ThemeDemoComponent(() => this.selectedTheme);

		const themes = options.availableThemes ?? getAvailableThemes();
		const detectedThemeLabel = options.detectedThemeLabel ?? "detected";
		const themeItems: SelectItem[] = themes.map((name) => {
			const annotations: string[] = [];
			if (name === currentTheme) annotations.push(name === options.detectedTheme ? detectedThemeLabel : "current");
			if (name === options.detectedTheme && name !== currentTheme) annotations.push(detectedThemeLabel);
			return {
				value: name,
				label: name,
				description: annotations.length > 0 ? `(${annotations.join(", ")})` : undefined,
			};
		});

		this.selectList = new SelectList(
			themeItems,
			options.maxVisible ?? Math.min(Math.max(themeItems.length, 1), 10),
			getSelectListTheme(),
			THEME_SELECT_LIST_LAYOUT,
		);

		const currentIndex = themes.indexOf(currentTheme);
		if (currentIndex !== -1) {
			this.selectList.setSelectedIndex(currentIndex);
		}

		this.selectList.onSelect = (item) => {
			onSelect(item.value);
		};

		this.selectList.onCancel = () => {
			onCancel();
		};

		this.selectList.onSelectionChange = (item) => {
			this.selectedTheme = item.value;
			onPreview(item.value);
		};
	}

	override invalidate(): void {
		this.border.invalidate();
		this.demo.invalidate();
		this.selectList.invalidate();
	}

	handleInput(data: string): void {
		this.selectList.handleInput(data);
	}

	override render(width: number): string[] {
		const lines: string[] = [];
		const push = (line = "") => lines.push(truncateToWidth(line, width, ""));

		if (this.showBorder) {
			lines.push(...this.border.render(width));
		}
		push(`  ${theme.fg("accent", theme.bold(this.title))}`);
		if (this.description) {
			for (const line of wrapTextWithAnsi(theme.fg("muted", this.description), Math.max(1, width - 4))) {
				push(`  ${line}`);
			}
		}
		if (this.detectionDescription) {
			for (const line of wrapTextWithAnsi(theme.fg("dim", this.detectionDescription), Math.max(1, width - 4))) {
				push(`  ${line}`);
			}
		}
		push();
		lines.push(...this.demo.render(width));
		push();
		lines.push(...this.selectList.render(width));
		push();
		push(`  ${theme.fg("dim", this.hint)}`);
		if (this.showBorder) {
			lines.push(...this.border.render(width));
		}

		return lines;
	}

	getSelectList(): SelectList {
		return this.selectList;
	}
}
