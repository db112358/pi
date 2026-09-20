import type { Model, OpenAICompletionsCompat } from "../../../src/types.ts";
import { defineProvider } from "../dsl.ts";
import {
	DEEPSEEK_COMPAT,
	DEEPSEEK_V4_FLASH_THINKING_LEVEL_MAP,
	OPENAI_GPT_6_ASTRA_COST,
	OPENAI_GPT_56_SOL_COST,
	OPENAI_GPT_56_STANDARD_COSTS,
	withOpenAiLongContextPricing,
} from "../shared.ts";

// Providers without an upstream catalog. Their models are maintained by hand.

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export const deepseek = defineProvider({
	id: "deepseek",
	models: [
		{
			id: "deepseek-flash",
			name: "DeepSeek V4.1 Flash",
			api: "openai-completions",
			baseUrl: DEEPSEEK_BASE_URL,
			provider: "deepseek",
			reasoning: true,
			thinkingLevelMap: DEEPSEEK_V4_FLASH_THINKING_LEVEL_MAP,
			input: ["text", "image"],
			// DeepSeek also offers time-based off-peak rates, which the cost schema cannot represent yet.
			cost: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 },
			contextWindow: 1000000,
			maxTokens: 384000,
			compat: DEEPSEEK_COMPAT,
		},
		{
			id: "deepseek-v4-pro",
			name: "DeepSeek V4 Pro",
			api: "openai-completions",
			baseUrl: DEEPSEEK_BASE_URL,
			provider: "deepseek",
			reasoning: true,
			input: ["text"],
			// DeepSeek also offers time-based off-peak rates, which the cost schema cannot represent yet.
			cost: { input: 1.32, output: 3.96, cacheRead: 0.044, cacheWrite: 0 },
			contextWindow: 1000000,
			maxTokens: 384000,
			compat: DEEPSEEK_COMPAT,
		},
	],
});

const ANT_LING_BASE_URL = "https://api.ant-ling.com/v1";
const ANT_LING_COMPAT: OpenAICompletionsCompat = {
	supportsStore: false,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	maxTokensField: "max_tokens",
	supportsLongCacheRetention: false,
};

function antLingModel(
	id: string,
	name: string,
	model: Pick<Model<"openai-completions">, "reasoning" | "cost" | "compat">,
): Model<"openai-completions"> {
	return {
		id,
		name,
		api: "openai-completions",
		baseUrl: ANT_LING_BASE_URL,
		provider: "ant-ling",
		input: ["text"],
		contextWindow: 262144,
		maxTokens: 65536,
		...model,
	};
}

export const antLing = defineProvider({
	id: "ant-ling",
	models: [
		antLingModel("Ling-2.6-flash", "Ling 2.6 Flash", {
			reasoning: false,
			cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0 },
			compat: ANT_LING_COMPAT,
		}),
		antLingModel("Ling-2.6-1T", "Ling 2.6 1T", {
			reasoning: false,
			cost: { input: 0.06, output: 0.25, cacheRead: 0, cacheWrite: 0 },
			compat: ANT_LING_COMPAT,
		}),
		antLingModel("Ring-2.6-1T", "Ring 2.6 1T", {
			reasoning: true,
			cost: { input: 0.06, output: 0.25, cacheRead: 0, cacheWrite: 0 },
			compat: { ...ANT_LING_COMPAT, thinkingFormat: "ant-ling" },
		}),
	],
});

// OpenAI Codex (ChatGPT OAuth) models are not fetched from models.dev; keep a small,
// explicit list to avoid aliases. Older model limits are based on observed server
// behavior; GPT-5.6 and GPT-6 Astra use Codex's 272k default catalog limit.
const CODEX_BASE_URL = "https://chatgpt.com/backend-api";
const CODEX_CONTEXT = 272000;
const CODEX_SPARK_CONTEXT = 128000;
const CODEX_MAX_TOKENS = 128000;

function codexModel(
	id: string,
	name: string,
	model: Pick<Model<"openai-codex-responses">, "input" | "cost"> & { contextWindow?: number },
): Model<"openai-codex-responses"> {
	return {
		id,
		name,
		api: "openai-codex-responses",
		provider: "openai-codex",
		baseUrl: CODEX_BASE_URL,
		reasoning: true,
		contextWindow: CODEX_CONTEXT,
		maxTokens: CODEX_MAX_TOKENS,
		...model,
	};
}

export const openaiCodex = defineProvider({
	id: "openai-codex",
	models: [
		codexModel("gpt-6-astra", "GPT-6 Astra", {
			input: ["text", "image"],
			cost: withOpenAiLongContextPricing(OPENAI_GPT_6_ASTRA_COST),
		}),
		codexModel("gpt-5.3-codex-spark", "GPT-5.3 Codex Spark", {
			input: ["text"],
			cost: { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
			contextWindow: CODEX_SPARK_CONTEXT,
		}),
		codexModel("gpt-5.5", "GPT-5.5", {
			input: ["text", "image"],
			cost: withOpenAiLongContextPricing({ input: 5, output: 30, cacheRead: 0.5, cacheWrite: 0 }),
		}),
		codexModel("gpt-5.6-luna", "GPT-5.6 Luna", {
			input: ["text", "image"],
			cost: withOpenAiLongContextPricing(OPENAI_GPT_56_STANDARD_COSTS["gpt-5.6-luna"]),
		}),
		codexModel("gpt-5.6-sol", "GPT-5.6 Sol", {
			input: ["text", "image"],
			cost: withOpenAiLongContextPricing(OPENAI_GPT_56_SOL_COST),
		}),
		codexModel("gpt-5.6-terra", "GPT-5.6 Terra", {
			input: ["text", "image"],
			cost: withOpenAiLongContextPricing(OPENAI_GPT_56_STANDARD_COSTS["gpt-5.6-terra"]),
		}),
	],
});
