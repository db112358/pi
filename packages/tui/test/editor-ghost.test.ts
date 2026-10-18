import assert from "node:assert";
import { describe, it } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { Editor, type EditorTheme } from "../src/components/editor.ts";
import type { TUI } from "../src/tui.ts";
import { TuiMainScreen } from "../src/tui-main-screen.ts";
import { visibleWidth } from "../src/utils.ts";
import { defaultEditorTheme } from "./test-themes.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

function createTestTUI(cols = 80, rows = 24): TUI {
	return new TuiMainScreen(new VirtualTerminal(cols, rows));
}

function renderText(editor: Editor, width = 60): string {
	return stripVTControlCharacters(editor.render(width).join("\n"));
}

const RIGHT = "\x1b[C";
const LEFT = "\x1b[D";
const ENTER = "\r";
const UNDO = "\x1b[45;5u";
const GHOST = "yes, go ahead";

describe("Editor ghost text", () => {
	it("renders the suggestion after the cursor", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setGhostText(GHOST);

		assert.ok(renderText(editor).includes(GHOST));
	});

	it("does not render the suggestion while the cursor is before the end of the text", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setText("abc");
		editor.handleInput(LEFT);
		editor.setGhostText("def");

		assert.ok(!renderText(editor).includes("def"));
	});

	it("does not change the buffer or notify listeners", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		const changes: string[] = [];
		editor.onChange = (text) => changes.push(text);
		editor.setGhostText(GHOST);

		assert.strictEqual(editor.getText(), "");
		assert.strictEqual(editor.getExpandedText(), "");
		assert.deepStrictEqual(changes, []);
	});

	it("accepts the suggestion on Right at the end of the text", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		const changes: string[] = [];
		editor.onChange = (text) => changes.push(text);
		editor.setGhostText(GHOST);

		editor.handleInput(RIGHT);

		assert.strictEqual(editor.getText(), GHOST);
		assert.strictEqual(editor.getGhostText(), undefined);
		assert.deepStrictEqual(changes, [GHOST]);
	});

	it("accepts the suggestion after typed text instead of moving the cursor", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.handleInput("y");
		editor.setGhostText("es, go ahead");

		editor.handleInput(RIGHT);

		assert.strictEqual(editor.getText(), GHOST);
	});

	it("moves the cursor instead of accepting when the cursor is before the end", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setText("abc");
		editor.handleInput(LEFT);
		editor.setGhostText("def");

		editor.handleInput(RIGHT);

		assert.strictEqual(editor.getText(), "abc");
		assert.deepStrictEqual(editor.getCursor(), { line: 0, col: 3 });
		assert.strictEqual(editor.getGhostText(), "def");
	});

	it("undoes an accepted suggestion as one edit", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.handleInput("y");
		editor.setGhostText("es");
		editor.handleInput(RIGHT);

		editor.handleInput(UNDO);

		assert.strictEqual(editor.getText(), "y");
	});

	it("retires the suggestion when the user types", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setGhostText(GHOST);

		editor.handleInput("n");

		assert.strictEqual(editor.getText(), "n");
		assert.strictEqual(editor.getGhostText(), undefined);
		assert.ok(!renderText(editor).includes("go ahead"));
	});

	it("retires the suggestion when the text is replaced, inserted, or submitted", () => {
		const replaced = new Editor(createTestTUI(), defaultEditorTheme);
		replaced.setGhostText("yes");
		replaced.setText("something else");
		assert.strictEqual(replaced.getGhostText(), undefined);

		const inserted = new Editor(createTestTUI(), defaultEditorTheme);
		inserted.setGhostText("yes");
		inserted.insertTextAtCursor("attachment");
		assert.strictEqual(inserted.getGhostText(), undefined);

		const submitted = new Editor(createTestTUI(), defaultEditorTheme);
		let submittedText: string | undefined;
		submitted.onSubmit = (text) => {
			submittedText = text;
		};
		submitted.setGhostText("yes");
		submitted.handleInput(ENTER);
		assert.strictEqual(submitted.getGhostText(), undefined);
		assert.strictEqual(submittedText, "");
	});

	it("retires the suggestion when history replaces the text", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.addToHistory("earlier prompt");
		editor.setGhostText("yes");

		editor.handleInput("\x1b[A"); // Up - browse history

		assert.strictEqual(editor.getText(), "earlier prompt");
		assert.strictEqual(editor.getGhostText(), undefined);
	});

	it("clears the suggestion when set to undefined", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setGhostText(GHOST);
		editor.setGhostText(undefined);

		assert.strictEqual(editor.getGhostText(), undefined);
		assert.ok(!renderText(editor).includes(GHOST));
	});

	it("ignores an empty suggestion", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setGhostText("");

		assert.strictEqual(editor.getGhostText(), undefined);
	});

	it("keeps the rendered line within the editor width", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setGhostText("x".repeat(200));

		for (const line of editor.render(40)) {
			assert.ok(visibleWidth(line) <= 40, `line too wide: ${line}`);
		}
	});

	it("does not widen the editor when there is no room after the cursor", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setText("x".repeat(35));
		editor.setGhostText("more");

		const lines = editor.render(40);
		for (const line of lines) {
			assert.ok(visibleWidth(line) <= 40, `line too wide: ${line}`);
		}
	});

	it("shows and accepts only the first line of a multi-line suggestion", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setGhostText("yes\nand then more");

		assert.strictEqual(editor.getGhostText(), "yes");
		editor.handleInput(RIGHT);
		assert.strictEqual(editor.getText(), "yes");
	});

	it("renders the suggestion once, on the last line of a wrapped buffer", () => {
		const editor = new Editor(createTestTUI(), defaultEditorTheme);
		editor.setText("a".repeat(120));
		editor.setGhostText("ghost");

		const rendered = renderText(editor);
		assert.strictEqual(rendered.split("ghost").length - 1, 1);
	});

	it("styles the suggestion with the editor theme", () => {
		const theme: EditorTheme = { ...defaultEditorTheme, ghostText: (text) => `<${text}>` };
		const editor = new Editor(createTestTUI(), theme);
		editor.setGhostText(GHOST);

		assert.ok(renderText(editor).includes(`<${GHOST}>`));
	});
});
