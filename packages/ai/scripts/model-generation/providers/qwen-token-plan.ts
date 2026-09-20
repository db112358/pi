import type { OpenAICompletionsCompat, ThinkingLevelMap } from "../../../src/types.ts";
import { assertExactModelIds } from "../../model-data.ts";
import { getEffortThinkingLevelMap } from "../../models-dev-reasoning-options.ts";
import { type DefinedRule, defineProvider, type ProviderDefinition, rule } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";
import type { ModelsDevModel } from "../sources.ts";

// Alibaba Cloud Model Studio Token Plan. International and China use separate endpoints
// and API keys (sk-sp- prefix). The Individual provider reuses the international source
// and endpoint with a narrower catalog. models.dev keys are "alibaba-token-plan[-cn]";
// pi exposes them as "qwen-token-plan[-cn]" plus the Individual catalog view.

const QWEN_TOKEN_PLAN_COMPAT: OpenAICompletionsCompat = {
	thinkingFormat: "qwen",
	supportsDeveloperRole: false,
	supportsStore: false,
	supportsReasoningEffort: true,
};
const QWEN_TOKEN_PLAN_FALLBACK_THINKING_LEVEL_MAP: ThinkingLevelMap = {
	minimal: null,
	low: null,
	medium: null,
	high: "high",
	xhigh: null,
	max: "max",
};
// GLM 5.x accept reasoning_effort even when models.dev omits the options.
const QWEN_TOKEN_PLAN_REASONING_EFFORT_FALLBACK_MODEL_IDS = new Set(["glm-5", "glm-5.1"]);
// Retired preview id — models.dev may still list it after GA ships.
const QWEN_TOKEN_PLAN_EXCLUDED_MODEL_IDS = new Set(["qwen3.8-max-preview"]);
// QwenCloud Token Plan Individual text-model allowlist, verified 2026-09-03.
// Retired models remain excluded above even if the public catalog lags.
// https://docs.qwencloud.com/token-plan/personal/token-plan-personal-overview
const QWEN_TOKEN_PLAN_INDIVIDUAL_MODEL_IDS = new Set<string>([
	"deepseek-v4-flash-0731",
	"deepseek-v4-pro",
	"deepseek-v4-pro-0813",
	"glm-5.2",
	"qwen3.6-flash",
	"qwen3.7-max",
	"qwen3.7-plus",
	"qwen3.8-flash",
	"qwen3.8-max",
]);

function getQwenThinkingLevelMap(id: string, entry: ModelsDevModel): ThinkingLevelMap | undefined {
	return (
		getEffortThinkingLevelMap(entry.reasoning_options ?? []) ??
		(QWEN_TOKEN_PLAN_REASONING_EFFORT_FALLBACK_MODEL_IDS.has(id)
			? QWEN_TOKEN_PLAN_FALLBACK_THINKING_LEVEL_MAP
			: undefined)
	);
}

const thinkingLevels: DefinedRule = rule({
	why: "Cataloged effort levels (or the GLM 5 fallback) enable reasoning_effort; other models cannot take it.",
	match: {},
	apply: (model, context) => {
		if (!context.source) return;
		const map = getQwenThinkingLevelMap(model.id, context.source);
		if (map) {
			model.thinkingLevelMap = { ...map };
		} else {
			model.compat = { ...model.compat, supportsReasoningEffort: false };
		}
	},
});

function qwenTokenPlanProvider(options: {
	id: string;
	key: string;
	baseUrl: string;
	modelIds?: ReadonlySet<string>;
}): ProviderDefinition {
	const source = modelsDev({
		provider: options.id,
		key: options.key,
		api: "openai-completions",
		baseUrl: options.baseUrl,
		compat: QWEN_TOKEN_PLAN_COMPAT,
		include: (id) => !QWEN_TOKEN_PLAN_EXCLUDED_MODEL_IDS.has(id) && (options.modelIds?.has(id) ?? true),
	});
	return defineProvider({
		id: options.id,
		source: async (context) => {
			const models = await source(context);
			// The allowlist is verified by hand; a missing model means the plan changed and needs review.
			if (options.modelIds && context.strict) {
				assertExactModelIds(
					options.id,
					options.modelIds,
					models.map((model) => model.id),
				);
			}
			return models;
		},
		rules: [thinkingLevels],
	});
}

const INTERNATIONAL_BASE_URL = "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";

export const qwenTokenPlan = qwenTokenPlanProvider({
	id: "qwen-token-plan",
	key: "alibaba-token-plan",
	baseUrl: INTERNATIONAL_BASE_URL,
});
export const qwenTokenPlanIndividual = qwenTokenPlanProvider({
	id: "qwen-token-plan-individual",
	key: "alibaba-token-plan",
	baseUrl: INTERNATIONAL_BASE_URL,
	modelIds: QWEN_TOKEN_PLAN_INDIVIDUAL_MODEL_IDS,
});
export const qwenTokenPlanCn = qwenTokenPlanProvider({
	id: "qwen-token-plan-cn",
	key: "alibaba-token-plan-cn",
	baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
});
