import type { Api } from "../../../src/types.ts";
import { defineProvider, rule } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";

const COPILOT_STATIC_HEADERS = {
	"User-Agent": "GitHubCopilotChat/0.35.0",
	"Editor-Version": "vscode/1.107.0",
	"Editor-Plugin-Version": "copilot-chat/0.35.0",
	"Copilot-Integration-Id": "vscode-chat",
} as const;

// GitHub's "Models with extended capabilities" table lists these Copilot models as supporting
// the extended 1 million token context window.
const GITHUB_COPILOT_EXTENDED_CONTEXT_MODEL_IDS = [
	"claude-fable-5",
	"claude-opus-4.6",
	"claude-opus-4.7",
	"claude-opus-4.8",
	"claude-opus-5",
	"claude-sonnet-4.6",
	"claude-sonnet-5",
	"gpt-5.3-codex",
	"gpt-5.4",
	"gpt-5.5",
];

function copilotApi(modelId: string): Api {
	// Claude 4.x and 5.x models route to Anthropic Messages API
	if (/^claude-(haiku|sonnet|opus|fable)-[45]([.-]|$)/.test(modelId)) return "anthropic-messages";
	// GPT, Grok, OSWE, and MAI-Code models are only served through the Copilot /responses endpoint.
	if (
		modelId.startsWith("gpt-") ||
		modelId.startsWith("grok-") ||
		modelId.startsWith("oswe") ||
		modelId.startsWith("mai-")
	) {
		return "openai-responses";
	}
	return "openai-completions";
}

export const githubCopilot = defineProvider({
	id: "github-copilot",
	source: modelsDev({
		provider: "github-copilot",
		key: "github-copilot",
		api: "openai-completions",
		baseUrl: "https://api.individual.githubcopilot.com",
		headers: COPILOT_STATIC_HEADERS,
		skipDeprecated: true,
		defaults: { contextWindow: 128000, maxTokens: 8192 },
		costTiers: true,
		route: (id) => {
			const api = copilotApi(id);
			return api === "openai-completions"
				? { api, compat: { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false } }
				: { api };
		},
	}),
	rules: [
		rule({
			why: "GitHub's extended-capabilities table lists these Copilot models with the 1M token context window.",
			match: { id: GITHUB_COPILOT_EXTENDED_CONTEXT_MODEL_IDS },
			set: { contextWindow: 1000000 },
		}),
	],
});
