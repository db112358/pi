import { defineProvider } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";

const BEDROCK_INFERENCE_PROFILE_ONLY_MODEL_IDS = new Set(["anthropic.claude-opus-5"]);

export const amazonBedrock = defineProvider({
	id: "amazon-bedrock",
	source: modelsDev({
		provider: "amazon-bedrock",
		key: "amazon-bedrock",
		api: "bedrock-converse-stream",
		baseUrl: (id) =>
			id.startsWith("eu.")
				? "https://bedrock-runtime.eu-central-1.amazonaws.com"
				: "https://bedrock-runtime.us-east-1.amazonaws.com",
		include: (id) =>
			// Only reachable through inference profiles.
			!BEDROCK_INFERENCE_PROFILE_ONLY_MODEL_IDS.has(id) &&
			// Jamba does not support tool use in streaming mode.
			!id.startsWith("ai21.jamba") &&
			// Mistral 7B does not support system messages.
			!id.startsWith("mistral.mistral-7b-instruct-v0"),
		route: (_id, entry) => (entry.structured_output === true ? { compat: { supportsStrictMode: true } } : undefined),
	}),
});
