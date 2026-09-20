#!/usr/bin/env node

// Generates pi's built-in model catalog from upstream sources plus the declarative
// provider definitions and rule packs under scripts/model-generation/. See
// scripts/model-generation/README.md for how the pieces fit together.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildModelCatalog } from "./model-generation/engine.ts";
import { sortCatalog, writeCatalog } from "./model-generation/output.ts";
import { PROVIDERS } from "./model-generation/providers/index.ts";
import { RULE_PACKS } from "./model-generation/rules/index.ts";
import { UpstreamCatalogs } from "./model-generation/sources.ts";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

interface GeneratorOptions {
	strict: boolean;
	dataOnly: boolean;
	jsonOnly: boolean;
	jsonOutputDir: string | undefined;
	pretty: boolean;
	upstreamSnapshotDir: string | undefined;
	explain: { provider: string; id: string }[];
}

function readGeneratorOptions(args: string[]): GeneratorOptions {
	const options: GeneratorOptions = {
		strict: false,
		dataOnly: false,
		jsonOnly: false,
		jsonOutputDir: undefined,
		pretty: false,
		upstreamSnapshotDir: undefined,
		explain: [],
	};

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--strict") {
			options.strict = true;
			continue;
		}
		if (arg === "--data-only") {
			options.dataOnly = true;
			continue;
		}
		if (arg === "--json-only") {
			options.jsonOnly = true;
			continue;
		}
		if (arg === "--pretty") {
			options.pretty = true;
			continue;
		}
		if (arg === "--json-output") {
			const value = args[++index];
			if (!value) throw new Error("--json-output requires a directory");
			options.jsonOutputDir = resolve(value);
			continue;
		}
		if (arg === "--upstream-snapshot") {
			const value = args[++index];
			if (!value) throw new Error("--upstream-snapshot requires a directory");
			options.upstreamSnapshotDir = resolve(value);
			continue;
		}
		if (arg === "--explain") {
			const value = args[++index];
			const separator = value?.indexOf(":") ?? -1;
			if (!value || separator <= 0) throw new Error("--explain requires <provider>:<model id>");
			options.explain.push({ provider: value.slice(0, separator), id: value.slice(separator + 1) });
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	if (options.jsonOnly && !options.jsonOutputDir) throw new Error("--json-only requires --json-output");
	if (options.dataOnly && (options.jsonOnly || options.jsonOutputDir)) {
		throw new Error("--data-only cannot be combined with JSON catalog output");
	}
	return options;
}

async function generateModels(): Promise<void> {
	const options = readGeneratorOptions(process.argv.slice(2));
	const result = await buildModelCatalog({
		strict: options.strict,
		upstream: new UpstreamCatalogs({ strict: options.strict, snapshotDir: options.upstreamSnapshotDir }),
		providers: PROVIDERS,
		rulePacks: RULE_PACKS,
	});

	for (const { provider, id } of options.explain) {
		const hits = result.explain(provider, id);
		console.log(`\nRules applied to ${provider}:${id}${hits.length === 0 ? " (none)" : ""}`);
		for (const hit of hits) console.log(`  [${hit.stage}] ${hit.rule.why} (${hit.rule.definedAt})`);
	}

	if (result.unmatchedRules.length > 0) {
		console.log(
			`\n${result.unmatchedRules.length} rule(s) matched no model; remove them or mark them mayMatchNothing:`,
		);
		for (const { stage, rule } of result.unmatchedRules) console.log(`  [${stage}] ${rule.why} (${rule.definedAt})`);
	}

	writeCatalog(sortCatalog(result.providers), {
		packageRoot,
		dataOnly: options.dataOnly,
		jsonOnly: options.jsonOnly,
		jsonOutputDir: options.jsonOutputDir,
		pretty: options.pretty,
	});

	const allModels = Array.from(result.providers.values()).flat();
	console.log(`\nModel Statistics:`);
	console.log(`  Total tool-capable models: ${allModels.length}`);
	console.log(`  Reasoning-capable models: ${allModels.filter((model) => model.reasoning).length}`);
	for (const [provider, models] of result.providers) {
		console.log(`  ${provider}: ${models.length} models`);
	}
}

generateModels().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
