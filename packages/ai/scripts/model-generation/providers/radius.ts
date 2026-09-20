import { getRadiusModelsFromConfig } from "../../../src/providers/radius-config.ts";
import { defineProvider } from "../dsl.ts";

// Radius ships its unauthenticated public catalog; authenticated clients overlay it at runtime.
export const radius = defineProvider({
	id: "radius",
	source: async (context) => {
		const config = await context.upstream.radius();
		if (!config) return [];
		const models = getRadiusModelsFromConfig("radius", config);
		console.log(`Fetched ${models.length} models from Radius`);
		return models;
	},
});
