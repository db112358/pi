import { describe, expect, it } from "vitest";
import type { AssistantMessage } from "../src/types.ts";
import { AssistantMessageEventStream, EventStream } from "../src/utils/event-stream.ts";

// Regression tests for https://github.com/earendil-works/pi/issues/9055
describe("EventStream", () => {
	it("drains buffered events in order and ignores events pushed after completion", async () => {
		const stream = new EventStream<number, number>(
			(event) => event === 3,
			(event) => event,
		);
		stream.push(1);
		stream.push(2);
		stream.push(3);
		stream.push(4);

		expect(await stream.result()).toBe(3);

		const events: number[] = [];
		for await (const event of stream) {
			events.push(event);
		}
		expect(events).toEqual([1, 2, 3]);
	});

	it("preserves order when events arrive after buffered draining starts", async () => {
		const stream = new EventStream<number, number>(
			() => false,
			(event) => event,
		);
		stream.push(1);
		stream.push(2);

		const iterator = stream[Symbol.asyncIterator]();
		expect(await iterator.next()).toEqual({ value: 1, done: false });

		stream.push(3);
		expect(await iterator.next()).toEqual({ value: 2, done: false });
		expect(await iterator.next()).toEqual({ value: 3, done: false });

		stream.end(3);
		expect(await iterator.next()).toEqual({ value: undefined, done: true });
	});

	it("delivers events to waiting consumers in registration order", async () => {
		const stream = new EventStream<number, number>(
			() => false,
			(event) => event,
		);
		const firstIterator = stream[Symbol.asyncIterator]();
		const secondIterator = stream[Symbol.asyncIterator]();
		const firstEvent = firstIterator.next();
		const secondEvent = secondIterator.next();

		stream.push(1);
		stream.push(2);

		expect(await firstEvent).toEqual({ value: 1, done: false });
		expect(await secondEvent).toEqual({ value: 2, done: false });
	});

	it("drains buffered events after end and resolves the explicit result", async () => {
		const stream = new EventStream<number, string>(
			() => false,
			(event) => String(event),
		);
		stream.push(1);
		stream.push(2);
		stream.end("complete");

		expect(await stream.result()).toBe("complete");

		const events: number[] = [];
		for await (const event of stream) {
			events.push(event);
		}
		expect(events).toEqual([1, 2]);
	});

	it("wakes all waiting consumers when ended without a result", async () => {
		const stream = new EventStream<number, number>(
			() => false,
			(event) => event,
		);
		const firstIterator = stream[Symbol.asyncIterator]();
		const secondIterator = stream[Symbol.asyncIterator]();
		const firstEvent = firstIterator.next();
		const secondEvent = secondIterator.next();

		stream.end();

		expect(await firstEvent).toEqual({ value: undefined, done: true });
		expect(await secondEvent).toEqual({ value: undefined, done: true });
	});
});

function message(timestamp: number, durationMs?: number): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "openai-responses",
		provider: "openai",
		model: "m",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp,
		...(durationMs === undefined ? {} : { durationMs }),
	};
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("AssistantMessageEventStream timing", () => {
	it("sets durationMs on the final done or error message of a response it saw start", async () => {
		const done = new AssistantMessageEventStream();
		const answer = message(Date.now());
		await sleep(20);
		done.push({ type: "done", reason: "stop", message: answer });
		expect(answer.durationMs).toBeGreaterThanOrEqual(15);
		expect((await done.result()).durationMs).toBe(answer.durationMs);

		const failed = new AssistantMessageEventStream();
		const error = { ...message(Date.now()), stopReason: "error" as const };
		failed.push({ type: "error", reason: "error", error });
		expect(error.durationMs).toBeGreaterThanOrEqual(0);

		const ended = new AssistantMessageEventStream();
		const result = message(Date.now());
		ended.end(result);
		expect(result.durationMs).toBeGreaterThanOrEqual(0);
	});

	it("keeps an existing duration, so a forwarding stream keeps the inner measurement", async () => {
		const outer = new AssistantMessageEventStream();
		await sleep(20);
		const inner = new AssistantMessageEventStream();
		const answer = message(Date.now());
		inner.push({ type: "done", reason: "stop", message: answer });
		const measured = answer.durationMs;
		outer.push({ type: "done", reason: "stop", message: answer });
		expect(answer.durationMs).toBe(measured);
		expect(measured).toBeLessThan(20);

		const preset = message(Date.now(), 1234);
		new AssistantMessageEventStream().push({ type: "done", reason: "stop", message: preset });
		expect(preset.durationMs).toBe(1234);
	});

	it("leaves a message untimed when it started before the stream, such as a fetched deferred result", () => {
		const fetched = message(Date.now() - 60_000);
		new AssistantMessageEventStream().push({ type: "done", reason: "stop", message: fetched });
		expect(fetched.durationMs).toBeUndefined();
	});

	it("does not time a message pushed after the stream completed", () => {
		const stream = new AssistantMessageEventStream();
		stream.push({ type: "done", reason: "stop", message: message(Date.now()) });
		const late = message(Date.now());
		stream.push({ type: "done", reason: "stop", message: late });
		expect(late.durationMs).toBeUndefined();
	});

	it("stamps firstTokenMs at the first content delta, thinking and tool calls included", async () => {
		for (const type of ["text_delta", "thinking_delta", "toolcall_delta"] as const) {
			const stream = new AssistantMessageEventStream();
			const partial = message(Date.now());
			await sleep(10);
			stream.push({ type, contentIndex: 0, delta: "x", partial });
			await sleep(15);
			const answer = message(Date.now());
			stream.push({ type: "done", reason: "stop", message: answer });
			const first = answer.firstTokenMs;
			if (first === undefined) throw new Error(`${type}: firstTokenMs was not stamped`);
			expect(first).toBeGreaterThanOrEqual(5);
			expect(first).toBeLessThan(answer.durationMs!);
		}
	});

	it("stamps firstTokenMs once, so a later delta cannot move it", async () => {
		const stream = new AssistantMessageEventStream();
		const partial = message(Date.now());
		stream.push({ type: "thinking_delta", contentIndex: 0, delta: "a", partial });
		const first = partial.firstTokenMs;
		await sleep(15);
		stream.push({ type: "text_delta", contentIndex: 1, delta: "b", partial });
		const answer = message(Date.now());
		stream.push({ type: "done", reason: "stop", message: answer });
		const stamped = answer.firstTokenMs;
		if (stamped === undefined) throw new Error("firstTokenMs was not stamped");
		// The later delta did not move the stamp: it still points at the first one.
		expect(stamped).toBeLessThan(10);
		expect(stamped).toBeGreaterThanOrEqual(0);
		expect(partial.firstTokenMs).toBe(first);
	});

	it("leaves firstTokenMs unset when no content streamed", async () => {
		const stream = new AssistantMessageEventStream();
		const partial = message(Date.now());
		stream.push({ type: "text_start", contentIndex: 0, partial });
		const answer = message(Date.now());
		stream.push({ type: "done", reason: "stop", message: answer });
		expect(answer.durationMs).toBeGreaterThanOrEqual(0);
		expect(answer.firstTokenMs).toBeUndefined();
	});
});
