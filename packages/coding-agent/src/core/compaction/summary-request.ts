import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai/compat";
import { completeSimple, isRetryableAssistantError } from "@earendil-works/pi-ai/compat";

const MAX_SUMMARY_RETRIES = 1;

/**
 * Complete a summary request, retrying one retryable stream failure.
 * Summary requests have no side effects until their final response is used, so
 * a fresh request is safe after a transient transport or provider failure.
 */
export async function completeSummaryRequest(
	model: Model<Api>,
	context: Context,
	options: SimpleStreamOptions,
	streamFn?: StreamFn,
): Promise<AssistantMessage> {
	let response = streamFn
		? await (await streamFn(model, context, options)).result()
		: await completeSimple(model, context, options);

	for (let attempt = 0; attempt < MAX_SUMMARY_RETRIES; attempt++) {
		if (options.signal?.aborted || !isRetryableAssistantError(response)) {
			break;
		}
		response = streamFn
			? await (await streamFn(model, context, options)).result()
			: await completeSimple(model, context, options);
	}

	return response;
}
