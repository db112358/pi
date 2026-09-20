import type { OpenAICompletionsCompat } from "../../../src/types.ts";
import { defineProvider } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

const NVIDIA_OPENAI_COMPAT: OpenAICompletionsCompat = {
	supportsStore: false,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	maxTokensField: "max_tokens",
	supportsStrictMode: false,
	supportsLongCacheRetention: false,
};

// Listed by NIM but rejecting tool calls or the chat completions request shape.
const NVIDIA_NIM_UNSUPPORTED_MODEL_IDS = new Set([
	"abacusai/dracarys-llama-3.1-70b-instruct",
	"bytedance/seed-oss-36b-instruct",
	"deepseek-ai/deepseek-v4-flash",
	"deepseek-ai/deepseek-v4-pro",
	"google/gemma-2-2b-it",
	"google/gemma-3n-e2b-it",
	"google/gemma-3n-e4b-it",
	"google/gemma-4-31b-it",
	"meta/llama-3.2-1b-instruct",
	"meta/llama-4-maverick-17b-128e-instruct",
	"microsoft/phi-4-mini-instruct",
	"minimaxai/minimax-m2.7",
	"mistralai/mistral-nemotron",
	"nvidia/nemotron-mini-4b-instruct",
	"qwen/qwen3-next-80b-a3b-instruct",
	"qwen/qwen3.5-397b-a17b",
	"sarvamai/sarvam-m",
	"upstage/solar-10.7b-instruct",
]);

function normalizeNvidiaModelId(modelId: string): string {
	return modelId.toLowerCase().replaceAll("_", ".");
}

export const nvidia = defineProvider({
	id: "nvidia",
	// models.dev ids do not always match the ids NIM serves; only emit models NIM lists,
	// under the live id.
	source: async (context) => {
		const catalog = await context.upstream.modelsDev();
		if (!catalog.nvidia?.models) return [];
		const liveModelIds = new Map<string, string>();
		for (const model of await context.upstream.nvidiaNim()) {
			liveModelIds.set(model.id, model.id);
			liveModelIds.set(normalizeNvidiaModelId(model.id), model.id);
		}
		return modelsDev({
			provider: "nvidia",
			key: "nvidia",
			api: "openai-completions",
			baseUrl: NVIDIA_BASE_URL,
			headers: { "NVCF-POLL-SECONDS": "3600" },
			compat: NVIDIA_OPENAI_COMPAT,
			include: (_id, entry) =>
				entry.modalities?.input?.includes("text") === true && entry.modalities?.output?.includes("text") === true,
			mapId: (id) => {
				const liveModelId = liveModelIds.get(id) ?? liveModelIds.get(normalizeNvidiaModelId(id));
				return liveModelId && !NVIDIA_NIM_UNSUPPORTED_MODEL_IDS.has(liveModelId) ? liveModelId : undefined;
			},
		})(context);
	},
});
