import type { ThinkingLevelMap } from "../../../src/types.ts";
import { getEffortThinkingLevelMap } from "../../models-dev-reasoning-options.ts";
import { compatOf, definePack, mergeThinkingLevelMap, rule } from "../dsl.ts";
import {
	ANTHROPIC_ADAPTIVE_THINKING_ID_PARTS,
	DEEPSEEK_V4_FLASH_THINKING_LEVEL_MAP,
	DEEPSEEK_V4_THINKING_LEVEL_MAP,
	OPENAI_MAX_MODEL_ID_PARTS,
	OPENAI_XHIGH_MODEL_ID_PARTS,
	supportsOpenAiXhigh,
} from "../shared.ts";

// Which pi thinking levels each model accepts and how they spell them. Rules apply in
// order and merge, so later rules refine earlier ones for the same model.

const OPENAI_RESPONSES_APIS = ["openai-responses", "azure-openai-responses", "openai-codex-responses"] as const;

const OPENAI_RESPONSES_NONE_REASONING_MODEL_IDS = [
	"gpt-5.1",
	"gpt-5.2",
	"gpt-5.3-codex",
	"gpt-5.4",
	"gpt-5.4-mini",
	"gpt-5.4-nano",
	"gpt-5.5",
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.6-luna",
];

// Checked manually against the authenticated GitHub Copilot /models endpoint on 2026-06-15.
// Keep this to narrow corrections over models.dev metadata instead of snapshotting Copilot's catalog.
const GITHUB_COPILOT_THINKING_LEVEL_OVERRIDES: Record<string, ThinkingLevelMap> = {
	"claude-opus-4.7": { minimal: "low" },
	"claude-opus-4.8": { minimal: "low" },
	"claude-opus-5": { minimal: "low" },
	"claude-sonnet-4.6": { minimal: "low", max: "max" },
};

const ANTHROPIC_TEMPERATURE_UNSUPPORTED_ID_PARTS = ["opus-4-7", "opus-4.7", "opus-4-8", "opus-4.8", "opus-5", "opus.5"];

