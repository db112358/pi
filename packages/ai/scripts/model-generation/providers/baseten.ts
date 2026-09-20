import type { OpenAICompletionsCompat, ThinkingLevelMap } from "../../../src/types.ts";
import { getEffortThinkingLevelMap } from "../../models-dev-reasoning-options.ts";
import { defineProvider, rule } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";
import type { ModelsDevModel } from "../sources.ts";

const BASETEN_BASE_COMPAT: OpenAICompletionsCompat = {
	supportsStore: false,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	supportsUsageInStreaming: true,
	maxTokensField: "max_tokens",
	supportsStrictMode: true,
	// Baseten automatic prompt caching needs session affinity so related
	// requests land on the same replica. See:
	// https://docs.baseten.co/inference/model-apis/pricing-and-limits
	sendSessionAffinityHeaders: true,
	supportsLongCacheRetention: false,
};
const BASETEN_EFFORT_COMPAT: OpenAICompletionsCompat = {
	...BASETEN_BASE_COMPAT,
	supportsReasoningEffort: true,
	thinkingFormat: "openai",
};
const BASETEN_TOGGLE_COMPAT: OpenAICompletionsCompat = {
	...BASETEN_BASE_COMPAT,
	thinkingFormat: "baseten",
	chatTemplateArgs: { enable_thinking: { $var: "thinking.enabled" } },
};
const BASETEN_TOGGLE_EFFORT_COMPAT: OpenAICompletionsCompat = {
	...BASETEN_EFFORT_COMPAT,
	thinkingFormat: "baseten",
	chatTemplateArgs: { enable_thinking: { $var: "thinking.enabled" } },
};
const BASETEN_TOGGLE_THINKING_LEVEL_MAP: ThinkingLevelMap = {
	off: "off",
	minimal: null,
	low: null,
	medium: null,
	high: "high",
	xhigh: null,
	max: null,
};
const BASETEN_GLM52_THINKING_LEVEL_MAP: ThinkingLevelMap = {
	off: "none",
	minimal: null,
	low: null,
	medium: null,
	high: "high",
	xhigh: null,
	max: "max",
};

// GLM-5.2 supports toggle and effort controls that models.dev does not catalog.
const BASETEN_GLM52_MODEL_IDS = new Set(["zai-org/GLM-5.2", "zai-org/GLM-5.2-Fast"]);

function getBasetenReasoningControls(id: string, entry: ModelsDevModel) {
	const reasoningOptions = entry.reasoning_options ?? [];
	const isGlm52 = BASETEN_GLM52_MODEL_IDS.has(id);
	const supportsToggle = isGlm52 || reasoningOptions.some((option) => option.type === "toggle");
	const supportsEffort = isGlm52 || reasoningOptions.some((option) => option.type === "effort");
	const compat =
		supportsToggle && supportsEffort
			? BASETEN_TOGGLE_EFFORT_COMPAT
			: supportsToggle
				? BASETEN_TOGGLE_COMPAT
				: supportsEffort
					? BASETEN_EFFORT_COMPAT
					: BASETEN_BASE_COMPAT;
	const thinkingLevelMap = isGlm52
		? BASETEN_GLM52_THINKING_LEVEL_MAP
		: supportsToggle
			? BASETEN_TOGGLE_THINKING_LEVEL_MAP
			: getEffortThinkingLevelMap(reasoningOptions);
	return { compat, thinkingLevelMap };
}

export const baseten = defineProvider({
	id: "baseten",
	source: modelsDev({
		provider: "baseten",
		key: "baseten",
		api: "openai-completions",
		baseUrl: "https://inference.baseten.co/v1",
		skipDeprecated: true,
		route: (id, entry) => ({ compat: getBasetenReasoningControls(id, entry).compat }),
	}),
	rules: [
		rule({
			why: "Baseten reasoning controls follow the cataloged toggle/effort options, with GLM-5.2's undocumented controls filled in.",
			match: {},
			apply: (model, context) => {
				if (!context.source) return;
				const { thinkingLevelMap } = getBasetenReasoningControls(model.id, context.source);
				if (thinkingLevelMap) model.thinkingLevelMap = { ...thinkingLevelMap };
			},
		}),
		rule({
			why: "Baseten's GLM-5.2 endpoints are text-only despite models.dev reporting image input.",
			match: { id: Array.from(BASETEN_GLM52_MODEL_IDS) },
			set: { input: ["text"] },
		}),
	],
});
