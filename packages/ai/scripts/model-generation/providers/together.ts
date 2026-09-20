import type { OpenAICompletionsCompat, ThinkingLevelMap } from "../../../src/types.ts";
import { defineProvider, rule } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";
import { TOGETHER_BASE_URL, TOGETHER_REASONING_ONLY_MODEL_IDS } from "../shared.ts";

const TOGETHER_BASE_COMPAT: OpenAICompletionsCompat = {
	supportsStore: false,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	maxTokensField: "max_tokens",
	supportsStrictMode: false,
	supportsLongCacheRetention: false,
};

// Together exposes reasoning three ways: a toggle (`reasoning: { enabled }`), OpenAI
// `reasoning_effort`, or both. Models not listed below use the toggle.
const TOGETHER_REASONING_EFFORT_MODEL_IDS = new Set(["openai/gpt-oss-20b", "openai/gpt-oss-120b"]);
const TOGETHER_TOGGLE_REASONING_EFFORT_MODEL_IDS = new Set(["deepseek-ai/DeepSeek-V4-Pro"]);
const TOGETHER_REASONING_ONLY = new Set<string>(TOGETHER_REASONING_ONLY_MODEL_IDS);

interface TogetherReasoningMode {
	compat: OpenAICompletionsCompat;
	thinkingLevelMap: ThinkingLevelMap;
}

const TOGETHER_REASONING_MODES = {
	effort: {
		compat: { ...TOGETHER_BASE_COMPAT, supportsReasoningEffort: true, thinkingFormat: "openai" },
		thinkingLevelMap: { off: null, minimal: null },
	},
	toggleAndEffort: {
		compat: { ...TOGETHER_BASE_COMPAT, thinkingFormat: "together", supportsReasoningEffort: true },
		thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", xhigh: null },
	},
	reasoningOnly: {
		compat: TOGETHER_BASE_COMPAT,
		thinkingLevelMap: { off: null, minimal: null, low: null, medium: null },
	},
	toggle: {
		compat: { ...TOGETHER_BASE_COMPAT, thinkingFormat: "together" },
		thinkingLevelMap: { minimal: null, low: null, medium: null },
	},
} satisfies Record<string, TogetherReasoningMode>;

function getTogetherReasoningMode(modelId: string): TogetherReasoningMode {
	if (TOGETHER_REASONING_EFFORT_MODEL_IDS.has(modelId)) return TOGETHER_REASONING_MODES.effort;
	if (TOGETHER_TOGGLE_REASONING_EFFORT_MODEL_IDS.has(modelId)) return TOGETHER_REASONING_MODES.toggleAndEffort;
	if (TOGETHER_REASONING_ONLY.has(modelId)) return TOGETHER_REASONING_MODES.reasoningOnly;
	return TOGETHER_REASONING_MODES.toggle;
}

export const together = defineProvider({
	id: "together",
	source: modelsDev({
		provider: "together",
		key: ["together", "togetherai", "together-ai"],
		api: "openai-completions",
		baseUrl: TOGETHER_BASE_URL,
		compat: TOGETHER_BASE_COMPAT,
		skipDeprecated: true,
		route: (id, entry) => (entry.reasoning === true ? { compat: getTogetherReasoningMode(id).compat } : undefined),
	}),
	rules: [
		rule({
			why: "Together reasoning controls differ per model family; expose only the levels each mode can honor.",
			match: { reasoning: true },
			apply: (model) => {
				model.thinkingLevelMap = { ...getTogetherReasoningMode(model.id).thinkingLevelMap };
			},
		}),
	],
});
