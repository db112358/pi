import { defineProvider, rule } from "../dsl.ts";

// Azure Foundry deploys these with larger context windows than OpenAI's own short-tier defaults.
// See models-sold-directly-by-azure docs.
const AZURE_CONTEXT_WINDOW_OVERRIDES: Record<string, number> = {
	"gpt-5.4": 1050000,
	"gpt-5.5": 1050000,
	"gpt-5.6-luna": 1050000,
	"gpt-5.6-sol": 1050000,
	"gpt-5.6-terra": 1050000,
};

export const azureOpenaiResponses = defineProvider({
	id: "azure-openai-responses",
	// Mirrors the OpenAI Responses catalog after OpenAI's own corrections. The base URL is
	// per deployment and long-context price tiers do not apply to Azure billing.
	source: async (context) =>
		context
			.generated("openai")
			.filter((model) => model.api === "openai-responses")
			.map((model) => ({
				...model,
				api: "azure-openai-responses",
				provider: "azure-openai-responses",
				baseUrl: "",
				cost: {
					input: model.cost.input,
					output: model.cost.output,
					cacheRead: model.cost.cacheRead,
					cacheWrite: model.cost.cacheWrite,
				},
			})),
	rules: [
		rule({
			why: "Azure Foundry deploys these models with larger context windows than OpenAI's short-tier defaults.",
			match: { id: Object.keys(AZURE_CONTEXT_WINDOW_OVERRIDES) },
			apply: (model) => {
				model.contextWindow = AZURE_CONTEXT_WINDOW_OVERRIDES[model.id];
			},
		}),
	],
});
