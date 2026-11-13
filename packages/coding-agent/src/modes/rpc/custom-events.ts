import type { EventBus } from "../../core/event-bus.ts";
import type { RpcCustomEvent } from "./rpc-types.ts";

/**
 * Subscribe to the extension channels an embedding client exposed with
 * `pi.rpc.expose`. Returns an unsubscribe; call it before re-binding a new set.
 */
export function bridgeCustomEvents(
	bus: EventBus,
	channels: Iterable<string>,
	output: (event: RpcCustomEvent) => void,
): () => void {
	const unsubscribers: Array<() => void> = [];
	for (const channel of channels) {
		unsubscribers.push(
			bus.on(channel, (data) => {
				output({ type: "custom_event", channel, data, at: Date.now() });
			}),
		);
	}
	return () => {
		for (const unsubscribe of unsubscribers) unsubscribe();
	};
}
