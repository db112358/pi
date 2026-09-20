import type { OpenAICompletionsCompat } from "../../../src/types.ts";
import { defineProvider, type ProviderDefinition } from "../dsl.ts";
import { modelsDev } from "../models-dev.ts";

// Built-in `xiaomi` targets the API billing endpoint (single stable URL, keys from
// platform.xiaomimimo.com). The three `xiaomi-token-plan-*` providers cover prepaid
// Token Plan endpoints in cn / ams / sgp.
const XIAOMI_COMPAT: OpenAICompletionsCompat = {
	requiresReasoningContentOnAssistantMessages: true,
	thinkingFormat: "deepseek",
};

function xiaomiProvider(id: string, baseUrl: string): ProviderDefinition {
	return defineProvider({
		id,
		source: modelsDev({
			provider: id,
			key: id,
			api: "openai-completions",
			baseUrl,
			compat: XIAOMI_COMPAT,
			skipDeprecated: true,
		}),
	});
}

export const xiaomi = xiaomiProvider("xiaomi", "https://api.xiaomimimo.com/v1");
export const xiaomiTokenPlanCn = xiaomiProvider("xiaomi-token-plan-cn", "https://token-plan-cn.xiaomimimo.com/v1");
export const xiaomiTokenPlanAms = xiaomiProvider("xiaomi-token-plan-ams", "https://token-plan-ams.xiaomimimo.com/v1");
export const xiaomiTokenPlanSgp = xiaomiProvider("xiaomi-token-plan-sgp", "https://token-plan-sgp.xiaomimimo.com/v1");
