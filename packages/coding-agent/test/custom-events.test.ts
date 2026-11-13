import { describe, expect, it } from "vitest";
import { createEventBus } from "../src/core/event-bus.ts";
import { bridgeCustomEvents } from "../src/modes/rpc/custom-events.ts";
import type { RpcCustomEvent } from "../src/modes/rpc/rpc-types.ts";

describe("bridgeCustomEvents", () => {
	it("forwards only the exposed channels until unsubscribed", () => {
		const bus = createEventBus();
		const seen: RpcCustomEvent[] = [];
		const unsubscribe = bridgeCustomEvents(bus, ["pulse:tps"], (event) => seen.push(event));

		bus.emit("pulse:tps", { tps: 42 });
		bus.emit("other:channel", { secret: true });

		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatchObject({
			type: "custom_event",
			channel: "pulse:tps",
			data: { tps: 42 },
		});
		expect(seen[0]?.at).toBeTypeOf("number");

		unsubscribe();
		bus.emit("pulse:tps", { tps: 50 });
		expect(seen).toHaveLength(1);
	});
});
