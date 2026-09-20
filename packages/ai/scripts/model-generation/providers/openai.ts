import type { Model } from "../../../src/types.ts";
import { defineProvider, rule } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";
import {
	OPENAI_BASE_URL,
	OPENAI_GPT_6_ASTRA_COST,
	OPENAI_GPT_56_SOL_COST,
	OPENAI_GPT_56_STANDARD_COSTS,
	OPENAI_LONG_CONTEXT_INPUT_THRESHOLD,
	OPENAI_LONG_CONTEXT_PRICING_MODEL_IDS,
	withOpenAiLongContextPricing,
} from "../shared.ts";

// models.dev lists this alias, but it is not accepted by OpenAI APIs.
const MODELS_DEV_OPENAI_UNSUPPORTED_MODEL_IDS = new Set(["gpt-5.6"]);

// Keep direct OpenAI requests in the short-context pricing tier by default. Users can opt into the
// larger context through model overrides, so retain long-context cost metadata on the capped models.
const OPENAI_SHORT_CONTEXT_CAPPED_MODEL_IDS = [
	"gpt-5.4",
	"gpt-5.5",
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.6-luna",
	"gpt-6-astra",
];

function openAiResponsesModel(
	id: string,
	name: string,
	model: Pick<Model<"openai-responses">, "reasoning" | "input" | "cost" | "contextWindow" | "maxTokens">,
): Model<"openai-responses"> {
	return { id, name, api: "openai-responses", provider: "openai", baseUrl: OPENAI_BASE_URL, ...model };
}

const shortContextFrontier: Pick<Model<"openai-responses">, "reasoning" | "input" | "contextWindow" | "maxTokens"> = {
	reasoning: true,
	input: ["text", "image"],
	contextWindow: OPENAI_LONG_CONTEXT_INPUT_THRESHOLD,
	maxTokens: 128000,
};

export const openai = defineProvider({
	id: "openai",
	source: modelsDev({
		provider: "openai",
		key: "openai",
		api: "openai-responses",
		baseUrl: OPENAI_BASE_URL,
		include: (id) => !MODELS_DEV_OPENAI_UNSUPPORTED_MODEL_IDS.has(id),
	}),
	// Models missing from models.dev.
	models: [
		openAiResponsesModel("gpt-6-astra", "GPT-6 Astra", {
			...shortContextFrontier,
			cost: withOpenAiLongContextPricing(OPENAI_GPT_6_ASTRA_COST),
		}),
		openAiResponsesModel("gpt-5.6-sol", "GPT-5.6 Sol", {
			...shortContextFrontier,
			cost: withOpenAiLongContextPricing(OPENAI_GPT_56_SOL_COST),
		}),
		openAiResponsesModel("gpt-5.6-terra", "GPT-5.6 Terra", {
			...shortContextFrontier,
			cost: withOpenAiLongContextPricing(OPENAI_GPT_56_STANDARD_COSTS["gpt-5.6-terra"]),
		}),
		openAiResponsesModel("gpt-5.6-luna", "GPT-5.6 Luna", {
			...shortContextFrontier,
			cost: withOpenAiLongContextPricing(OPENAI_GPT_56_STANDARD_COSTS["gpt-5.6-luna"]),
		}),
		openAiResponsesModel("gpt-5-chat-latest", "GPT-5 Chat Latest", {
			reasoning: false,
			input: ["text", "image"],
			cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
			contextWindow: 128000,
			maxTokens: 16384,
		}),
	],
	rules: [
		rule({
			why: "Keep direct OpenAI requests in the short-context pricing tier by default; users opt into the larger context via model overrides.",
			match: { id: OPENAI_SHORT_CONTEXT_CAPPED_MODEL_IDS },
			set: { contextWindow: OPENAI_LONG_CONTEXT_INPUT_THRESHOLD, maxTokens: 128000 },
		}),
		rule({
			why: "Long-context requests are billed at higher rates; models.dev only carries the short-context price. GPT-5.6 Terra/Luna use the 2026-07-30 price cut.",
			match: { id: OPENAI_LONG_CONTEXT_PRICING_MODEL_IDS },
			apply: (model) => {
				model.cost = withOpenAiLongContextPricing(OPENAI_GPT_56_STANDARD_COSTS[model.id] ?? model.cost);
			},
		}),
		rule({
			why: "models.dev reports gpt-5-pro output as 272000 (a duplicate of the input sub-limit); the actual max output is 128000.",
			match: { id: "gpt-5-pro" },
			set: { maxTokens: 128000 },
		}),
	],
});
