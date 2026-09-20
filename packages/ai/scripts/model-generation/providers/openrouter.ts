import type { Model } from "../../../src/types.ts";
import { getOpenRouterThinkingLevelMap } from "../../openrouter-reasoning-options.ts";
import { defineProvider, type GeneratedModel, roundCost, rule } from "../dsl.ts";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function perMillion(value: string | undefined): number {
	return roundCost(parseFloat(value || "0") * 1_000_000);
}

function openRouterRouterModel(
	id: string,
	name: string,
	model: Pick<Model<"openai-completions">, "input" | "contextWindow" | "maxTokens">,
): GeneratedModel {
	return {
		id,
		name,
		api: "openai-completions",
		provider: "openrouter",
		baseUrl: OPENROUTER_BASE_URL,
		reasoning: true,
		// Routers charge for the underlying model, so no price is known up front.
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		...model,
	};
}

export const openrouter = defineProvider({
	id: "openrouter",
	source: async (context) => {
		const models: GeneratedModel[] = [];
		for (const model of await context.upstream.openRouter()) {
			// Only include models that support tools
			if (!model.supported_parameters?.includes("tools")) continue;
			const thinkingLevelMap = getOpenRouterThinkingLevelMap(model.reasoning);
			const useAnthropicMessages = /^anthropic\//.test(model.id) && !model.id.endsWith(":batch");
			models.push({
				id: model.id,
				name: model.name,
				api: useAnthropicMessages ? "anthropic-messages" : "openai-completions",
				baseUrl: useAnthropicMessages ? "https://openrouter.ai/api" : OPENROUTER_BASE_URL,
				provider: "openrouter",
				reasoning: model.supported_parameters?.includes("reasoning") || false,
				...(thinkingLevelMap && { thinkingLevelMap }),
				input: model.architecture?.modality?.includes("image") ? ["text", "image"] : ["text"],
				cost: {
					input: perMillion(model.pricing?.prompt),
					output: perMillion(model.pricing?.completion),
					cacheRead: perMillion(model.pricing?.input_cache_read),
					cacheWrite: perMillion(model.pricing?.input_cache_write),
				},
				contextWindow: model.top_provider?.context_length || model.context_length || 4096,
				maxTokens: model.top_provider?.max_completion_tokens || 4096,
			});
		}
		console.log(`Fetched ${models.length} tool-capable models from OpenRouter`);
		return models;
	},
	models: [
		openRouterRouterModel("auto", "Auto", { input: ["text", "image"], contextWindow: 2000000, maxTokens: 30000 }),
		// OpenRouter exposes Fusion as a router alias/plugin entry point; its model metadata does
		// not advertise tools, but the alias resolves to a concrete model that can invoke caller
		// tools and has the openrouter:fusion server tool auto-injected.
		openRouterRouterModel("openrouter/fusion", "OpenRouter: Fusion", {
			input: ["text"],
			contextWindow: 1000000,
			maxTokens: 30000,
		}),
	],
	rules: [
		rule({
			why: "Keep Kimi K2.5 metadata stable until OpenRouter's listing settles.",
			match: { id: "moonshotai/kimi-k2.5" },
			set: { cost: { input: 0.41, output: 2.06, cacheRead: 0.07 }, maxTokens: 4096 },
			mayMatchNothing: true,
		}),
		rule({
			why: "OpenRouter Kimi K2.6 rejects the developer role and needs reasoning_content replayed on assistant messages.",
			match: { idPrefix: "moonshotai/kimi-k2.6" },
			set: { compat: { supportsDeveloperRole: false, requiresReasoningContentOnAssistantMessages: true } },
			mayMatchNothing: true,
		}),
		rule({
			why: "Keep GLM-5 prices stable until OpenRouter's listing settles.",
			match: { id: "z-ai/glm-5" },
			set: { cost: { input: 0.6, output: 1.9, cacheRead: 0.119 } },
			mayMatchNothing: true,
		}),
	],
});
