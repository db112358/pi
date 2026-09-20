import { defineProvider, rule } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";

// Providers whose models.dev catalog maps onto one API with no per-model corrections.

export const groq = defineProvider({
	id: "groq",
	source: modelsDev({
		provider: "groq",
		key: "groq",
		api: "openai-completions",
		baseUrl: "https://api.groq.com/openai/v1",
	}),
});

export const cerebras = defineProvider({
	id: "cerebras",
	source: modelsDev({
		provider: "cerebras",
		key: "cerebras",
		api: "openai-completions",
		baseUrl: "https://api.cerebras.ai/v1",
	}),
});

export const huggingface = defineProvider({
	id: "huggingface",
	source: modelsDev({
		provider: "huggingface",
		key: "huggingface",
		api: "openai-completions",
		baseUrl: "https://router.huggingface.co/v1",
		compat: { supportsDeveloperRole: false },
	}),
});

export const meta = defineProvider({
	id: "meta",
	source: modelsDev({ provider: "meta", key: "meta", api: "openai-responses", baseUrl: "https://api.meta.ai/v1" }),
});

export const xai = defineProvider({
	id: "xai",
	source: modelsDev({
		provider: "xai",
		key: "xai",
		api: "openai-responses",
		baseUrl: "https://api.x.ai/v1",
		compat: { supportsLongCacheRetention: false },
	}),
	rules: [
		rule({
			why: "Retired or non-tool xAI ids that models.dev still lists.",
			match: {
				id: [
					"grok-3",
					"grok-3-fast",
					"grok-4.20-0309-non-reasoning",
					"grok-4.20-0309-reasoning",
					"grok-build-0.1",
					"grok-code-fast-1",
				],
			},
			drop: true,
			mayMatchNothing: true,
		}),
	],
});
