import type { RulePack } from "../dsl.ts";
import { anthropicCompatPack } from "./anthropic-compat.ts";
import { anthropicFallbacksPack } from "./anthropic-fallbacks.ts";
import { catalogOverridesPack } from "./catalog-overrides.ts";
import { openAiCompletionsCompatPack } from "./openai-completions-compat.ts";
import { promptCachePack } from "./prompt-cache.ts";
import { reasoningOptionsPack } from "./reasoning-options.ts";
import { thinkingLevelsPack } from "./thinking-levels.ts";
import { toolCapabilitiesPack } from "./tool-capabilities.ts";

/**
 * Catalog-wide rule packs, applied in this order after every provider has been
 * generated. Later packs see the effects of earlier ones.
 */
export const RULE_PACKS: readonly RulePack[] = [
	catalogOverridesPack,
	openAiCompletionsCompatPack,
	anthropicCompatPack,
	reasoningOptionsPack,
	thinkingLevelsPack,
	toolCapabilitiesPack,
	promptCachePack,
	anthropicFallbacksPack,
];