export const thinkingLevelsPack = definePack("thinking-levels", [
	rule({
		why: "GPT-5 Responses models reason by default; pi has no way to switch reasoning off.",
		match: { api: ["openai-responses", "azure-openai-responses"], idPrefix: "gpt-5" },
		set: { thinkingLevelMap: { off: null } },
	}),
	rule({
		why: "GPT-6 Astra documents low through max and no minimal.",
		match: { api: OPENAI_RESPONSES_APIS, id: "gpt-6-astra" },
		set: {
			thinkingLevelMap: {
				off: null,
				minimal: null,
				low: "low",
				medium: "medium",
				high: "high",
				xhigh: "xhigh",
				max: "max",
			},
		},
	}),
	rule({
		why: "GitHub Copilot maps minimal GPT-5 effort to low.",
		match: { provider: "github-copilot", idPrefix: "gpt-5" },
		set: { thinkingLevelMap: { minimal: "low" } },
	}),
	rule({
		why: "These OpenAI Responses models accept reasoning effort `none`.",
		match: { provider: "openai", api: "openai-responses", id: OPENAI_RESPONSES_NONE_REASONING_MODEL_IDS },
		set: { thinkingLevelMap: { off: "none" } },
	}),
	rule({
		why: "xAI models without verified effort options must not send the undocumented none/minimal efforts.",
		match: { provider: "xai", api: "openai-responses", when: (model) => model.thinkingLevelMap === undefined },
		set: { thinkingLevelMap: { off: null, minimal: null } },
		mayMatchNothing: true,
	}),
	rule({
		why: "GPT-5.2+ accept reasoning effort xhigh everywhere they are served.",
		match: { idIncludes: OPENAI_XHIGH_MODEL_ID_PARTS },
		set: { thinkingLevelMap: { xhigh: "xhigh" } },
	}),
	rule({
		why: "GPT-5.6 and GPT-6 Astra accept reasoning effort max on OpenAI-style APIs.",
		match: { idIncludes: OPENAI_MAX_MODEL_ID_PARTS, api: [...OPENAI_RESPONSES_APIS, "openai-completions"] },
		set: { thinkingLevelMap: { max: "max" } },
	}),
	rule({
		why: "OpenAI rejects minimal effort on GPT-5.5.",
		match: { provider: "openai", id: "gpt-5.5" },
		set: { thinkingLevelMap: { minimal: null } },
	}),
	rule({
		why: "GPT-5.5 Pro only runs at high effort and above.",
		match: { idPattern: /gpt-5\.5-pro$/ },
		set: { thinkingLevelMap: { off: null, minimal: null, low: null } },
	}),
	// Anthropic adaptive-thinking effort support (per Anthropic adaptive thinking docs):
	// - "max" is available on all adaptive-thinking Claude models.
	// - "xhigh" is only available on Opus 4.7/4.8/5, Sonnet 5, and Fable 5.
	rule({
		why: "Claude Opus/Sonnet 4.6 accept effort max.",
		match: { idIncludes: ["opus-4-6", "opus-4.6", "sonnet-4-6", "sonnet-4.6"] },
		set: { thinkingLevelMap: { max: "max" } },
	}),
	rule({
		why: "Claude Opus 4.7+/5 and Sonnet 5 accept effort xhigh and max.",
		match: {
			idIncludes: ["opus-4-7", "opus-4.7", "opus-4-8", "opus-4.8", "opus-5", "opus.5", "sonnet-5", "sonnet.5"],
		},
		set: { thinkingLevelMap: { xhigh: "xhigh", max: "max" } },
	}),
	rule({
		why: "Claude Fable 5 always thinks and accepts effort xhigh and max.",
		match: { idIncludes: "fable-5" },
		set: { thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" } },
	}),
	rule({
		why: "Claude 4.6+ models require the adaptive thinking request format.",
		match: { api: "anthropic-messages", idIncludes: ANTHROPIC_ADAPTIVE_THINKING_ID_PARTS },
		set: { compat: { forceAdaptiveThinking: true } },
	}),
	rule({
		why: "Claude Opus 4.7+ rejects non-default temperature values.",
		match: {
			api: "anthropic-messages",
			when: (model) =>
				ANTHROPIC_TEMPERATURE_UNSUPPORTED_ID_PARTS.some((part) => model.id.toLowerCase().includes(part)),
		},
		set: { compat: { supportsTemperature: false } },
	}),
	rule({
		why: "DeepSeek V4 documents high/max efforts (Flash also low); OpenRouter adds xhigh and drops max. Only fills in models without cataloged efforts.",
		match: {
			api: "openai-completions",
			idIncludes: "deepseek-v4",
			when: (model) => model.thinkingLevelMap === undefined,
		},
		apply: (model) => {
			mergeThinkingLevelMap(
				model,
				model.provider === "openrouter"
					? { ...DEEPSEEK_V4_THINKING_LEVEL_MAP, xhigh: "xhigh", max: null }
					: (model.provider === "deepseek" || model.provider === "opencode" || model.provider === "opencode-go") &&
							model.id.includes("deepseek-v4-flash")
						? DEEPSEEK_V4_FLASH_THINKING_LEVEL_MAP
						: DEEPSEEK_V4_THINKING_LEVEL_MAP,
			);
		},
	}),
	rule({
		why: "Groq's Qwen 3.6 27B only accepts the `default` reasoning effort.",
		match: { provider: "groq", id: "qwen/qwen3.6-27b" },
		set: { thinkingLevelMap: { minimal: null, low: null, medium: null, high: "default" } },
		mayMatchNothing: true,
	}),
	rule({
		why: "The ChatGPT Codex backend maps minimal effort to low on xhigh-capable models.",
		match: { provider: "openai-codex", when: (model) => supportsOpenAiXhigh(model.id) },
		set: { thinkingLevelMap: { minimal: "low" } },
	}),
	rule({
		why: 'Kimi K2.7 Code is always-thinking. Official docs say `thinking: { type: "disabled" }` is rejected, and callers can omit the thinking parameter to use the enabled default.',
		match: { provider: ["moonshotai", "moonshotai-cn"], id: ["kimi-k2.7-code", "kimi-k2.7-code-highspeed"] },
		set: { thinkingLevelMap: { off: null } },
	}),
	rule({
		why: "Mercury 2 in instant mode (reasoning_effort: \"none\") disables tool calling. Mark off unsupported so the openai-completions provider omits the reasoning param instead of sending effort none. Pi's low/medium/high pass through verbatim; OpenRouter normalizes to Mercury's vocabulary.",
		match: { provider: "openrouter", idPrefix: "inception/mercury-2" },
		set: { thinkingLevelMap: { off: null } },
		mayMatchNothing: true,
	}),
	rule({
		why: "OpenRouter accepts xhigh for GLM-5.2.",
		match: { provider: "openrouter", id: "z-ai/glm-5.2" },
		set: { thinkingLevelMap: { xhigh: "xhigh" } },
		mayMatchNothing: true,
	}),
	rule({
		why: "Fireworks Qwen Max currently advertises only a toggle. Prefer upstream effort metadata once available instead of replacing it with this fallback.",
		match: {
			provider: "fireworks",
			api: "anthropic-messages",
			id: "accounts/fireworks/models/qwen3p8-max",
			when: (model) => compatOf(model).forceAdaptiveThinking === true && !model.thinkingLevelMap,
		},
		apply: (model) => {
			model.thinkingLevelMap = getEffortThinkingLevelMap([{ type: "effort", values: ["low", "medium", "xhigh"] }]);
		},
		mayMatchNothing: true,
	}),
	rule({
		why: "Fireworks Messages models with a cataloged toggle accept effort none; the Qwen 2.4T alias omits its verified toggle in models.dev.",
		match: {
			provider: "fireworks",
			api: "anthropic-messages",
			when: (model, context) =>
				compatOf(model).forceAdaptiveThinking === true &&
				(context.reasoningOptions?.some((option) => option.type === "toggle") === true ||
					model.id === "accounts/fireworks/models/qwen3p8-2p4t-a95b"),
		},
		set: { thinkingLevelMap: { off: "none" } },
	}),
	rule({
		why: "Fireworks DeepSeek V4 Pro accepts effort low despite models.dev omitting it (#9323).",
		match: {
			provider: "fireworks",
			api: "anthropic-messages",
			id: "accounts/fireworks/models/deepseek-v4-pro-0813",
			when: (model) => compatOf(model).forceAdaptiveThinking === true,
		},
		set: { thinkingLevelMap: { low: "low" } },
		mayMatchNothing: true,
	}),
	rule({
		why: "Fireworks GLM 5.2 and its fast router support off/high/max. Fireworks maps low and medium to high, so do not expose those aliases as distinct levels.",
		match: { provider: "fireworks", idIncludes: "glm-5p2" },
		set: { thinkingLevelMap: { off: "none", minimal: null, low: null, medium: null, max: "max" } },
		mayMatchNothing: true,
	}),
	rule({
		why: "Fireworks maps Kimi K3 medium to high on both APIs; do not expose it as a distinct level.",
		match: { provider: "fireworks", idIncludes: "kimi-k3" },
		set: { thinkingLevelMap: { medium: null } },
		mayMatchNothing: true,
	}),
	rule({
		why: "OpenCode Go GLM-5.2 exposes only high and max.",
		match: { provider: "opencode-go", id: "glm-5.2" },
		set: { thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: "high", max: "max" } },
		mayMatchNothing: true,
	}),
	rule({
		why: "OpenCode Go exposes Kimi K2.6 thinking as on/off, not distinct effort tiers.",
		match: { provider: "opencode-go", id: "kimi-k2.6" },
		set: { thinkingLevelMap: { minimal: null, low: null, medium: null } },
		mayMatchNothing: true,
	}),
	rule({
		why: "OpenCode Zen Grok Build reasons by default but rejects explicit reasoningEffort.",
		match: { provider: "opencode", id: "grok-build-0.1" },
		set: { thinkingLevelMap: { off: null, minimal: null, low: null, medium: null } },
		mayMatchNothing: true,
	}),
	rule({
		why: "Ring reasons by default. Only high/xhigh have documented explicit effort controls.",
		match: { provider: "ant-ling", reasoning: true },
		set: { thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: "high", xhigh: "xhigh" } },
	}),
	rule({
		why: "Narrow corrections over models.dev metadata, checked against the authenticated GitHub Copilot /models endpoint on 2026-06-15.",
		match: { provider: "github-copilot", id: Object.keys(GITHUB_COPILOT_THINKING_LEVEL_OVERRIDES) },
		apply: (model) => mergeThinkingLevelMap(model, GITHUB_COPILOT_THINKING_LEVEL_OVERRIDES[model.id]),
	}),
]);
