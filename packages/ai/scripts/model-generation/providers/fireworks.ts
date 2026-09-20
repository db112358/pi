import type { AnthropicMessagesCompat, OpenAICompletionsCompat } from "../../../src/types.ts";
import { defineProvider } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";

// Fireworks prompt caching uses automatic prefix matching + session affinity.
// x-session-affinity routes requests to the same replica for cache hits.
// cache_control on tools and eager_input_streaming are not supported.
// See: https://docs.fireworks.ai/tools-sdks/anthropic-compatibility
const FIREWORKS_MESSAGES_COMPAT: AnthropicMessagesCompat = {
	allowEmptySignature: true,
	sendSessionAffinityHeaders: true,
	supportsEagerToolInputStreaming: false,
	supportsCacheControlOnTools: false,
	supportsLongCacheRetention: false,
};
const FIREWORKS_COMPLETIONS_COMPAT: OpenAICompletionsCompat = {
	supportsStore: false,
	supportsDeveloperRole: false,
	sendSessionAffinityHeaders: true,
	supportsLongCacheRetention: false,
};
const FIREWORKS_KIMI_K3_COMPAT: OpenAICompletionsCompat = {
	...FIREWORKS_COMPLETIONS_COMPAT,
	requiresReasoningContentOnAssistantMessages: true,
	thinkingFormat: "openai",
};

// Verified against Fireworks Messages raw_output on 2026-09-10 (#9323).
// Fall back to verified support when models.dev omits effort metadata; this is
// not an allowlist. Any Fireworks Messages model advertising effort uses adaptive thinking.
const FIREWORKS_ADAPTIVE_THINKING_FALLBACK_MODEL_IDS = new Set([
	"accounts/fireworks/models/deepseek-v4-flash-0731",
	"accounts/fireworks/models/deepseek-v4-flash-vision-exp",
	"accounts/fireworks/models/deepseek-v4-pro-0813",
	"accounts/fireworks/models/qwen3p8-max",
	"accounts/fireworks/models/qwen3p8-2p4t-a95b",
]);

export const fireworks = defineProvider({
	id: "fireworks",
	source: modelsDev({
		provider: "fireworks",
		key: "fireworks-ai",
		// Fireworks Anthropic-compatible API - SDK appends /v1/messages.
		api: "anthropic-messages",
		baseUrl: "https://api.fireworks.ai/inference",
		route: (id, entry) => {
			// GLM and Kimi K3 are served through the OpenAI-compatible endpoint.
			if (id.includes("glm-")) {
				return {
					api: "openai-completions",
					baseUrl: "https://api.fireworks.ai/inference/v1",
					compat: FIREWORKS_COMPLETIONS_COMPAT,
				};
			}
			if (id.includes("kimi-k3")) {
				return {
					api: "openai-completions",
					baseUrl: "https://api.fireworks.ai/inference/v1",
					compat: FIREWORKS_KIMI_K3_COMPAT,
				};
			}
			// Use adaptive thinking for cataloged effort controls, with verified fallbacks where
			// models.dev is incomplete. New models need no allowlist entry.
			const adaptive =
				entry.reasoning_options?.some((option) => option.type === "effort") ||
				FIREWORKS_ADAPTIVE_THINKING_FALLBACK_MODEL_IDS.has(id);
			return { compat: { ...FIREWORKS_MESSAGES_COMPAT, ...(adaptive ? { forceAdaptiveThinking: true } : {}) } };
		},
	}),
});
