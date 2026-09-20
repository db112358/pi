import { definePack, rule } from "../dsl.ts";

export const promptCachePack = definePack("prompt-cache", [
	rule({
		why: "OpenAI charges prompt-cache writes starting with the GPT-5.6 family, and exactly those models accept prompt_cache_options; older models reject the parameter. https://developers.openai.com/api/docs/guides/prompt-caching",
		match: { api: "openai-responses", provider: "openai", when: (model) => model.cost.cacheWrite > 0 },
		set: { compat: { supportsExplicitPromptCacheMode: true } },
	}),
	// Do not add OpenAI lifetimes yet. Before enabling warming for explicit OpenAI caches,
	// re-evaluate it using observed expiry, replay, and billing behavior; a documented TTL
	// alone does not establish full cache loss.
	rule({
		why: "Anthropic ephemeral entries have a hard five-minute lifetime; ttl 1h extends it to one hour. Only direct Anthropic is annotated so cache warming does not assume equivalent behavior through proxies. https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching",
		match: { api: "anthropic-messages", provider: "anthropic" },
		set: { promptCache: { short: 300, long: 3600 } },
	}),
]);
