/**
 * Presentation for the extensions tool.
 */

import { Text } from "@earendil-works/pi-tui";
import type { ToolDefinition } from "../../extensions/types.ts";
import { getTextOutput } from "../render-utils.ts";

export const extensionsRenderers: Pick<ToolDefinition<any, any>, "renderCall" | "renderResult"> = {
	renderCall(args, theme, context) {
		const name = (args as { name?: string } | undefined)?.name;
		const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
		text.setText(`${theme.fg("toolTitle", theme.bold("extensions"))}${name ? theme.fg("accent", ` ${name}`) : ""}`);
		return text;
	},
	renderResult(result, options, theme, context) {
		const output = getTextOutput(result, context.showImages).trim();
		const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
		if (!output) {
			text.setText("");
			return text;
		}
		const lines = output.split("\n");
		const maxLines = options.expanded ? lines.length : 20;
		text.setText(
			`\n${lines
				.slice(0, maxLines)
				.map((line) => theme.fg("toolOutput", line))
				.join("\n")}`,
		);
		return text;
	},
};
