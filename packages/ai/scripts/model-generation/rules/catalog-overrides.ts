import { definePack, rule } from "../dsl.ts";
import { DEEPSEEK_COMPAT, KIMI_K3_MAX_TOKENS, QWEN_TOKEN_PLAN_PROVIDER_IDS } from "../shared.ts";

// Corrections that span providers. Single-provider corrections live with their provider.

export const catalogOverridesPack = definePack("catalog-overrides", [
	rule({
		why: "Claude Opus/Sonnet 4.6 have a 1M context window; upstream catalogs still report 200K.",
		match: {
			provider: ["anthropic", "opencode", "opencode-go"],
			id: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-opus-4.6", "claude-sonnet-4.6"],
		},
		set: { contextWindow: 1000000 },
	}),
	rule({
		why: "Keep Kimi K3's canonical output limit when gateway metadata is missing or incorrect.",
		match: {
			when: (model) =>
				(model.provider === "openrouter" &&
					(model.id === "moonshotai/kimi-k3" || model.id === "~moonshotai/kimi-latest")) ||
				(model.provider === "vercel-ai-gateway" && model.id === "moonshotai/kimi-k3"),
		},
		set: { maxTokens: KIMI_K3_MAX_TOKENS },
		mayMatchNothing: true,
	}),
	rule({
		why: "DeepSeek V4 needs reasoning_content replayed on assistant messages everywhere; direct-style endpoints also take DeepSeek's thinking format, while OpenRouter and OpenCode keep native reasoning_effort (#9485).",
		match: { api: "openai-completions", idIncludes: "deepseek-v4", not: { provider: QWEN_TOKEN_PLAN_PROVIDER_IDS } },
		apply: (model) => {
			const preservesNativeReasoningEffort = model.provider === "openrouter" || model.provider === "opencode";
			model.compat = {
				...model.compat,
				...(preservesNativeReasoningEffort
					? {
							requiresReasoningContentOnAssistantMessages:
								DEEPSEEK_COMPAT.requiresReasoningContentOnAssistantMessages,
						}
					: DEEPSEEK_COMPAT),
			};
		},
	}),
]);
