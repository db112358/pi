import type { ThinkingLevelMap } from "../../../src/types.ts";
import type { ModelsDevReasoningOption } from "../../models-dev-reasoning-options.ts";
import { getEffortThinkingLevelMap } from "../../models-dev-reasoning-options.ts";
import { defineProvider, rule } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";
import { isGemma4Model } from "../shared.ts";

export const VERTEX_BASE_URL = "https://{location}-aiplatform.googleapis.com";

// models.dev lists the rolling `-latest` aliases without capability metadata.
const GEMINI_LATEST_ALIASES = {
	"gemini-flash-latest": "gemini-3.5-flash",
	"gemini-flash-lite-latest": "gemini-3.1-flash-lite",
} as const;

export function getGoogleThinkingLevelMap(
	modelId: string,
	reasoningOptions: readonly ModelsDevReasoningOption[],
): ThinkingLevelMap | undefined {
	const effortMap = getEffortThinkingLevelMap(reasoningOptions);
	if (effortMap) return effortMap;
	if (isGemma4Model(modelId)) {
		return { off: null, minimal: "MINIMAL", low: null, medium: null, high: "HIGH" };
	}
	return undefined;
}

const geminiThinkingLevels = rule({
	why: "Gemini exposes cataloged effort levels; Gemma 4 only documents MINIMAL and HIGH.",
	match: {},
	apply: (model, context) => {
		const map = getGoogleThinkingLevelMap(model.id, context.reasoningOptions ?? []);
		if (map) model.thinkingLevelMap = map;
	},
});

export const google = defineProvider({
	id: "google",
	source: modelsDev({
		provider: "google",
		key: "google",
		api: "google-generative-ai",
		baseUrl: "https://generativelanguage.googleapis.com/v1beta",
		aliases: GEMINI_LATEST_ALIASES,
	}),
	rules: [geminiThinkingLevels],
});

export const googleVertex = defineProvider({
	id: "google-vertex",
	source: modelsDev({
		provider: "google-vertex",
		key: "google-vertex",
		api: "google-vertex",
		baseUrl: VERTEX_BASE_URL,
		// The google-vertex models.dev catalog also includes Claude, OpenAI, and other
		// MaaS models that do not use the @google/genai Gemini streaming path.
		include: (id) => id.startsWith("gemini-") && id !== "gemini-3.1-flash-lite-preview",
		aliases: GEMINI_LATEST_ALIASES,
	}),
	rules: [
		geminiThinkingLevels,
		rule({
			why: "pi only accounts cachedContentTokenCount as cacheRead on Vertex; models.dev cache_write values do not apply.",
			match: {},
			set: { cost: { cacheWrite: 0 } },
		}),
		rule({
			why: "models.dev reports Vertex cache_read for Gemini 2.5 Flash that does not match the official Gemini API pricing table.",
			match: { id: "gemini-2.5-flash" },
			set: { cost: { cacheRead: 0.03 } },
		}),
	],
});
