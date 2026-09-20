import type { OpenAICompletionsCompat } from "../../../src/types.ts";
import { type DefinedRule, defineProvider, rule } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";
import { KIMI_K3_COST } from "../shared.ts";

const MOONSHOT_COMPAT: OpenAICompletionsCompat = {
	supportsStore: false,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	maxTokensField: "max_tokens",
	supportsStrictMode: false,
	thinkingFormat: "deepseek",
};

const kimiK3Rules: DefinedRule[] = [
	rule({
		why: "Kimi K3 always reasons, takes OpenAI reasoning_effort, and needs reasoning_content replayed on assistant messages.",
		match: { id: "kimi-k3" },
		set: {
			reasoning: true,
			compat: {
				requiresReasoningContentOnAssistantMessages: true,
				thinkingFormat: "openai",
				supportsReasoningEffort: true,
			},
		},
	}),
	rule({
		why: "models.dev has no Kimi K3 prices yet; fill in the published Moonshot rates per missing field.",
		match: { id: "kimi-k3" },
		apply: (model) => {
			model.cost = {
				input: model.cost.input || KIMI_K3_COST.input,
				output: model.cost.output || KIMI_K3_COST.output,
				cacheRead: model.cost.cacheRead || KIMI_K3_COST.cacheRead,
				cacheWrite: model.cost.cacheWrite || KIMI_K3_COST.cacheWrite,
			};
		},
	}),
];

export const moonshotai = defineProvider({
	id: "moonshotai",
	source: modelsDev({
		provider: "moonshotai",
		key: "moonshotai",
		api: "openai-completions",
		baseUrl: "https://api.moonshot.ai/v1",
		compat: MOONSHOT_COMPAT,
	}),
	rules: kimiK3Rules,
});

export const moonshotaiCn = defineProvider({
	id: "moonshotai-cn",
	source: modelsDev({
		provider: "moonshotai-cn",
		key: "moonshotai-cn",
		api: "openai-completions",
		baseUrl: "https://api.moonshot.cn/v1",
		compat: MOONSHOT_COMPAT,
	}),
	rules: kimiK3Rules,
});
