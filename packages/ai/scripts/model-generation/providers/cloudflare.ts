import {
	CLOUDFLARE_AI_GATEWAY_ANTHROPIC_BASE_URL,
	CLOUDFLARE_AI_GATEWAY_COMPAT_BASE_URL,
	CLOUDFLARE_AI_GATEWAY_OPENAI_BASE_URL,
	CLOUDFLARE_WORKERS_AI_BASE_URL,
} from "../../../src/api/cloudflare.ts";
import { defineProvider, rule } from "../dsl.ts";
import { type ModelsDevRoute, modelsDev } from "../models-dev.ts";
import { OPENAI_GPT_56_STANDARD_COSTS, withOpenAiLongContextPricing } from "../shared.ts";

export const cloudflareWorkersAi = defineProvider({
	id: "cloudflare-workers-ai",
	source: modelsDev({
		provider: "cloudflare-workers-ai",
		key: "cloudflare-workers-ai",
		api: "openai-completions",
		baseUrl: CLOUDFLARE_WORKERS_AI_BASE_URL,
		compat: { sendSessionAffinityHeaders: true },
	}),
});

// Gateway ids are `<upstream>/<native id>`. OpenAI and Anthropic passthroughs use the
// native id; Workers AI keeps the prefix because it is served through the /compat endpoint.
const GATEWAY_ROUTES: Record<string, (nativeId: string) => ModelsDevRoute & { id: string }> = {
	openai: (nativeId) => ({ id: nativeId, api: "openai-responses", baseUrl: CLOUDFLARE_AI_GATEWAY_OPENAI_BASE_URL }),
	anthropic: (nativeId) => ({
		id: nativeId,
		api: "anthropic-messages",
		baseUrl: CLOUDFLARE_AI_GATEWAY_ANTHROPIC_BASE_URL,
		// Gateway passthroughs forward session affinity headers to upstreams that use them.
		compat: { sendSessionAffinityHeaders: true },
	}),
	"workers-ai": (nativeId) => ({
		id: `workers-ai/${nativeId}`,
		api: "openai-completions",
		baseUrl: CLOUDFLARE_AI_GATEWAY_COMPAT_BASE_URL,
		compat: { sendSessionAffinityHeaders: true },
	}),
};

function splitGatewayId(prefixedId: string): { upstream: string; nativeId: string } | undefined {
	const slashIndex = prefixedId.indexOf("/");
	if (slashIndex === -1) return undefined;
	return { upstream: prefixedId.slice(0, slashIndex), nativeId: prefixedId.slice(slashIndex + 1) };
}

function resolveGatewayRoute(prefixedId: string): (ModelsDevRoute & { id: string }) | undefined {
	const parts = splitGatewayId(prefixedId);
	return parts ? GATEWAY_ROUTES[parts.upstream]?.(parts.nativeId) : undefined;
}

export const cloudflareAiGateway = defineProvider({
	id: "cloudflare-ai-gateway",
	source: [
		modelsDev({
			provider: "cloudflare-ai-gateway",
			key: "cloudflare-ai-gateway",
			api: "openai-completions",
			baseUrl: CLOUDFLARE_AI_GATEWAY_COMPAT_BASE_URL,
			mapId: (id) => resolveGatewayRoute(id)?.id,
			route: (id) => resolveGatewayRoute(id),
		}),
		// The gateway proxies Workers AI through its OpenAI-compatible /compat endpoint, but
		// models.dev may omit or intermittently drop those `workers-ai/*` entries from the AI
		// Gateway catalog. Mirror the Workers AI catalog under the documented prefix so the
		// gateway keeps its OpenAI-compatible models stable. Ids already produced above win.
		modelsDev({
			provider: "cloudflare-ai-gateway",
			key: "cloudflare-workers-ai",
			api: "openai-completions",
			baseUrl: CLOUDFLARE_AI_GATEWAY_COMPAT_BASE_URL,
			compat: { sendSessionAffinityHeaders: true },
			mapId: (id) => `workers-ai/${id}`,
		}),
	],
	rules: [
		rule({
			why: "Cloudflare AI Gateway passes OpenAI usage through at OpenAI list prices, including the GPT-5.6 price cut and long-context tiers.",
			match: { id: Object.keys(OPENAI_GPT_56_STANDARD_COSTS) },
			apply: (model) => {
				model.cost = withOpenAiLongContextPricing(OPENAI_GPT_56_STANDARD_COSTS[model.id]);
			},
		}),
	],
});
