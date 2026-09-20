import { defineProvider, rule } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";

// Only these models are served directly by MiniMax's Anthropic-compatible API.
const MINIMAX_DIRECT_SUPPORTED_MODEL_IDS = ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M3"];

const dropUnsupported = rule({
	why: "MiniMax's Anthropic-compatible endpoint only serves the M2.7 and M3 models.",
	match: { not: { id: MINIMAX_DIRECT_SUPPORTED_MODEL_IDS } },
	drop: true,
	mayMatchNothing: true,
});

export const minimax = defineProvider({
	id: "minimax",
	source: modelsDev({
		provider: "minimax",
		key: "minimax",
		api: "anthropic-messages",
		// MiniMax's Anthropic-compatible API - SDK appends /v1/messages
		baseUrl: "https://api.minimax.io/anthropic",
	}),
	rules: [dropUnsupported],
});

export const minimaxCn = defineProvider({
	id: "minimax-cn",
	source: modelsDev({
		provider: "minimax-cn",
		key: "minimax-cn",
		api: "anthropic-messages",
		baseUrl: "https://api.minimaxi.com/anthropic",
	}),
	rules: [dropUnsupported],
});
