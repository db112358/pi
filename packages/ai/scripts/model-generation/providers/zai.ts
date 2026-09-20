import { getEffortThinkingLevelMap } from "../../models-dev-reasoning-options.ts";
import { type DefinedRule, defineProvider, rule } from "../dsl.ts";
import { getModelsDevCost, modelsDev } from "../models-dev.ts";

const ZAI_TOOL_STREAM_UNSUPPORTED_MODEL_IDS = ["glm-4.5", "glm-4.5-air", "glm-4.5-flash", "glm-4.5v"];

const zaiRules: DefinedRule[] = [
	rule({
		why: "z.ai streams tool call deltas with top-level tool_stream on every model after GLM 4.5.",
		match: { not: { id: ZAI_TOOL_STREAM_UNSUPPORTED_MODEL_IDS } },
		set: { compat: { zaiToolStream: true } },
	}),
	rule({
		why: "Cataloged effort levels enable reasoning_effort; GLM 5.2 additionally accepts `none` to disable thinking.",
		match: { when: (_model, context) => getEffortThinkingLevelMap(context.reasoningOptions ?? []) !== undefined },
		apply: (model, context) => {
			const map = getEffortThinkingLevelMap(context.reasoningOptions ?? []);
			if (!map) return;
			if (model.id === "glm-5.2" || model.id === "glm-5.2-highspeed") map.off = "none";
			model.thinkingLevelMap = map;
			model.compat = { ...model.compat, supportsReasoningEffort: true };
		},
	}),
	rule({
		why: "Coding plans are subscription-priced; report the pay-as-you-go z.ai rates so usage has an estimated value.",
		match: { when: (model, context) => context.modelsDev.zai?.models?.[model.id]?.cost !== undefined },
		apply: (model, context) => {
			model.cost = getModelsDevCost(context.modelsDev.zai?.models?.[model.id]?.cost);
		},
	}),
];

export const zai = defineProvider({
	id: "zai",
	source: modelsDev({
		provider: "zai",
		key: "zai-coding-plan",
		api: "openai-completions",
		baseUrl: "https://api.z.ai/api/coding/paas/v4",
		compat: { supportsDeveloperRole: false, thinkingFormat: "zai" },
	}),
	rules: zaiRules,
});

export const zaiCodingCn = defineProvider({
	id: "zai-coding-cn",
	source: modelsDev({
		provider: "zai-coding-cn",
		key: "zhipuai-coding-plan",
		api: "openai-completions",
		baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
		compat: { supportsDeveloperRole: false, thinkingFormat: "zai" },
	}),
	rules: zaiRules,
});
