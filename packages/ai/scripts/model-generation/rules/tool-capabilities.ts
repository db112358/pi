import { definePack, rule } from "../dsl.ts";
import { OPENAI_MID_CONVO_SYSTEM_MESSAGE_MODEL_IDS, OPENAI_TOOL_SEARCH_MODEL_IDS } from "../shared.ts";

// Tool-definition and transcript features that depend on the exact model and relay.

// Responses endpoints verified (OpenAI, ChatGPT Codex backend, GitHub Copilot,
// opencode zen) or documented (Azure OpenAI, Cloudflare AI Gateway) to pass
// OpenAI custom grammar tools through. OpenAI rejects `type: "custom"` tools
// for pre-GPT-5 models (gpt-4.x, gpt-4o, o-series).
const OPENAI_GRAMMAR_TOOL_PROVIDERS = [
	"openai",
	"openai-codex",
	"azure-openai-responses",
	"github-copilot",
	"opencode",
	"cloudflare-ai-gateway",
];
const OPENAI_GRAMMAR_TOOL_APIS = ["openai-responses", "azure-openai-responses", "openai-codex-responses"] as const;
const GPT_5_OR_LATER = /^gpt-(?:[5-9]|[1-9]\d+)/;

const OPENAI_CODEX_ADDITIONAL_TOOLS_MODEL_IDS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-astra"];

// Newer OpenAI Responses models accept developer messages after the conversation has started.
// OpenCode Zen, OpenCode Go, and GitHub Copilot pass both those messages and
// `additional_tools` items through to OpenAI unchanged; tool search is not verified
// through those proxies.
const OPENAI_RESPONSES_PROXY_PROVIDERS = ["opencode", "opencode-go", "github-copilot"];

// Moonshot Kimi K2.6/K2.7 accept system text after the conversation starts but reject
// tool-bearing system messages. Kimi K3 accepts both forms; Fireworks and OpenCode pass
// its tool-bearing form through. GitHub Copilot forwards K3 text but silently drops its
// tool-bearing message. DeepSeek V4 Pro and OpenAI models behind OpenRouter also accept
// plain system text in place.
const KIMI_K3_FULL_MID_CONVO = {
	api: "openai-completions",
	when: (model: { provider: string; id: string }) =>
		(model.provider.startsWith("moonshot") && model.id === "kimi-k3") ||
		(model.provider === "fireworks" && model.id.includes("kimi-k3")) ||
		((model.provider === "opencode" || model.provider === "opencode-go") && model.id === "kimi-k3"),
} as const;

export const toolCapabilitiesPack = definePack("tool-capabilities", [
	rule({
		why: "OpenAI and Cloudflare AI Gateway Responses accept strict JSON-schema function tools.",
		match: { api: "openai-responses", provider: ["openai", "cloudflare-ai-gateway"] },
		set: { compat: { supportsStrictMode: true } },
	}),
	rule({
		why: "Direct Anthropic accepts strict tool schemas.",
		match: { api: "anthropic-messages", provider: "anthropic" },
		set: { compat: { supportsStrictTools: true } },
	}),
	rule({
		why: "Responses endpoints verified or documented to pass OpenAI custom grammar tools through; OpenAI rejects them for pre-GPT-5 models.",
		match: { api: OPENAI_GRAMMAR_TOOL_APIS, provider: OPENAI_GRAMMAR_TOOL_PROVIDERS, idPattern: GPT_5_OR_LATER },
		set: { compat: { supportsOpenAIGrammarTools: true } },
	}),
	rule({
		why: "These OpenAI Responses models support client-executed tool search and message-anchored additional_tools.",
		match: { api: "openai-responses", provider: "openai", id: OPENAI_TOOL_SEARCH_MODEL_IDS },
		set: { compat: { supportsToolSearch: true, supportsAdditionalTools: true } },
	}),
	rule({
		why: "The ChatGPT Codex backend supports tool search on these models; additional_tools only on GPT-5.6+.",
		match: { api: "openai-codex-responses", provider: "openai-codex", id: OPENAI_TOOL_SEARCH_MODEL_IDS },
		apply: (model) => {
			model.compat = {
				...model.compat,
				...(OPENAI_CODEX_ADDITIONAL_TOOLS_MODEL_IDS.includes(model.id) ? { supportsAdditionalTools: true } : {}),
				supportsToolSearch: true,
			};
		},
	}),
	rule({
		why: "Kimi K3 accepts system messages and tool additions mid-conversation on Moonshot, Fireworks, and OpenCode.",
		match: KIMI_K3_FULL_MID_CONVO,
		set: { compat: { supportsMidConvoSystemMessages: true, supportsMidConvoToolAdditions: true } },
	}),
	rule({
		why: "These chat completions models accept plain system text mid-conversation but not tool-bearing system messages.",
		match: {
			api: "openai-completions",
			when: (model) =>
				(model.provider.startsWith("moonshot") &&
					(model.id === "kimi-k2.6" ||
						model.id === "kimi-k2.7-code" ||
						model.id === "kimi-k2.7-code-highspeed")) ||
				(model.provider === "github-copilot" && model.id === "kimi-k3") ||
				(model.provider === "deepseek" && model.id === "deepseek-v4-pro") ||
				(model.provider === "openrouter" &&
					model.id.startsWith("openai/") &&
					(OPENAI_MID_CONVO_SYSTEM_MESSAGE_MODEL_IDS as readonly string[]).includes(
						model.id.slice("openai/".length),
					)),
		},
		set: { compat: { supportsMidConvoSystemMessages: true } },
	}),
	rule({
		why: "Newer OpenAI Responses models accept developer messages after the conversation has started.",
		match: {
			id: OPENAI_MID_CONVO_SYSTEM_MESSAGE_MODEL_IDS,
			when: (model) =>
				(model.provider === "openai" && model.api === "openai-responses") ||
				(model.provider === "openai-codex" && model.api === "openai-codex-responses"),
		},
		set: { compat: { supportsMidConvoSystemMessages: true } },
	}),
	rule({
		why: "OpenCode Zen, OpenCode Go, and GitHub Copilot pass mid-conversation developer messages and additional_tools through to OpenAI unchanged.",
		match: {
			api: "openai-responses",
			provider: OPENAI_RESPONSES_PROXY_PROVIDERS,
			id: OPENAI_MID_CONVO_SYSTEM_MESSAGE_MODEL_IDS,
		},
		set: { compat: { supportsMidConvoSystemMessages: true, supportsAdditionalTools: true } },
	}),
]);
