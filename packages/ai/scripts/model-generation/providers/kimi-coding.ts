import type { ModelCost } from "../../../src/types.ts";
import { defineProvider, rule } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";
import { KIMI_K3_COST } from "../shared.ts";

// models.dev may expose versioned aliases of the canonical Kimi For Coding model.
const KIMI_CODING_ALIASES = new Set(["k2p5", "k2p6", "k2p7"]);

// Kimi Coding is subscription-backed, so models.dev reports zero cost. Use the
// equivalent Moonshot API rates to estimate the value of subscription usage.
const KIMI_CODING_IMPLIED_COSTS: Record<string, ModelCost> = {
	k3: KIMI_K3_COST,
	"kimi-for-coding": { input: 0.95, output: 4, cacheRead: 0.19, cacheWrite: 0 },
	"kimi-for-coding-highspeed": { input: 1.9, output: 8, cacheRead: 0.38, cacheWrite: 0 },
	"kimi-k2-thinking": { input: 0.6, output: 2.5, cacheRead: 0.15, cacheWrite: 0 },
};

export const kimiCoding = defineProvider({
	id: "kimi-coding",
	source: modelsDev({
		provider: "kimi-coding",
		key: "kimi-code-plan-global",
		api: "anthropic-messages",
		// Kimi For Coding's Anthropic-compatible API - SDK appends /v1/messages
		baseUrl: "https://api.kimi.com/coding",
		compat: { forceAdaptiveThinking: true },
		// Drop aliases when the canonical model exists; otherwise emit them under the canonical id.
		include: (id, _entry, models) => !(KIMI_CODING_ALIASES.has(id) && Object.hasOwn(models, "kimi-for-coding")),
		mapId: (id) => (KIMI_CODING_ALIASES.has(id) ? "kimi-for-coding" : id),
	}),
	rules: [
		rule({
			why: "Aliases normalized to the canonical id also take the canonical name.",
			match: { id: "kimi-for-coding", when: (_model, context) => KIMI_CODING_ALIASES.has(context.sourceId ?? "") },
			set: { name: "Kimi For Coding" },
			mayMatchNothing: true,
		}),
		rule({
			why: "Kimi K3 and Kimi For Coding replay thinking without signatures.",
			match: { id: ["k3", "kimi-for-coding"] },
			set: { compat: { allowEmptySignature: true } },
		}),
		rule({
			why: "Kimi K3 always reasons even when the catalog omits the flag.",
			match: { id: "k3" },
			set: { reasoning: true },
		}),
		rule({
			why: "Subscription pricing is reported as zero; fill in the equivalent Moonshot API rates per missing field.",
			match: { id: Object.keys(KIMI_CODING_IMPLIED_COSTS) },
			apply: (model) => {
				const implied = KIMI_CODING_IMPLIED_COSTS[model.id];
				model.cost = {
					input: model.cost.input || implied.input,
					output: model.cost.output || implied.output,
					cacheRead: model.cost.cacheRead || implied.cacheRead,
					cacheWrite: model.cost.cacheWrite || implied.cacheWrite,
				};
			},
		}),
	],
});
