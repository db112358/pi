import { defineProvider, roundCost, rule } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";

const MISTRAL_BASE_URL = "https://api.mistral.ai";

export const mistral = defineProvider({
	id: "mistral",
	source: modelsDev({
		provider: "mistral",
		key: "mistral",
		api: "mistral-conversations",
		baseUrl: MISTRAL_BASE_URL,
	}),
	models: [
		{
			// Missing from models.dev.
			id: "mistral-medium-3.5",
			name: "Mistral Medium 3.5",
			api: "mistral-conversations",
			provider: "mistral",
			baseUrl: MISTRAL_BASE_URL,
			reasoning: true,
			input: ["text", "image"],
			cost: { input: 1.5, output: 7.5, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 262144,
			maxTokens: 262144,
		},
	],
	rules: [
		rule({
			why: "Mistral bills cached input at 10% of the input price when models.dev omits cache_read.",
			match: {
				when: (_model, context) => context.source !== undefined && context.source.cost?.cache_read === undefined,
			},
			apply: (model, context) => {
				const input = context.source?.cost?.input;
				model.cost = { ...model.cost, cacheRead: input ? roundCost(input * 0.1) : 0 };
			},
		}),
	],
});
