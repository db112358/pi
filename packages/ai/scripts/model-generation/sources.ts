import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	DEFAULT_RADIUS_GATEWAY,
	parseRadiusGatewayConfig,
	type RadiusGatewayConfig,
} from "../../src/providers/radius-config.ts";
import type { ModelsDevReasoningOption } from "../models-dev-reasoning-options.ts";
import type { OpenRouterReasoningMetadata } from "../openrouter-reasoning-options.ts";

/** One model entry from https://models.dev/api.json. */
export interface ModelsDevModel {
	id: string;
	name: string;
	tool_call?: boolean;
	structured_output?: boolean;
	reasoning?: boolean;
	reasoning_options?: ModelsDevReasoningOption[];
	status?: string;
	limit?: {
		context?: number;
		output?: number;
	};
	cost?: {
		input?: number;
		output?: number;
		cache_read?: number;
		cache_write?: number;
		tiers?: {
			input?: number;
			output?: number;
			cache_read?: number;
			cache_write?: number;
			tier?: {
				type?: string;
				size?: number;
			};
		}[];
	};
	modalities?: {
		input?: string[];
		output?: string[];
	};
	provider?: {
		npm?: string;
	};
}

export interface ModelsDevProvider {
	models?: Record<string, ModelsDevModel>;
}

export type ModelsDevCatalog = Record<string, ModelsDevProvider>;

export interface NvidiaNimModelListItem {
	id: string;
}

export interface OpenRouterModelListItem {
	id: string;
	name: string;
	supported_parameters?: string[];
	architecture?: { modality?: string };
	pricing?: {
		prompt?: string;
		completion?: string;
		input_cache_read?: string;
		input_cache_write?: string;
	};
	top_provider?: {
		context_length?: number;
		max_completion_tokens?: number;
	};
	context_length?: number;
	reasoning?: OpenRouterReasoningMetadata;
}

export interface AiGatewayModel {
	id: string;
	name?: string;
	context_window?: number;
	max_tokens?: number;
	tags?: string[];
	pricing?: {
		input?: string | number;
		output?: string | number;
		input_cache_read?: string | number;
		input_cache_write?: string | number;
	};
}

export const MODELS_DEV_URL = "https://models.dev/api.json";
export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const AI_GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";
export const NVIDIA_NIM_MODELS_URL = "https://integrate.api.nvidia.com/v1/models";
export const RADIUS_CONFIG_URL = new URL("/v1/config", DEFAULT_RADIUS_GATEWAY).href;

export interface UpstreamOptions {
	/** Fail instead of continuing with an empty catalog when an upstream source cannot be loaded. */
	strict: boolean;
	/**
	 * Directory of recorded upstream responses. Responses present in the directory are
	 * read instead of fetched; fetched responses are written there for later replays.
	 */
	snapshotDir?: string;
}

interface UpstreamSource<T> {
	name: string;
	label: string;
	url: string;
	parse: (payload: unknown) => T;
	empty: () => T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseListPayload<T>(payload: unknown): T[] {
	return isRecord(payload) && Array.isArray(payload.data) ? (payload.data as T[]) : [];
}

const MODELS_DEV_SOURCE: UpstreamSource<ModelsDevCatalog> = {
	name: "models-dev",
	label: "models.dev",
	url: MODELS_DEV_URL,
	parse: (payload) => (isRecord(payload) ? (payload as ModelsDevCatalog) : {}),
	empty: () => ({}),
};

const OPENROUTER_SOURCE: UpstreamSource<OpenRouterModelListItem[]> = {
	name: "openrouter",
	label: "OpenRouter",
	url: OPENROUTER_MODELS_URL,
	parse: parseListPayload<OpenRouterModelListItem>,
	empty: () => [],
};

const AI_GATEWAY_SOURCE: UpstreamSource<AiGatewayModel[]> = {
	name: "vercel-ai-gateway",
	label: "Vercel AI Gateway",
	url: AI_GATEWAY_MODELS_URL,
	parse: parseListPayload<AiGatewayModel>,
	empty: () => [],
};

const NVIDIA_NIM_SOURCE: UpstreamSource<NvidiaNimModelListItem[]> = {
	name: "nvidia-nim",
	label: "NVIDIA NIM",
	url: NVIDIA_NIM_MODELS_URL,
	parse: parseListPayload<NvidiaNimModelListItem>,
	empty: () => [],
};

const RADIUS_SOURCE: UpstreamSource<RadiusGatewayConfig | undefined> = {
	name: "radius",
	label: "Radius",
	url: RADIUS_CONFIG_URL,
	parse: (payload) => {
		const config = parseRadiusGatewayConfig(payload, DEFAULT_RADIUS_GATEWAY);
		if (config.models.length === 0) throw new Error("Radius API returned no models");
		return config;
	},
	empty: () => undefined,
};

/**
 * Lazily loaded, memoized upstream catalogs. Each source is fetched at most once per
 * generator run and only when a provider declaration asks for it.
 */
export class UpstreamCatalogs {
	readonly options: UpstreamOptions;
	private readonly loaded = new Map<string, Promise<unknown>>();

	constructor(options: UpstreamOptions) {
		this.options = options;
	}

	modelsDev(): Promise<ModelsDevCatalog> {
		return this.load(MODELS_DEV_SOURCE);
	}

	openRouter(): Promise<OpenRouterModelListItem[]> {
		return this.load(OPENROUTER_SOURCE);
	}

	vercelAiGateway(): Promise<AiGatewayModel[]> {
		return this.load(AI_GATEWAY_SOURCE);
	}

	nvidiaNim(): Promise<NvidiaNimModelListItem[]> {
		return this.load(NVIDIA_NIM_SOURCE);
	}

	radius(): Promise<RadiusGatewayConfig | undefined> {
		return this.load(RADIUS_SOURCE);
	}

	private load<T>(source: UpstreamSource<T>): Promise<T> {
		let pending = this.loaded.get(source.name) as Promise<T> | undefined;
		if (!pending) {
			pending = this.loadUncached(source);
			this.loaded.set(source.name, pending);
		}
		return pending;
	}

	private async loadUncached<T>(source: UpstreamSource<T>): Promise<T> {
		try {
			return source.parse(await this.readPayload(source));
		} catch (error) {
			console.error(`Failed to fetch ${source.label} models:`, error);
			if (this.options.strict) throw error;
			return source.empty();
		}
	}

	private async readPayload<T>(source: UpstreamSource<T>): Promise<unknown> {
		const snapshotPath = this.options.snapshotDir ? join(this.options.snapshotDir, `${source.name}.json`) : undefined;
		if (snapshotPath && existsSync(snapshotPath)) {
			console.log(`Reading ${source.label} models from ${snapshotPath}...`);
			return JSON.parse(readFileSync(snapshotPath, "utf8"));
		}
		console.log(`Fetching models from ${source.label} API...`);
		const response = await fetch(source.url, { headers: { accept: "application/json" } });
		if (!response.ok) throw new Error(`${source.label} API returned ${response.status}`);
		const text = await response.text();
		const payload: unknown = JSON.parse(text);
		if (snapshotPath) {
			mkdirSync(this.options.snapshotDir as string, { recursive: true });
			writeFileSync(snapshotPath, text);
		}
		return payload;
	}
}
