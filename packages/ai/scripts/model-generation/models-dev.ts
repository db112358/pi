import type { Api, ModelCost } from "../../src/types.ts";
import type { CompatPatch, GeneratedModel, ModelSource } from "./dsl.ts";
import type { ModelsDevModel } from "./sources.ts";

/** Per-model transport overrides resolved from the upstream entry. */
export interface ModelsDevRoute {
	api?: Api;
	baseUrl?: string;
	compat?: CompatPatch;
	headers?: Record<string, string>;
}

export interface ModelsDevSourceOptions {
	/** Provider id in the generated catalog. */
	provider: string;
	/** models.dev provider key(s); the first key present in the catalog is used. */
	key: string | readonly string[];
	api: Api;
	baseUrl: string | ((id: string, entry: ModelsDevModel) => string);
	compat?: CompatPatch;
	headers?: Record<string, string>;
	/** Skip entries with `status: "deprecated"`. */
	skipDeprecated?: boolean;
	/** Extra filter beyond the always-applied `tool_call` check. Receives the models.dev id. */
	include?: (id: string, entry: ModelsDevModel, models: Readonly<Record<string, ModelsDevModel>>) => boolean;
	/** Rename an entry. Return `undefined` to skip it. Receives the models.dev id. */
	mapId?: (id: string, entry: ModelsDevModel) => string | undefined;
	/** Per-model api, baseUrl, compat, or headers. Receives the models.dev id. */
	route?: (id: string, entry: ModelsDevModel) => ModelsDevRoute | undefined;
	/**
	 * Entries whose capabilities, limits, and prices come from another entry of the same
	 * provider (`{ alias: target }`). The alias keeps its own id and name.
	 */
	aliases?: Readonly<Record<string, string>>;
	/** Fallbacks when models.dev omits limits. Default: 4096 for both. */
	defaults?: { contextWindow?: number; maxTokens?: number };
	/** Import models.dev context-size price tiers as `cost.tiers`. */
	costTiers?: boolean;
}

export function getModelsDevCost(cost: ModelsDevModel["cost"], includeTiers = false): ModelCost {
	const tiers = includeTiers
		? cost?.tiers?.flatMap((tier) => {
				const context = tier.tier;
				if (context?.type !== "context" || context.size === undefined) return [];
				return [
					{
						inputTokensAbove: context.size,
						input: tier.input || 0,
						output: tier.output || 0,
						cacheRead: tier.cache_read || 0,
						cacheWrite: tier.cache_write || 0,
					},
				];
			})
		: undefined;

	return {
		input: cost?.input || 0,
		output: cost?.output || 0,
		cacheRead: cost?.cache_read || 0,
		cacheWrite: cost?.cache_write || 0,
		...(tiers && tiers.length > 0 ? { tiers } : {}),
	};
}

export function getModelsDevInput(entry: ModelsDevModel): GeneratedModel["input"] {
	return entry.modalities?.input?.includes("image") ? ["text", "image"] : ["text"];
}

/** Maps tool-capable models.dev entries of one provider onto pi's `Model` shape. */
export function modelsDev(options: ModelsDevSourceOptions): ModelSource {
	return async (context) => {
		const catalog = await context.upstream.modelsDev();
		const keys = Array.isArray(options.key) ? (options.key as readonly string[]) : [options.key as string];
		const key = keys.find((candidate) => catalog[candidate]?.models);
		const models = key ? (catalog[key]?.models ?? {}) : {};
		const generated: GeneratedModel[] = [];

		for (const [sourceId, entry] of Object.entries(models)) {
			if (entry.tool_call !== true) continue;
			if (options.skipDeprecated && entry.status === "deprecated") continue;
			if (options.include && !options.include(sourceId, entry, models)) continue;
			const id = options.mapId ? options.mapId(sourceId, entry) : sourceId;
			if (id === undefined) continue;

			const aliasTarget = options.aliases?.[sourceId];
			const data = aliasTarget ? (models[aliasTarget] ?? entry) : entry;
			const route = options.route?.(sourceId, entry);
			const compat = route?.compat ?? options.compat;
			const headers = route?.headers ?? options.headers;
			const baseUrl =
				route?.baseUrl ?? (typeof options.baseUrl === "string" ? options.baseUrl : options.baseUrl(id, entry));

			const model: GeneratedModel = {
				id,
				name: entry.name || id,
				api: route?.api ?? options.api,
				provider: options.provider,
				baseUrl,
				reasoning: data.reasoning === true,
				input: getModelsDevInput(data),
				cost: getModelsDevCost(data.cost, options.costTiers === true),
				contextWindow: data.limit?.context || options.defaults?.contextWindow || 4096,
				maxTokens: data.limit?.output || options.defaults?.maxTokens || 4096,
				...(headers ? { headers: { ...headers } } : {}),
				...(compat ? { compat: { ...compat } as GeneratedModel["compat"] } : {}),
			};
			context.attachSource(model, sourceId, data);
			generated.push(model);
		}

		return generated;
	};
}
