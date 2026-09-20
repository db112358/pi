import { defineProvider, type GeneratedModel, roundCost } from "../dsl.ts";

const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh";

function perMillion(value: string | number | undefined): number {
	const parsed = typeof value === "number" ? value : parseFloat(value ?? "0");
	return roundCost((Number.isFinite(parsed) ? parsed : 0) * 1_000_000);
}

export const vercelAiGateway = defineProvider({
	id: "vercel-ai-gateway",
	source: async (context) => {
		const models: GeneratedModel[] = [];
		for (const model of await context.upstream.vercelAiGateway()) {
			const tags = Array.isArray(model.tags) ? model.tags : [];
			// Only include models that support tools
			if (!tags.includes("tool-use")) continue;
			models.push({
				id: model.id,
				name: model.name || model.id,
				api: "anthropic-messages",
				baseUrl: AI_GATEWAY_BASE_URL,
				provider: "vercel-ai-gateway",
				reasoning: tags.includes("reasoning"),
				input: tags.includes("vision") ? ["text", "image"] : ["text"],
				compat: { allowEmptySignature: true },
				cost: {
					input: perMillion(model.pricing?.input),
					output: perMillion(model.pricing?.output),
					cacheRead: perMillion(model.pricing?.input_cache_read),
					cacheWrite: perMillion(model.pricing?.input_cache_write),
				},
				contextWindow: model.context_window || 4096,
				maxTokens: model.max_tokens || 4096,
			});
		}
		console.log(`Fetched ${models.length} tool-capable models from Vercel AI Gateway`);
		return models;
	},
});
