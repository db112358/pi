import { describe, expect, it } from "vitest";
import type { ToolCall } from "../src/types.ts";
import { finalizeToolCallArguments } from "../src/utils/json-parse.ts";

function createToolCall(): ToolCall {
	return { type: "toolCall", id: "call_1", name: "edit", arguments: {} };
}

describe("finalizeToolCallArguments", () => {
	it("parses complete valid JSON without setting the malformed marker", () => {
		const toolCall = createToolCall();
		finalizeToolCallArguments(toolCall, '{"path":"src/mime.ts","edits":[{"oldText":"a","newText":"b"}]}');
		expect(toolCall.arguments).toEqual({ path: "src/mime.ts", edits: [{ oldText: "a", newText: "b" }] });
		expect(toolCall.malformedArguments).toBeUndefined();
	});

	it("applies lossless string-escape repair without setting the malformed marker", () => {
		const toolCall = createToolCall();
		finalizeToolCallArguments(toolCall, String.raw`{"path":"A\H","text":"col1	col2"}`);
		expect(toolCall.arguments).toEqual({ path: "A\\H", text: "col1\tcol2" });
		expect(toolCall.malformedArguments).toBeUndefined();
	});

	it("treats empty input as empty arguments", () => {
		const toolCall = createToolCall();
		toolCall.arguments = { stale: "preview" };
		finalizeToolCallArguments(toolCall, "");
		expect(toolCall.arguments).toEqual({});
		expect(toolCall.malformedArguments).toBeUndefined();
	});

	it("is a no-op when no scratch buffer is present", () => {
		const toolCall = createToolCall();
		toolCall.arguments = { path: "a.ts" };
		finalizeToolCallArguments(toolCall, undefined);
		expect(toolCall.arguments).toEqual({ path: "a.ts" });
		expect(toolCall.malformedArguments).toBeUndefined();
	});

	it("marks truncated JSON as malformed instead of salvaging a prefix", () => {
		const toolCall = createToolCall();
		const truncated = '{"path":"src/mime.ts","edits":[{"oldText":"a","newText":"b"},{"oldText":"c","newT';
		finalizeToolCallArguments(toolCall, truncated);
		expect(toolCall.arguments).toEqual({});
		expect(toolCall.malformedArguments).toBe(truncated);
	});

	it("does not produce partial-json salvage artifacts from malformed arrays", () => {
		const toolCall = createToolCall();
		// Regression: partial-json salvage turned this malformed edits array into
		// the observed artifact [{...}, {}, "newText"], which can pass schema
		// validation despite meaning something entirely different.
		const malformed = '{"path":"a.ts","edits":[{"oldText":"x","newText":"y"},{},"newText"';
		finalizeToolCallArguments(toolCall, malformed);
		expect(toolCall.arguments).toEqual({});
		expect(toolCall.malformedArguments).toBe(malformed);
	});

	it("marks valid non-object JSON as malformed", () => {
		const toolCall = createToolCall();
		finalizeToolCallArguments(toolCall, '["not","an","object"]');
		expect(toolCall.arguments).toEqual({});
		expect(toolCall.malformedArguments).toBe('["not","an","object"]');
	});
});
