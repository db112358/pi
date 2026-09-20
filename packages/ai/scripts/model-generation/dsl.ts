import type { Api, Model, ModelCost, ModelPromptCache, ThinkingLevelMap } from "../../src/types.ts";
import type { ModelsDevReasoningOption } from "../models-dev-reasoning-options.ts";
import type { ModelsDevCatalog, ModelsDevModel, UpstreamCatalogs } from "./sources.ts";

/**
 * Declarative model catalog rules.
 *
 * A provider declaration says where its models come from (`source`), which
 * hand-maintained entries to add when the source lacks them (`models`), and
 * which corrections apply to its models (`rules`). Cross-provider concerns
 * (thinking levels, transport compat flags) live in ordered rule packs.
 *
 * Every rule carries a `why`, matches models with plain data where possible,
 * and patches them with `set` (merged into the model) or `replace`. `apply`
 * and `when` are escape hatches for values that must be computed.
 */

export type GeneratedModel = Model<Api>;

type CompatUnion = NonNullable<GeneratedModel["compat"]>;
type KeysOfUnion<T> = T extends unknown ? keyof T : never;
type ValueOfUnion<T, K extends PropertyKey> = T extends unknown ? (K extends keyof T ? T[K] : never) : never;

/**
 * Union of every API's compat flags. Unknown flag names fail type checking; mixing
 * flags across APIs does not, so keep rules scoped to one `api` where it matters.
 */
export type CompatPatch = { [K in KeysOfUnion<CompatUnion>]?: ValueOfUnion<CompatUnion, K> };

/** Fields a rule may change. Identity fields (`id`, `provider`, `api`) are fixed by the source. */
export interface ModelPatch {
	name?: string;
	baseUrl?: string;
	reasoning?: boolean;
	thinkingLevelMap?: ThinkingLevelMap;
	input?: GeneratedModel["input"];
	cost?: Partial<ModelCost>;
	promptCache?: ModelPromptCache;
	contextWindow?: number;
	maxTokens?: number;
	samplingParams?: Record<string, unknown>;
	headers?: Record<string, string>;
	compat?: CompatPatch;
}

export interface RuleContext {
	readonly strict: boolean;
	/** The full models.dev catalog, for rules that read sibling providers (for example reference prices). */
	readonly modelsDev: ModelsDevCatalog;
	/** models.dev key the current model was generated from, when it came from models.dev. */
	readonly sourceId: string | undefined;
	/** models.dev entry the current model was generated from, when it came from models.dev. */
	readonly source: ModelsDevModel | undefined;
	/** Shorthand for `source?.reasoning_options`. */
	readonly reasoningOptions: readonly ModelsDevReasoningOption[] | undefined;
	/** Another generated model in its current state. Providers are generated in declaration order. */
	lookup(provider: string, id: string): GeneratedModel | undefined;
}

export interface ModelMatch {
	provider?: string | readonly string[];
	api?: Api | readonly Api[];
	/** Exact model id(s). */
	id?: string | readonly string[];
	idPrefix?: string | readonly string[];
	/** Substring(s); any match counts. */
	idIncludes?: string | readonly string[];
	idPattern?: RegExp | readonly RegExp[];
	reasoning?: boolean;
	/** Excludes models matching this nested matcher. */
	not?: ModelMatch;
	/** Computed condition evaluated against the model's current state. */
	when?: (model: GeneratedModel, context: RuleContext) => boolean;
}

export interface ModelRule {
	/** Why the rule exists. Include links, dates, or issue numbers for upstream corrections. */
	why: string;
	match: ModelMatch;
	/** Merged into the model: object fields (`compat`, `cost`, `thinkingLevelMap`, ...) merge one level deep, everything else is assigned. */
	set?: ModelPatch;
	/** Assigned to the model wholesale. */
	replace?: ModelPatch;
	/** Computed patch for values that depend on upstream metadata or other models. */
	apply?: (model: GeneratedModel, context: RuleContext) => void;
	/** Remove matching models from the catalog. */
	drop?: boolean;
	/** Suppress the unmatched-rule report, for rules targeting models upstream may stop listing. */
	mayMatchNothing?: boolean;
}

export interface DefinedRule extends ModelRule {
	/** Source location of the `rule()` call, for reports. */
	readonly definedAt: string;
}

const DSL_FILE_PATTERN = /model-generation[\\/]dsl\.ts/;

