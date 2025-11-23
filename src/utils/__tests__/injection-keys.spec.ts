import {
	KAFKA_CLIENT_OPTIONS,
	KAFKA_CONSUMER_OPTIONS,
	KAFKA_PRODUCER_OPTIONS,
} from "src/utils/injection-keys";

describe("Injection Keys", () => {
	it("должен экспортировать KAFKA_CLIENT_OPTIONS как Symbol", () => {
		expect(typeof KAFKA_CLIENT_OPTIONS).toBe("symbol");
	});

	it("должен экспортировать KAFKA_CONSUMER_OPTIONS как Symbol", () => {
		expect(typeof KAFKA_CONSUMER_OPTIONS).toBe("symbol");
	});

	it("должен экспортировать KAFKA_PRODUCER_OPTIONS как Symbol", () => {
		expect(typeof KAFKA_PRODUCER_OPTIONS).toBe("symbol");
	});

	it("должен иметь уникальные значения", () => {
		expect(KAFKA_CLIENT_OPTIONS).not.toBe(KAFKA_CONSUMER_OPTIONS);
		expect(KAFKA_CONSUMER_OPTIONS).not.toBe(KAFKA_PRODUCER_OPTIONS);
		expect(KAFKA_CLIENT_OPTIONS).not.toBe(KAFKA_PRODUCER_OPTIONS);
	});
});
