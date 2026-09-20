# Model catalog generation

`scripts/generate-models.ts` builds pi's built-in model catalog. It reads upstream
catalogs (models.dev, OpenRouter, Vercel AI Gateway, Radius, NVIDIA NIM), applies pi's
own knowledge about each model, and writes `src/providers/data/<provider>.json` plus the
typed `src/providers/<provider>.models.ts` wrappers.

This directory holds that knowledge as declarations instead of code paths.

## Why declarations

The previous generator was one 3300-line script. Three kinds of logic were interleaved:

1. **Ingestion**: ~25 near-identical loops mapping a models.dev provider onto `Model`.
2. **Hand-maintained models**: providers without an upstream catalog.
3. **Corrections**: hundreds of `if (provider === X && id === Y)` patches for context
   windows, prices, thinking levels, and compat flags, spread over a dozen passes whose
   order mattered and was implicit.

Adding one fact ("this model accepts effort `xhigh`") meant finding the right pass,
matching the right id spelling, and hoping nothing later overwrote it. Nothing type-checked
the script, so a misspelled compat flag was silently dropped from the catalog.

Now a fact is one `rule()` with a `why`, in one place, applied in a documented order, and
`npm run check` rejects unknown flags.

## Layout

```
scripts/generate-models.ts        CLI: options, run the engine, write outputs
scripts/model-generation/
  dsl.ts                           rule(), defineProvider(), matchers, patch semantics
  engine.ts                        applies sources, provider rules, then rule packs
  sources.ts                       upstream fetchers, response types, snapshot replay
  models-dev.ts                    generic models.dev -> Model mapping
  output.ts                        JSON data, manifest, generated TypeScript shards
  shared.ts                        constants used by more than one file
  providers/<provider>.ts          one declaration per provider (families share a file)
  providers/index.ts               generation order
  rules/<concern>.ts               catalog-wide rule packs
  rules/index.ts                   pack order
```

## Concepts

### Provider definition

```ts
export const xai = defineProvider({
	id: "xai",
	source: modelsDev({
		provider: "xai",
		key: "xai",                       // models.dev provider key
		api: "openai-responses",
		baseUrl: "https://api.x.ai/v1",
		compat: { supportsLongCacheRetention: false },
	}),
	models: [/* hand-maintained Model objects, added when the source lacks the id */],
	rules: [/* corrections scoped to this provider */],
});
```

`source` is a function `(context) => Promise<Model[]>`. `modelsDev()` builds one from
options; OpenRouter, Vercel, Radius, NVIDIA and Azure use small custom functions. A
provider may list several sources; the first source to produce an id wins.

`modelsDev()` handles the repeated parts of ingestion and exposes a few knobs for the
recurring variations: `include`, `skipDeprecated`, `mapId`, `route` (per-model api,
baseUrl, compat), `aliases`, `defaults`, `costTiers`. Everything else is a rule.

### Rules

```ts
rule({
	why: "OpenAI rejects minimal effort on GPT-5.5.",
	match: { provider: "openai", id: "gpt-5.5" },
	set: { thinkingLevelMap: { minimal: null } },
});
```

- `match` is plain data where possible: `provider`, `api`, `id`, `idPrefix`, `idIncludes`,
  `idPattern`, `reasoning`, `not`. Arrays mean "any of". `when(model, context)` is the
  escape hatch for computed conditions.
- `set` merges into the model. Object fields (`compat`, `cost`, `thinkingLevelMap`,
  `headers`, `promptCache`) merge one level deep; other fields are assigned.
- `replace` assigns whole values. `apply(model, context)` computes a patch. `drop: true`
  removes the model.
- `context` gives rules the models.dev entry the model came from (`source`,
  `reasoningOptions`), the full models.dev catalog, and `lookup(provider, id)` for other
  generated models.
- `why` is required. Put the date, link, or issue number there for anything that
  corrects upstream data.

### Order of application

1. For each provider in `providers/index.ts`: run its sources, add static `models` that
   the sources did not produce, then apply the provider's `rules` in order.
2. For each pack in `rules/index.ts`, for each model, apply the pack's rules in order.
3. Normalize: drop empty `compat`, give every model the same key order.

Rules within a pack run per model in array order, so a later rule may refine an earlier
one and `when` conditions see the model's current state. Packs are ordered by dependency:
transport compat first, then models.dev effort options, then thinking-level corrections,
then tool and cache capabilities, then fallbacks that read other models' final prices.

Where a correction lives:

- Single provider: that provider's `rules`.
- Several providers, one concern: the matching pack (`thinking-levels`, `tool-capabilities`,
  ...). `catalog-overrides` holds cross-provider data corrections that fit nowhere else.

## Diverging from models.dev

The generator trusts models.dev by default and records every divergence as a rule. To keep
divergences from piling up:

- Each run prints rules that matched nothing. Delete the rule, or mark it
  `mayMatchNothing: true` when it targets a model upstream may legitimately stop listing.
- `--explain <provider>:<id>` prints every rule that touched a model, in order, with its
  `why` and source location.
- `node scripts/diff-model-catalog.mjs [provider]` (repo root) diffs the generated catalog
  between HEAD and the worktree.
- `--upstream-snapshot <dir>` records upstream responses on first use and replays them
  afterwards, so two runs can be compared without upstream drift.

## Adding a field

New per-model metadata (for example image input limits) is a change to `Model` in
`src/types.ts` plus a rule or a `modelsDev()` option. Because `set` is typed against
`Model`, the field is immediately usable in every rule:

```ts
rule({
	why: "Anthropic documents 8000x8000 px and 5 MB per image. https://...",
	match: { idPrefix: "claude-" },
	set: { imageLimits: { maxDimension: 8000, maxBytes: 5_000_000 } },
});
```

Matching on the id rather than the provider expresses "this is a property of the model,
wherever it is served", which the old per-provider passes could not do cleanly.

## Verifying a change

```sh
node scripts/generate-models.ts --strict --json-only --json-output /tmp/catalog --upstream-snapshot /tmp/upstream
node scripts/generate-models.ts --strict --json-only --json-output /tmp/catalog --explain openai:gpt-5.5
node ../../scripts/diff-model-catalog.mjs openai
npm run check
```

Generation tests spawn the script with a mocked `fetch`; see
`test/generate-models-strict.test.ts` and `test/fireworks-model-generation.test.ts`.

## Not done yet

This is the first step. The generated data is unchanged except for key order. Candidates
for follow-up, each a deliberate behavior change:

- `costTiers` is only enabled for GitHub Copilot; other providers still drop models.dev
  context-size price tiers.
- `skipDeprecated` is opt-in per provider.
- `detectOpenAICompletionsCompat` (endpoint-family request defaults) is still a function
  keyed on provider ids and base URLs. It could become a table of endpoint families.
- Rules whose `set` values already equal the upstream value could be reported as redundant,
  so corrections retire when models.dev catches up.
