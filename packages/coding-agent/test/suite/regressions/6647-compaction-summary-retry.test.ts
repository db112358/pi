import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../harness.ts";

describe("issue #6647 compaction summary retry", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("retries a transient split-turn summary failure", async () => {
		const harness = await createHarness({ settings: { compaction: { keepRecentTokens: 1 } } });
		harnesses.push(harness);

		const now = Date.now();
		harness.sessionManager.appendMessage({
			role: "user",
			content: [{ type: "text", text: "A request large enough to split during compaction." }],
			timestamp: now - 1000,
		});
		harness.sessionManager.appendMessage({
			...fauxAssistantMessage("An assistant response that should be retained."),
			timestamp: now,
		});
		harness.session.agent.state.messages = harness.sessionManager.buildSessionContext().messages;

		harness.setResponses([
			fauxAssistantMessage("", {
				stopReason: "error",
				errorMessage: "OpenAI Responses stream ended before a terminal response event",
			}),
			fauxAssistantMessage("## Original Request\nRecovered split-turn summary"),
		]);

		await expect(harness.session.compact()).resolves.toMatchObject({
			summary: expect.stringContaining("Recovered split-turn summary"),
		});
		expect(harness.faux.state.callCount).toBe(2);
	});

	it("retries a transient branch summary failure", async () => {
		const harness = await createHarness();
		harnesses.push(harness);

		const targetId = harness.sessionManager.appendMessage({
			role: "user",
			content: [{ type: "text", text: "Start a branch." }],
			timestamp: Date.now() - 1000,
		});
		harness.sessionManager.appendMessage(fauxAssistantMessage("Initial branch reply."));
		harness.sessionManager.appendMessage({
			role: "user",
			content: [{ type: "text", text: "Abandoned branch work." }],
			timestamp: Date.now(),
		});
		harness.sessionManager.appendMessage(fauxAssistantMessage("Abandoned branch reply."));

		harness.setResponses([
			fauxAssistantMessage("", {
				stopReason: "error",
				errorMessage: "OpenAI Responses stream ended before a terminal response event",
			}),
			fauxAssistantMessage("## Goal\nRecovered branch summary"),
		]);

		const result = await harness.session.navigateTree(targetId, { summarize: true });

		expect(result.cancelled).toBe(false);
		expect(result.summaryEntry?.summary).toContain("Recovered branch summary");
		expect(harness.faux.state.callCount).toBe(2);
	});
});
