import { defineProvider } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";

export const anthropic = defineProvider({
	id: "anthropic",
	source: modelsDev({
		provider: "anthropic",
		key: "anthropic",
		api: "anthropic-messages",
		baseUrl: "https://api.anthropic.com",
	}),
});