function captureDefinitionSite(): string {
	const stack = new Error().stack?.split("\n") ?? [];
	const frame = stack.slice(1).find((line) => line.includes("model-generation") && !DSL_FILE_PATTERN.test(line));
	if (!frame) return "unknown";
	const match = /\(?((?:file:\/\/)?[^()]*?):(\d+):\d+\)?\s*$/.exec(frame.trim());
	if (!match) return frame.trim();
	const path = match[1].replace(/^file:\/\//, "");
	const relative = path.slice(path.lastIndexOf("model-generation"));
	return `${relative}:${match[2]}`;
}

export function rule(definition: ModelRule): DefinedRule {
	if (!definition.set && !definition.replace && !definition.apply && !definition.drop) {
		throw new Error(`Rule "${definition.why}" does not change anything`);
	}
	return { ...definition, definedAt: captureDefinitionSite() };
}

function toArray<T>(value: T | readonly T[]): readonly T[] {
	return Array.isArray(value) ? (value as readonly T[]) : [value as T];
}

export function matchesModel(model: GeneratedModel, match: ModelMatch, context: RuleContext): boolean {
	if (match.provider !== undefined && !toArray(match.provider).includes(model.provider)) return false;
	if (match.api !== undefined && !toArray(match.api).includes(model.api)) return false;
	if (match.id !== undefined && !toArray(match.id).includes(model.id)) return false;
	if (match.idPrefix !== undefined && !toArray(match.idPrefix).some((prefix) => model.id.startsWith(prefix)))
		return false;
	if (match.idIncludes !== undefined && !toArray(match.idIncludes).some((part) => model.id.includes(part)))
		return false;
	if (match.idPattern !== undefined && !toArray(match.idPattern).some((pattern) => pattern.test(model.id)))
		return false;
	if (match.reasoning !== undefined && model.reasoning !== match.reasoning) return false;
	if (match.not !== undefined && matchesModel(model, match.not, context)) return false;
	if (match.when !== undefined && !match.when(model, context)) return false;
	return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Model fields that `set` merges one level deep instead of replacing. */
const MERGED_FIELDS = new Set<keyof ModelPatch>([
	"compat",
	"cost",
	"thinkingLevelMap",
	"headers",
	"promptCache",
	"samplingParams",
]);

function cloneValue<T>(value: T): T {
	if (Array.isArray(value)) return [...value] as T;
	if (isPlainObject(value)) return { ...value } as T;
	return value;
}

export function applyModelPatch(model: GeneratedModel, patch: ModelPatch, mode: "merge" | "replace"): void {
	const target = model as unknown as Record<string, unknown>;
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) continue;
		const existing = target[key];
		if (
			mode === "merge" &&
			MERGED_FIELDS.has(key as keyof ModelPatch) &&
			isPlainObject(value) &&
			isPlainObject(existing)
		) {
			target[key] = { ...existing, ...value };
			continue;
		}
		target[key] = cloneValue(value);
	}
}

/** The model's compat flags read through the merged flag type, for conditions on any API's flags. */
export function compatOf(model: GeneratedModel): CompatPatch {
	return (model.compat ?? {}) as CompatPatch;
}

/** Merges `patch` into `model.compat`. Rules use `set: { compat }`; sources use this directly. */
export function mergeCompat(model: GeneratedModel, patch: CompatPatch): void {
	applyModelPatch(model, { compat: patch }, "merge");
}

export function mergeThinkingLevelMap(model: GeneratedModel, map: ThinkingLevelMap): void {
	applyModelPatch(model, { thinkingLevelMap: map }, "merge");
}

export interface SourceContext {
	readonly strict: boolean;
	readonly upstream: UpstreamCatalogs;
	/** Models already generated for another provider, in their post-rule state. */
	generated(provider: string): readonly GeneratedModel[];
	/** Remember the models.dev entry a model came from so rules can read it. */
	attachSource(model: GeneratedModel, sourceId: string, entry: ModelsDevModel): void;
}

export type ModelSource = (context: SourceContext) => Promise<GeneratedModel[]>;

export interface ProviderDefinition {
	id: string;
	/** Upstream source(s). Concatenated in order; the first model with a given id wins. */
	source?: ModelSource | readonly ModelSource[];
	/** Hand-maintained models, added when no source produced the same id. */
	models?: readonly GeneratedModel[];
	/** Rules scoped to this provider's models, applied after sources and static models. */
	rules?: readonly DefinedRule[];
}

export function defineProvider(definition: ProviderDefinition): ProviderDefinition {
	for (const model of definition.models ?? []) {
		if (model.provider !== definition.id) {
			throw new Error(`Static model ${model.id} declares provider ${model.provider} inside ${definition.id}`);
		}
	}
	return definition;
}

/** A named, ordered group of rules applied to the whole catalog. */
export interface RulePack {
	name: string;
	rules: readonly DefinedRule[];
}

export function definePack(name: string, rules: readonly DefinedRule[]): RulePack {
	return { name, rules };
}

export function roundCost(value: number): number {
	return Number(value.toFixed(6));
}
