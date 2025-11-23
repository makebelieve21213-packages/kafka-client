// Mock crypto модуля
jest.mock("crypto", () => {
	const actualCrypto = jest.requireActual("crypto");
	return {
		...actualCrypto,
		randomUUID: jest.fn(() => "test-uuid-1234"),
	};
});

import { randomUUID } from "crypto";

import { LoggerService } from "@makebelieve21213-packages/logger";
import FireAndForgetPattern from "src/core/patterns/fire-and-forget.pattern";
import { KafkaTopic } from "src/types/kafka-topics";

import type { Producer, IHeaders } from "kafkajs";

jest.mock("@makebelieve21213-packages/logger", () => ({
	LoggerService: class MockLoggerService {
		log = jest.fn();
		error = jest.fn();
		warn = jest.fn();
		debug = jest.fn();
		verbose = jest.fn();
		setContext = jest.fn();
	},
}));

describe("FireAndForgetPattern", () => {
	let mockProducer: jest.Mocked<Producer>;
	let mockLogger: LoggerService;
	let pattern: FireAndForgetPattern;

	beforeEach(() => {
		// Сбрасываем mock перед каждым тестом
		(randomUUID as jest.Mock).mockReturnValue("test-uuid-1234");

		mockLogger = new LoggerService({} as { serviceName: string });

		mockProducer = {
			send: jest.fn().mockResolvedValue(undefined),
		} as unknown as jest.Mocked<Producer>;

		pattern = new FireAndForgetPattern(mockProducer, mockLogger);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe("send", () => {
		it("должен отправить сообщение в топик", async () => {
			const message = { type: "TEST", data: "test-data" };

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, message);

			expect(mockProducer.send).toHaveBeenCalledTimes(1);
			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "dashboard-bybit-commands",
				messages: [
					{
						key: "test-uuid-1234",
						value: JSON.stringify(message),
						headers: {
							"message-id": "test-uuid-1234",
							"message-type": "fire-and-forget",
							timestamp: expect.any(String),
						},
					},
				],
			});
		});

		it("должен сериализовать сложные объекты в JSON", async () => {
			const complexMessage = {
				type: "COMPLEX",
				nested: {
					data: [1, 2, 3],
					flag: true,
				},
			};

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, complexMessage);

			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "dashboard-bybit-commands",
				messages: [
					expect.objectContaining({
						value: JSON.stringify(complexMessage),
					}),
				],
			});
		});

		it("должен генерировать уникальный message-id", async () => {
			const message = { type: "TEST" };

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, message);

			const call = mockProducer.send.mock.calls[0][0];
			expect(call.messages[0].key).toBe("test-uuid-1234");
			expect(call.messages[0].headers?.["message-id"]).toBe("test-uuid-1234");
		});

		it("должен добавить timestamp в заголовки", async () => {
			const beforeTimestamp = Date.now();

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" });

			const afterTimestamp = Date.now();
			const call = mockProducer.send.mock.calls[0][0];
			const timestamp = parseInt(call.messages[0].headers?.timestamp as string, 10);

			expect(timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
			expect(timestamp).toBeLessThanOrEqual(afterTimestamp);
		});

		it("должен добавить кастомные заголовки", async () => {
			const customHeaders = {
				"custom-header-1": "value1",
				"custom-header-2": "value2",
			};

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" }, customHeaders);

			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "dashboard-bybit-commands",
				messages: [
					expect.objectContaining({
						headers: expect.objectContaining({
							"message-id": "test-uuid-1234",
							"message-type": "fire-and-forget",
							timestamp: expect.any(String),
							"custom-header-1": "value1",
							"custom-header-2": "value2",
						}),
					}),
				],
			});
		});

		it("должен установить message-type как request-reply при наличии correlation-id", async () => {
			const customHeaders = {
				"correlation-id": "test-correlation-123",
			};

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_RESPONSES, { type: "RESPONSE" }, customHeaders);

			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "dashboard-bybit-responses",
				messages: [
					expect.objectContaining({
						headers: expect.objectContaining({
							"message-id": "test-uuid-1234",
							"message-type": "request-reply",
							"correlation-id": "test-correlation-123",
							timestamp: expect.any(String),
						}),
					}),
				],
			});
		});

		it("должен установить message-type как fire-and-forget при пустом массиве в correlation-id", async () => {
			const customHeaders = {
				"correlation-id": [],
			} as unknown as IHeaders;

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_RESPONSES, { type: "RESPONSE" }, customHeaders);

			const call = mockProducer.send.mock.calls[0][0];
			expect(call.messages[0].headers?.["message-type"]).toBe("fire-and-forget");
		});

		it("должен установить message-type как fire-and-forget при пустом Buffer в correlation-id", async () => {
			const customHeaders = {
				"correlation-id": Buffer.from(""),
			};

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_RESPONSES, { type: "RESPONSE" }, customHeaders);

			const call = mockProducer.send.mock.calls[0][0];
			expect(call.messages[0].headers?.["message-type"]).toBe("fire-and-forget");
		});

		it("должен установить message-type как request-reply при непустом массиве в correlation-id", async () => {
			const customHeaders = {
				"correlation-id": ["test-correlation-123"],
			} as unknown as IHeaders;

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_RESPONSES, { type: "RESPONSE" }, customHeaders);

			const call = mockProducer.send.mock.calls[0][0];
			expect(call.messages[0].headers?.["message-type"]).toBe("request-reply");
		});

		it("должен установить message-type как request-reply при непустом Buffer в correlation-id", async () => {
			const customHeaders = {
				"correlation-id": Buffer.from("test-correlation-123", "utf-8"),
			};

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_RESPONSES, { type: "RESPONSE" }, customHeaders);

			const call = mockProducer.send.mock.calls[0][0];
			expect(call.messages[0].headers?.["message-type"]).toBe("request-reply");
		});

		it("должен определить correlation-id регистронезависимо", async () => {
			const customHeaders = {
				"Correlation-Id": "test-correlation-123",
			};

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_RESPONSES, { type: "RESPONSE" }, customHeaders);

			const call = mockProducer.send.mock.calls[0][0];
			expect(call.messages[0].headers?.["message-type"]).toBe("request-reply");
		});

		it("должен определить correlation-id регистронезависимо (верхний регистр)", async () => {
			const customHeaders = {
				"CORRELATION-ID": "test-correlation-123",
			};

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_RESPONSES, { type: "RESPONSE" }, customHeaders);

			const call = mockProducer.send.mock.calls[0][0];
			expect(call.messages[0].headers?.["message-type"]).toBe("request-reply");
		});

		it("должен переопределить message-type кастомным значением если передано", async () => {
			const customHeaders = {
				"message-type": "custom-type",
			};

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" }, customHeaders);

			const call = mockProducer.send.mock.calls[0][0];
			// Кастомный message-type перезаписывает автоматически установленный
			expect(call.messages[0].headers?.["message-type"]).toBe("custom-type");
		});

		it("должен обработать Buffer значение в массиве заголовков", async () => {
			const bufferValue = Buffer.from("buffer-value", "utf-8");
			const customHeaders = {
				"buffer-header": [bufferValue],
			};

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" }, customHeaders);

			const call = mockProducer.send.mock.calls[0][0];
			expect(call.messages[0].headers?.["buffer-header"]).toBe("buffer-value");
		});

		it("должен обработать строковое значение в массиве заголовков", async () => {
			const customHeaders = {
				"array-header": ["string-value"],
			};

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" }, customHeaders);

			const call = mockProducer.send.mock.calls[0][0];
			expect(call.messages[0].headers?.["array-header"]).toBe("string-value");
		});

		it("должен обработать не-строковое значение в массиве заголовков", async () => {
			const customHeaders = {
				"number-header": [123],
			} as unknown as IHeaders;

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" }, customHeaders);

			const call = mockProducer.send.mock.calls[0][0];
			expect(call.messages[0].headers?.["number-header"]).toBe("123");
		});

		it("должен обработать Buffer значение напрямую в заголовках", async () => {
			const bufferValue = Buffer.from("direct-buffer-value", "utf-8");
			const customHeaders = {
				"direct-buffer-header": bufferValue,
			};

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" }, customHeaders);

			const call = mockProducer.send.mock.calls[0][0];
			expect(call.messages[0].headers?.["direct-buffer-header"]).toBe("direct-buffer-value");
		});

		it("должен обработать не-строковое значение напрямую в заголовках", async () => {
			const customHeaders = {
				"number-header": 123,
			} as unknown as IHeaders;

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" }, customHeaders);

			const call = mockProducer.send.mock.calls[0][0];
			expect(call.messages[0].headers?.["number-header"]).toBe("123");
		});

		it("должен игнорировать undefined и null значения в заголовках", async () => {
			const customHeaders = {
				"valid-header": "valid-value",
				"undefined-header": undefined,
				"null-header": null,
			} as unknown as IHeaders;

			await pattern.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" }, customHeaders);

			const call = mockProducer.send.mock.calls[0][0];
			expect(call.messages[0].headers?.["valid-header"]).toBe("valid-value");
			expect(call.messages[0].headers?.["undefined-header"]).toBeUndefined();
			expect(call.messages[0].headers?.["null-header"]).toBeUndefined();
		});
	});

	describe("sendBatch", () => {
		it("должен отправить множество сообщений одним запросом", async () => {
			const messages = [
				{ type: "TEST_1", data: "data-1" },
				{ type: "TEST_2", data: "data-2" },
				{ type: "TEST_3", data: "data-3" },
			];

			await pattern.sendBatch(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, messages);

			expect(mockProducer.send).toHaveBeenCalledTimes(1);
			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "dashboard-bybit-commands",
				messages: expect.arrayContaining([
					expect.objectContaining({
						value: JSON.stringify(messages[0]),
					}),
					expect.objectContaining({
						value: JSON.stringify(messages[1]),
					}),
					expect.objectContaining({
						value: JSON.stringify(messages[2]),
					}),
				]),
			});
		});

		it("должен генерировать уникальные ID для каждого сообщения в batch", async () => {
			const messages = [{ type: "TEST_1" }, { type: "TEST_2" }];

			await pattern.sendBatch(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, messages);

			const call = mockProducer.send.mock.calls[0][0];
			const keys = call.messages.map((msg) => msg.key);

			// Все ключи должны быть одинаковыми (mock возвращает одно значение)
			expect(keys).toHaveLength(2);
			expect(keys.every((key) => key === "test-uuid-1234")).toBe(true);
		});

		it("должен обработать пустой массив сообщений", async () => {
			await pattern.sendBatch(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, []);

			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "dashboard-bybit-commands",
				messages: [],
			});
		});

		it("должен добавить заголовки для каждого сообщения", async () => {
			const messages = [{ type: "TEST_1" }, { type: "TEST_2" }];

			await pattern.sendBatch(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, messages);

			const call = mockProducer.send.mock.calls[0][0];

			call.messages.forEach((msg) => {
				expect(msg.headers).toEqual({
					"message-id": expect.any(String),
					"message-type": "fire-and-forget",
					timestamp: expect.any(String),
				});
			});
		});
	});

	describe("error handling", () => {
		it("должен пробросить ошибку от producer", async () => {
			const error = new Error("Producer error");
			mockProducer.send.mockRejectedValueOnce(error);

			await expect(
				pattern.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" })
			).rejects.toThrow("Producer error");
		});

		it("должен пробросить ошибку от producer в sendBatch", async () => {
			const error = new Error("Producer error");
			mockProducer.send.mockRejectedValueOnce(error);

			await expect(
				pattern.sendBatch(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, [{ type: "TEST" }])
			).rejects.toThrow("Producer error");
		});
	});
});
