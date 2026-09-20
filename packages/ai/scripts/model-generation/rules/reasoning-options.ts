import { getEffortThinkingLevelMap } from "../../models-dev-reasoning-options.ts";
import { compatOf, definePack, type GeneratedModel, mergeThinkingLevelMap, rule } from "../dsl.ts";
import { resolveOpenAICompletionsCompat } from "./openai-completions-compat.ts";

/** Whether pi sends effort values straight through for this model, so cataloged efforts apply verbatim. */
export function supportsDirectReasoningEffort(model: GeneratedModel): boolean {
	if (model.api === "anthropic-messages") return compatOf(model).forceAdaptiveThinking === true;
	if (
		model.api === "openai-responses" ||
		model.api === "azure-openai-responses" ||
		model.api === "openai-codex-responses"
	) {
		return true;
	}
	if (model.api !== "openai-completions") return false;
	const compat = resolveOpenAICompletionsCompat(model);
	return compat.thinkingFormat === "openai" && compat.supportsReasoningEffort === true;
}

export const reasoningOptionsPack = definePack("models-dev-reasoning-options", [
	rule({
		why: "Expose the effort levels models.dev verified for models whose transport passes effort through unchanged.",
		match: {
			when: (model, context) => context.reasoningOptions !== undefined && supportsDirectReasoningEffort(model),
		},
		apply: (model, context) => {
			const map = getEffortThinkingLevelMap(context.reasoningOptions ?? []);
			if (map) mergeThinkingLevelMap(model, map);
		},
	}),
]);
