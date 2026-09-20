import { definePack, rule } from "../dsl.ts";
import { supportsAnthropicMidConvoEffort, supportsAnthropicMidConvoSystemMessages } from "../shared.ts";

// Anthropic Messages transport capabilities that depend on the exact model and relay.

export const anthropicCompatPack = definePack("anthropic-compat", [
	rule({
		why: "Verified effort-only system messages and thinking binding on direct Anthropic and OpenRouter for Opus 5 and Fable/Mythos 5.1. OpenRouter rejects configuration_update on Opus 5 while accepting it on Fable 5.1.",
		match: {
			api: "anthropic-messages",
			provider: ["anthropic", "openrouter"],
			when: (model) => supportsAnthropicMidConvoEffort(model.id),
			not: { provider: "openrouter", id: "anthropic/claude-opus-5" },
		},
		set: { compat: { supportsMidConvoEffort: true }, thinkingLevelMap: { off: null } },
	}),
	rule({
		why: "Direct Anthropic accepts system messages and tool_addition/tool_removal blocks mid-conversation on Opus 4.8+ and Fable/Mythos 5.",
		match: {
			api: "anthropic-messages",
			provider: "anthropic",
			when: (model) => supportsAnthropicMidConvoSystemMessages(model.id),
		},
		set: { compat: { supportsMidConvoSystemMessages: true, supportsMidConvoToolChanges: true } },
	}),
	rule({
		why: "OpenCode Zen and GitHub Copilot forward mid-conversation system messages but reject tool_addition/tool_removal blocks, so tool changes stay top-level there.",
		match: {
			api: "anthropic-messages",
			provider: ["opencode", "github-copilot"],
			when: (model) => supportsAnthropicMidConvoSystemMessages(model.id),
		},
		set: { compat: { supportsMidConvoSystemMessages: true } },
	}),
	rule({
		why: "GitHub Copilot rejects per-tool eager_input_streaming on these Claude models.",
		match: {
			api: "anthropic-messages",
			provider: "github-copilot",
			id: ["claude-haiku-4.5", "claude-sonnet-4", "claude-sonnet-4.5"],
		},
		set: { compat: { supportsEagerToolInputStreaming: false } },
		mayMatchNothing: true,
	}),
	rule({
		why: "Xiaomi's Anthropic-compatible endpoints replay thinking without signatures.",
		match: {
			api: "anthropic-messages",
			when: (model) => model.provider === "xiaomi" || model.provider.startsWith("xiaomi-token-plan-"),
		},
		set: { compat: { allowEmptySignature: true } },
		mayMatchNothing: true,
	}),
]);
