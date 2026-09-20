import type { Api, Model } from "../../src/types.ts";
import {
	applyModelPatch,
	type DefinedRule,
	type GeneratedModel,
	matchesModel,
	type ProviderDefinition,
	type RuleContext,
	type RulePack,
	type SourceContext,
} from "./dsl.ts";
import type { ModelsDevCatalog, ModelsDevModel, UpstreamCatalogs } from "./sources.ts";

export interface CatalogBuildOptions {
	strict: boolean;
	upstream: UpstreamCatalogs;
	providers: readonly ProviderDefinition[];
	rulePacks: readonly RulePack[];
}

export interface RuleHit {
	stage: string;
	rule: DefinedRule;
}

export interface CatalogBuildResult {
	/** Generated models grouped by provider, providers in declaration order, models in generation order. */
	providers: ReadonlyMap<string, readonly GeneratedModel[]>;
	/** Rules that matched no model, excluding rules declared `mayMatchNothing`. */
	unmatchedRules: readonly { stage: string; rule: DefinedRule }[];
	/** Rules that touched each model, keyed by `provider:id`. */
	explain(provider: string, id: string): readonly RuleHit[];
}

interface ModelOrigin {
	sourceId: string;
	entry: ModelsDevModel;
}

function modelKey(provider: string, id: string): string {
	return `${provider}:${id}`;
}

export async function buildModelCatalog(options: CatalogBuildOptions): Promise<CatalogBuildResult> {
	const generated = new Map<string, GeneratedModel[]>();
	const origins = new WeakMap<GeneratedModel, ModelOrigin>();
	const hits = new Map<string, RuleHit[]>();
	const matchCounts = new Map<DefinedRule, number>();
	// Every rule context can read the models.dev catalog, so load it before any provider runs.
	const modelsDev: ModelsDevCatalog = await options.upstream.modelsDev();

	const sourceContext: SourceContext = {
		strict: options.strict,
		upstream: options.upstream,
		generated: (provider) => generated.get(provider) ?? [],
		attachSource: (model, sourceId, entry) => {
			origins.set(model, { sourceId, entry });
		},
	};

	function lookup(provider: string, id: string): GeneratedModel | undefined {
		return generated.get(provider)?.find((model) => model.id === id);
	}

	function contextFor(model: GeneratedModel): RuleContext {
		const origin = origins.get(model);
		return {
			strict: options.strict,
			modelsDev,
			sourceId: origin?.sourceId,
			source: origin?.entry,
			reasoningOptions: origin?.entry.reasoning_options,
			lookup,
		};
	}

	function recordHit(model: GeneratedModel, stage: string, rule: DefinedRule): void {
		matchCounts.set(rule, (matchCounts.get(rule) ?? 0) + 1);
		const key = modelKey(model.provider, model.id);
		const list = hits.get(key);
		if (list) list.push({ stage, rule });
		else hits.set(key, [{ stage, rule }]);
	}

	/** Applies rules in order to each model; returns the surviving models. */
	function applyRules(models: GeneratedModel[], rules: readonly DefinedRule[], stage: string): GeneratedModel[] {
		const survivors: GeneratedModel[] = [];
		for (const model of models) {
			let dropped = false;
			for (const rule of rules) {
				if (!matchesModel(model, rule.match, contextFor(model))) continue;
				recordHit(model, stage, rule);
				if (rule.drop) {
					dropped = true;
					break;
				}
				if (rule.set) applyModelPatch(model, rule.set, "merge");
				if (rule.replace) applyModelPatch(model, rule.replace, "replace");
				if (rule.apply) rule.apply(model, contextFor(model));
			}
			if (!dropped) survivors.push(model);
		}
		return survivors;
	}

	for (const rule of [
		...options.providers.flatMap((provider) => provider.rules ?? []),
		...options.rulePacks.flatMap((pack) => pack.rules),
	]) {
		matchCounts.set(rule, 0);
	}

	for (const provider of options.providers) {
		if (generated.has(provider.id)) throw new Error(`Provider ${provider.id} is declared more than once`);
		const sources = provider.source ? (Array.isArray(provider.source) ? provider.source : [provider.source]) : [];
		const models: GeneratedModel[] = [];
		const seen = new Set<string>();
		const add = (model: GeneratedModel): void => {
			if (model.provider !== provider.id) {
				throw new Error(`Provider ${provider.id} produced model ${model.id} for provider ${model.provider}`);
			}
			// The first source to produce an id wins; static models fill remaining gaps.
			if (seen.has(model.id)) return;
			seen.add(model.id);
			models.push(model);
		};
		for (const source of sources) {
			for (const model of await source(sourceContext)) add(model);
		}
		for (const model of provider.models ?? []) add(structuredClone(model));
		// Rules see the provider's models, so lookups within the provider work.
		generated.set(provider.id, models);
		generated.set(provider.id, applyRules(models, provider.rules ?? [], `provider:${provider.id}`));
	}

	for (const pack of options.rulePacks) {
		for (const [providerId, models] of generated) {
			generated.set(providerId, applyRules(models, pack.rules, pack.name));
		}
	}

	const providers = new Map<string, readonly GeneratedModel[]>();
	for (const [providerId, models] of generated) {
		providers.set(providerId, models.map(normalizeModel));
	}

	const unmatchedRules: { stage: string; rule: DefinedRule }[] = [];
	for (const provider of options.providers) {
		for (const rule of provider.rules ?? []) {
			if (!rule.mayMatchNothing && matchCounts.get(rule) === 0)
				unmatchedRules.push({ stage: `provider:${provider.id}`, rule });
		}
	}
	for (const pack of options.rulePacks) {
		for (const rule of pack.rules) {
			if (!rule.mayMatchNothing && matchCounts.get(rule) === 0) unmatchedRules.push({ stage: pack.name, rule });
		}
	}

	return {
		providers,
		unmatchedRules,
		explain: (provider, id) => hits.get(modelKey(provider, id)) ?? [],
	};
}

