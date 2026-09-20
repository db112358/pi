import { compatOf, definePack, mergeCompat, rule } from "../dsl.ts";
import { supportsAnthropicMidConvoEffort } from "../shared.ts";

// Models direct Anthropic may transparently serve in place of the requested one.
const ANTHROPIC_ALLOWED_FALLBACK_MODEL_IDS: Record<string, string[]> = {
	"claude-fable-5": ["claude-opus-4-8", "claude-opus-5"],
	"claude-opus-5": ["claude-opus-4-8"],
};

export const anthropicFallbacksPack = definePack("anthropic-fallbacks", [
	rule({
		why: "Record the fallback models Anthropic may serve, with their prices, so responses from a fallback are priced correctly. Effort-bound models only fall back to models that also support mid-conversation effort.",
		match: {
			api: "anthropic-messages",
			provider: "anthropic",
			id: Object.keys(ANTHROPIC_ALLOWED_FALLBACK_MODEL_IDS),
		},
		apply: (model, context) => {
			const fallbackModelIds = ANTHROPIC_ALLOWED_FALLBACK_MODEL_IDS[model.id];
			const compatibleFallbackModelIds = compatOf(model).supportsMidConvoEffort
				? fallbackModelIds.filter(supportsAnthropicMidConvoEffort)
				: fallbackModelIds;
			const allowedFallbackModels = compatibleFallbackModelIds.flatMap((fallbackModelId) => {
				const fallbackModel = context.lookup("anthropic", fallbackModelId);
				return fallbackModel && fallbackModel.api === "anthropic-messages"
					? [{ provider: fallbackModel.provider, model: fallbackModel.id, cost: fallbackModel.cost }]
					: [];
			});
			if (allowedFallbackModels.length > 0) mergeCompat(model, { allowedFallbackModels });
		},
	}),
]);
