import type { ProviderDefinition } from "../dsl.ts";
import { amazonBedrock } from "./amazon-bedrock.ts";
import { anthropic } from "./anthropic.ts";
import { azureOpenaiResponses } from "./azure.ts";
import { baseten } from "./baseten.ts";
import { cloudflareAiGateway, cloudflareWorkersAi } from "./cloudflare.ts";
import { fireworks } from "./fireworks.ts";
import { githubCopilot } from "./github-copilot.ts";
import { google, googleVertex } from "./google.ts";
import { kimiCoding } from "./kimi-coding.ts";
import { minimax, minimaxCn } from "./minimax.ts";
import { mistral } from "./mistral.ts";
import { moonshotai, moonshotaiCn } from "./moonshot.ts";
import { nvidia } from "./nvidia.ts";
import { openai } from "./openai.ts";
import { opencode, opencodeGo } from "./opencode.ts";
import { openrouter } from "./openrouter.ts";
import { qwenTokenPlan, qwenTokenPlanCn, qwenTokenPlanIndividual } from "./qwen-token-plan.ts";
import { radius } from "./radius.ts";
import { cerebras, groq, huggingface, meta, xai } from "./simple-openai-compatible.ts";
import { antLing, deepseek, openaiCodex } from "./static.ts";
import { together } from "./together.ts";
import { vercelAiGateway } from "./vercel-ai-gateway.ts";
import { xiaomi, xiaomiTokenPlanAms, xiaomiTokenPlanCn, xiaomiTokenPlanSgp } from "./xiaomi.ts";
import { zai, zaiCodingCn } from "./zai.ts";

/**
 * Providers in generation order. Derived providers (Azure mirrors OpenAI) must follow
 * the provider they read from.
 */
export const PROVIDERS: readonly ProviderDefinition[] = [
	amazonBedrock,
	anthropic,
	google,
	googleVertex,
	openai,
	groq,
	cerebras,
	cloudflareWorkersAi,
	cloudflareAiGateway,
	xai,
	meta,
	zai,
	zaiCodingCn,
	mistral,
	huggingface,
	fireworks,
	nvidia,
	together,
	baseten,
	opencode,
	opencodeGo,
	githubCopilot,
	minimax,
	minimaxCn,
	kimiCoding,
	moonshotai,
	moonshotaiCn,
	xiaomi,
	xiaomiTokenPlanCn,
	xiaomiTokenPlanAms,
	xiaomiTokenPlanSgp,
	qwenTokenPlan,
	qwenTokenPlanIndividual,
	qwenTokenPlanCn,
	openrouter,
	vercelAiGateway,
	radius,
	deepseek,
	antLing,
	openaiCodex,
	azureOpenaiResponses,
];