const MODEL_KEY_ORDER = [
	"id",
	"name",
	"api",
	"provider",
	"baseUrl",
	"reasoning",
	"thinkingLevelMap",
	"input",
	"cost",
	"promptCache",
	"contextWindow",
	"maxTokens",
	"samplingParams",
	"headers",
	"compat",
] as const satisfies readonly (keyof Model<Api>)[];
const THINKING_LEVEL_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const COST_KEY_ORDER = ["input", "output", "cacheRead", "cacheWrite", "tiers"];

function orderKeys(value: Record<string, unknown>, order: readonly string[]): Record<string, unknown> {
	const rank = new Map(order.map((key, index) => [key, index]));
	const keys = Object.keys(value).sort((a, b) => {
		const rankA = rank.get(a) ?? Number.POSITIVE_INFINITY;
		const rankB = rank.get(b) ?? Number.POSITIVE_INFINITY;
		return rankA - rankB || (a < b ? -1 : a > b ? 1 : 0);
	});
	return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Gives every generated model the same key order (fixed order for known fields, alphabetical
 * for compat flags, level order for thinking maps) and removes empty compat objects, so
 * generated data diffs only when values change.
 */
export function normalizeModel(model: GeneratedModel): GeneratedModel {
	const record = { ...(model as unknown as Record<string, unknown>) };
	for (const key of Object.keys(record)) {
		if (record[key] === undefined) delete record[key];
	}
	if (isRecord(record.compat)) {
		if (Object.keys(record.compat).length === 0) delete record.compat;
		else record.compat = orderKeys(record.compat, []);
	}
	if (isRecord(record.thinkingLevelMap))
		record.thinkingLevelMap = orderKeys(record.thinkingLevelMap, THINKING_LEVEL_ORDER);
	if (isRecord(record.cost)) record.cost = orderKeys(record.cost, COST_KEY_ORDER);
	return orderKeys(record, MODEL_KEY_ORDER) as unknown as GeneratedModel;
}
