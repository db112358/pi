import type { ModelCost, OpenAICompletionsCompat, ThinkingLevelMap } from "../../src/types.ts";
import { roundCost } from "./dsl.ts";

// Values shared by more than one provider declaration or rule pack. Anything used in a
// single place belongs next to its provider or rule instead.

export const OPENAI_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_LONG_CONTEXT_INPUT_THRESHOLD = 272000;

/** OpenAI models whose long-context requests are billed at higher rates. */
export const OPENAI_LONG_CONTEXT_PRICING_MODEL_IDS = [
	"gpt-5.4",
	"gpt-5.4-pro",
	"gpt-5.5",
	"gpt-5.5-pro",
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.6-luna",
	"gpt-6-astra",
] as const;

export function withOpenAiLongContextPricing(cost: ModelCost): ModelCost {
	return {
		...cost,
		tiers: [
			{
				inputTokensAbove: OPENAI_LONG_CONTEXT_INPUT_THRESHOLD,
				input: roundCost(cost.input * 2),
				output: roundCost(cost.output * 1.5),
				cacheRead: roundCost(cost.cacheRead * 2),
				cacheWrite: roundCost(cost.cacheWrite * 2),
			},
		],
	};
}

// OpenAI reduced GPT-5.6 Terra and Luna prices on 2026-07-30. Keep these
// authoritative values until models.dev and passthrough catalogs catch up.
// https://developers.openai.com/api/docs/pricing
export const OPENAI_GPT_56_STANDARD_COSTS: Record<string, ModelCost> = {
	"gpt-5.6-luna": { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
	"gpt-5.6-terra": { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2.5 },
};
export const OPENAI_GPT_56_SOL_COST: ModelCost = { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 6.25 };
export const OPENAI_GPT_6_ASTRA_COST: ModelCost = { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 };

/** OpenAI Responses models with client-executed tool search. */
export const OPENAI_TOOL_SEARCH_MODEL_IDS = [
	"gpt-5.4",
	"gpt-5.4-mini",
	"gpt-5.4-pro",
	"gpt-5.5",
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.6-luna",
	"gpt-6-astra",
] as const;
/** OpenAI models that accept developer messages after the conversation has started. */
export const OPENAI_MID_CONVO_SYSTEM_MESSAGE_MODEL_IDS = OPENAI_TOOL_SEARCH_MODEL_IDS;

export const OPENAI_XHIGH_MODEL_ID_PARTS = [
	"gpt-5.2",
	"gpt-5.3",
	"gpt-5.4",
	"gpt-5.5",
	"gpt-5.6",
	"gpt-6-astra",
] as const;
export const OPENAI_MAX_MODEL_ID_PARTS = ["gpt-5.6", "gpt-6-astra"] as const;

export function supportsOpenAiXhigh(modelId: string): boolean {
	return OPENAI_XHIGH_MODEL_ID_PARTS.some((part) => modelId.includes(part));
}

export const KIMI_K3_MAX_TOKENS = 131072;
export const KIMI_K3_COST: ModelCost = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 };

export const DEEPSEEK_COMPAT: OpenAICompletionsCompat = {
	requiresReasoningContentOnAssistantMessages: true,
	thinkingFormat: "deepseek",
};
export const DEEPSEEK_V4_THINKING_LEVEL_MAP: ThinkingLevelMap = {
	minimal: null,
	low: null,
	medium: null,
	high: "high",
	max: "max",
};
export const DEEPSEEK_V4_FLASH_THINKING_LEVEL_MAP: ThinkingLevelMap = {
	...DEEPSEEK_V4_THINKING_LEVEL_MAP,
	low: "low",
};

export const QWEN_TOKEN_PLAN_PROVIDER_IDS = [
	"qwen-token-plan",
	"qwen-token-plan-cn",
	"qwen-token-plan-individual",
] as const;

export const TOGETHER_BASE_URL = "https://api.together.ai/v1";
/** Together models that always reason and reject the reasoning toggle. */
export const TOGETHER_REASONING_ONLY_MODEL_IDS = ["deepseek-ai/DeepSeek-R1", "MiniMaxAI/MiniMax-M2.7"] as const;

/** Claude id fragments across providers; providers spell versions with `-` or `.`. */
export const ANTHROPIC_ADAPTIVE_THINKING_ID_PARTS = [
	"opus-4-6",
	"opus-4.6",
	"opus-4-7",
	"opus-4.7",
	"opus-4-8",
	"opus-4.8",
	"opus-5",
	"opus.5",
	"sonnet-4-6",
	"sonnet-4.6",
	"sonnet-5",
	"sonnet.5",
	"fable-5",
	"mythos-5",
] as const;

export function supportsAnthropicMidConvoEffort(modelId: string): boolean {
	const id = modelId.toLowerCase().replace(/^~?anthropic\//, "");
	return /^claude-opus-5(?:-\d{8})?$/.test(id) || /^claude-(?:fable|mythos)-5(?:[.-]1)(?:-\d{8})?$/.test(id);
}

export function supportsAnthropicMidConvoSystemMessages(modelId: string): boolean {
	return (
		/^claude-opus-(?:4[.-]8|5)(?:-\d{8})?$/.test(modelId) ||
		/^claude-(?:fable|mythos)-5(?:[.-]1)?(?:-\d{8})?$/.test(modelId)
	);
}

export function isGemma4Model(modelId: string): boolean {
	return /gemma-?4/.test(modelId.toLowerCase());
}
