---
name: add-llm-provider
description: Checklist for adding a new LLM provider to packages/ai. Covers core types, provider implementation, lazy registration, model generation, the full test matrix, coding-agent wiring, and docs.
---

# Adding a New LLM Provider (packages/ai)

A new provider touches multiple files. Work through these steps in order.

## 1. Core Types (`packages/ai/src/types.ts`)

- Add API identifier to `Api` type union (e.g. `"bedrock-converse-stream"`).
- Create options interface extending `StreamOptions`.
- Add mapping to `ApiOptionsMap`.
- Add provider name to `KnownProvider` type union.

## 2. Provider Implementation (`packages/ai/src/providers/`)

Create a provider file exporting:

- `stream<Provider>()` returning `AssistantMessageEventStream`.
- `streamSimple<Provider>()` for `SimpleStreamOptions` mapping.
- Provider-specific options interface.
- Message/tool conversion functions.
- Response parsing that emits standardized events (`text`, `tool_call`, `thinking`, `usage`, `stop`).

## 3. Provider Exports and Lazy Registration

- Add a package subpath export in `packages/ai/package.json` pointing at `./dist/providers/<provider>.js`.
- Add `export type` re-exports in `packages/ai/src/index.ts` for provider option types that should remain available from the root entry.
- Register the provider in `packages/ai/src/providers/register-builtins.ts` via lazy loader wrappers; do not statically import provider implementation modules there.
- Add credential detection in `packages/ai/src/env-api-keys.ts`.

## 4. Model Generation (`packages/ai/scripts/model-generation/`)

- Add `providers/<provider>.ts` with a `defineProvider()` declaration: a `modelsDev()` source (or a custom source function), static `models` for entries upstream lacks, and `rules` for provider-specific corrections. Register it in `providers/index.ts`.
- Cross-provider facts (thinking levels, tool capabilities) go into the matching pack under `rules/`.
- Every `rule()` needs a `why`. Read `packages/ai/scripts/model-generation/README.md` for matcher, patch, and ordering semantics.
- Verify with `node scripts/generate-models.ts --strict --json-only --json-output /tmp/catalog --explain <provider>:<model>` and `node scripts/diff-model-catalog.mjs <provider>` from the repo root.

## 5. Tests (`packages/ai/test/`)

- Always add the provider to `stream.test.ts` with at least one representative model, even if it reuses an existing API impl such as `openai-completions`.
- Add the provider to the broader matrix where applicable: `tokens.test.ts`, `abort.test.ts`, `empty.test.ts`, `context-overflow.test.ts`, `unicode-surrogate.test.ts`, `tool-call-without-result.test.ts`, `image-tool-result.test.ts`, `total-tokens.test.ts`, `cross-provider-handoff.test.ts`.
- For `cross-provider-handoff.test.ts`, add at least one provider/model pair. If the provider exposes multiple model families (e.g. GPT and Claude), add at least one pair per family.
- For non-standard auth, create a utility (e.g. `bedrock-utils.ts`) with credential detection.

## 6. Coding Agent (`packages/coding-agent/`)

- `src/core/model-resolver.ts`: add default model ID to `defaultModelPerProvider`.
- `src/core/provider-display-names.ts`: add API-key login display name so `/login` and related UI show the provider for built-in API-key auth.
- `src/cli/args.ts`: add env var documentation.
- `README.md`: add provider setup instructions.
- `docs/providers.md`: add setup instructions, env var, and `auth.json` key.

## 7. Documentation

- `packages/ai/README.md`: add to providers table, document options/auth, add env vars.
- `packages/ai/CHANGELOG.md`: add entry under `## [Unreleased]`.
