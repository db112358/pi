import type { Api, OpenAICompletionsCompat, OpenAIResponsesCompat } from "../../../src/types.ts";
import { getEffortThinkingLevelMap } from "../../models-dev-reasoning-options.ts";
import { type DefinedRule, defineProvider, rule } from "../dsl.ts";
import { type ModelsDevRoute, modelsDev } from "../models-dev.ts";
import { getGoogleThinkingLevelMap } from "./google.ts";

// OpenCode Zen and Go serve several upstream APIs behind one base path. models.dev's
// provider.npm field says which SDK the model expects:
// - @ai-sdk/openai → openai-responses
// - @ai-sdk/anthropic → anthropic-messages
// - @ai-sdk/google → google-generative-ai
// - null/undefined/@ai-sdk/openai-compatible → openai-completions

const OPENCODE_LONG_CACHE_RETENTION_UNSUPPORTED_MODEL_IDS = new Set([
	"opencode:deepseek-v4-flash",
	"opencode:deepseek-v4-pro",
	"opencode:kimi-k2.5",
	"opencode:kimi-k2.6",
	"opencode:minimax-m2.7",
	"opencode-go:kimi-k2.6",
]);

function opencodeRoute(provider: "opencode" | "opencode-go", basePath: string) {
	return (id: string, entry: { provider?: { npm?: string } }): ModelsDevRoute => {
		const npm = entry.provider?.npm;
		let api: Api;
		let baseUrl: string;
		let compat: OpenAICompletionsCompat | OpenAIResponsesCompat | undefined;

		if (npm === "@ai-sdk/openai") {
			api = "openai-responses";
			baseUrl = `${basePath}/v1`;
			compat = { sessionAffinityFormat: "openai-nosession" };
		} else if (npm === "@ai-sdk/anthropic") {
			api = "anthropic-messages";
			// Anthropic SDK appends /v1/messages to baseURL
			baseUrl = basePath;
		} else if (npm === "@ai-sdk/google") {
			api = "google-generative-ai";
			baseUrl = `${basePath}/v1`;
		} else if (npm === "@ai-sdk/alibaba") {
			api = "openai-completions";
			baseUrl = `${basePath}/v1`;
			compat = { cacheControlFormat: "anthropic" };
		} else {
			api = "openai-completions";
			baseUrl = `${basePath}/v1`;
		}

		if (provider === "opencode" && id === "grok-build-0.1") {
			compat = { ...(compat ?? {}), supportsReasoningEffort: false };
		}
		if (id === "kimi-k2.6") {
			// OpenCode Kimi K2.6 accepts Anthropic-style thinking objects
			// and rejects string thinking values or combined reasoning_effort.
			compat = { ...(compat ?? {}), thinkingFormat: "deepseek", supportsReasoningEffort: false };
		}

		// Fix known mismatches between models.dev npm data and actual OpenCode Go endpoint
		// behaviour. models.dev reports these models as @ai-sdk/anthropic, but the OpenCode Go
		// endpoints either don't accept Anthropic SDK auth (MiniMax M2.7) or are served through
		// the OpenAI-compatible /v1/chat/completions path (Qwen 3.5/3.6). Switch them to
		// openai-completions so requests use Bearer auth and the standard endpoint.
		if (provider === "opencode-go") {
			if (id === "minimax-m2.7") {
				api = "openai-completions";
				baseUrl = `${basePath}/v1`;
			}
			if (id === "qwen3.5-plus" || id === "qwen3.6-plus") {
				api = "openai-completions";
				baseUrl = `${basePath}/v1`;
				// Qwen/DashScope uses enable_thinking at the top level.
				compat = { ...(compat ?? {}), thinkingFormat: "qwen" };
			}
		}

		if (api === "openai-completions") {
			compat = { ...(compat ?? {}), maxTokensField: "max_tokens" };
			if (OPENCODE_LONG_CACHE_RETENTION_UNSUPPORTED_MODEL_IDS.has(`${provider}:${id}`)) {
				compat = { ...compat, supportsLongCacheRetention: false };
			}
		}

		return { api, baseUrl, ...(compat ? { compat } : {}) };
	};
}

const geminiThinkingLevels = rule({
	why: "Gemini models keep their cataloged effort levels through OpenCode.",
	match: { api: "google-generative-ai" },
	apply: (model, context) => {
		const map = getGoogleThinkingLevelMap(model.id, context.reasoningOptions ?? []);
		if (map) model.thinkingLevelMap = map;
	},
});

const sharedRules: DefinedRule[] = [
	geminiThinkingLevels,
	rule({
		why: "OpenCode only serves Codex Spark through the ChatGPT backend, not its Zen/Go endpoints.",
		match: { id: "gpt-5.3-codex-spark" },
		drop: true,
		mayMatchNothing: true,
	}),
	rule({
		why: "OpenCode lists Claude Sonnet 4/4.5 with 1M context; the actual limit is 200K.",
		match: { id: ["claude-sonnet-4-5", "claude-sonnet-4"] },
		set: { contextWindow: 200000 },
		mayMatchNothing: true,
	}),
	rule({
		why: "OpenCode serves GPT-5.4 with OpenAI's short-context limits.",
		match: { id: "gpt-5.4" },
		set: { contextWindow: 272000, maxTokens: 128000 },
		mayMatchNothing: true,
	}),
];

export const opencode = defineProvider({
	id: "opencode",
	source: modelsDev({
		provider: "opencode",
		key: "opencode",
		api: "openai-completions",
		baseUrl: "https://opencode.ai/zen/v1",
		skipDeprecated: true,
		route: opencodeRoute("opencode", "https://opencode.ai/zen"),
	}),
	rules: sharedRules,
});

export const opencodeGo = defineProvider({
	id: "opencode-go",
	source: modelsDev({
		provider: "opencode-go",
		key: "opencode-go",
		api: "openai-completions",
		baseUrl: "https://opencode.ai/zen/go/v1",
		skipDeprecated: true,
		route: opencodeRoute("opencode-go", "https://opencode.ai/zen/go"),
	}),
	rules: [
		...sharedRules,
		rule({
			why: "OpenCode Go passes DeepSeek V4.1 Flash effort levels through as cataloged (#9485).",
			match: { id: "deepseek-v4.1-flash" },
			apply: (model, context) => {
				const map = getEffortThinkingLevelMap(context.reasoningOptions ?? []);
				if (map) model.thinkingLevelMap = map;
			},
		}),
	],
});
