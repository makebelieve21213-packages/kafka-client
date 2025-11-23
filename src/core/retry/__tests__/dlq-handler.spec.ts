import { LoggerService } from "@makebelieve21213-packages/logger";
import DLQHandler from "src/core/retry/dlq-handler";
import { KafkaTopic } from "src/types/kafka-topics";

import type { Consumer, EachMessagePayload } from "kafkajs";
import type { DLQMessageCallback } from "src/types/dlq-handler.interface";

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

describe("DLQHandler", () => {
	let mockConsumer: jest.Mocked<Consumer>;
	let mockCallback: jest.MockedFunction<DLQMessageCallback>;
	let mockLogger: LoggerService;
	let dlqHandler: DLQHandler;
	let eachMessageHandler: ((payload: EachMessagePayload) => Promise<void>) | undefined;

	beforeEach(() => {
		mockLogger = new LoggerService({} as { serviceName: string });

		mockConsumer = {
			subscribe: jest.fn().mockResolvedValue(undefined),
			run: jest.fn().mockImplementation(({ eachMessage }) => {
				eachMessageHandler = eachMessage;
				return Promise.resolve();
			}),
			disconnect: jest.fn().mockResolvedValue(undefined),
		} as unknown as jest.Mocked<Consumer>;

		mockCallback = jest.fn().mockResolvedValue(undefined);

		dlqHandler = new DLQHandler(mockConsumer, { onMessage: mockCallback }, mockLogger);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe("start", () => {
		it("должен подписаться на DLQ топики", async () => {
			const dlqTopics = [KafkaTopic.DASHBOARD_BYBIT_DLQ];

			await dlqHandler.start(dlqTopics);

			expect(mockConsumer.subscribe).toHaveBeenCalledWith({
				topics: ["dashboard-bybit-dlq"],
				fromBeginning: false,
			});
		});

		it("должен начать слушать сообщения", async () => {
			const dlqTopics = [KafkaTopic.DASHBOARD_BYBIT_DLQ];

			await dlqHandler.start(dlqTopics);

			expect(mockConsumer.run).toHaveBeenCalledWith({
				eachMessage: expect.any(Function),
			});
		});

		it("не должен запускаться дважды", async () => {
			const dlqTopics = [KafkaTopic.DASHBOARD_BYBIT_DLQ];

			await dlqHandler.start(dlqTopics);
			await dlqHandler.start(dlqTopics);

			expect(mockConsumer.subscribe).toHaveBeenCalledTimes(1);
		});
	});

	describe("stop", () => {
		it("должен отключить consumer", async () => {
			const dlqTopics = [KafkaTopic.DASHBOARD_BYBIT_DLQ];

			await dlqHandler.start(dlqTopics);
			await dlqHandler.stop();

			expect(mockConsumer.disconnect).toHaveBeenCalled();
		});

		it("не должен падать если не запущен", async () => {
			await expect(dlqHandler.stop()).resolves.not.toThrow();
		});
	});

	describe("handleDLQMessage", () => {
		beforeEach(async () => {
			await dlqHandler.start([KafkaTopic.DASHBOARD_BYBIT_DLQ]);
		});

		it("должен вызвать callback с корректными данными", async () => {
			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: Buffer.from("test-key"),
					value: Buffer.from("test-value"),
					headers: {
						"original-topic": Buffer.from("dashboard.bybit.commands"),
						error: Buffer.from("Test error"),
						"error-stack": Buffer.from("Error stack"),
						"failed-at": Buffer.from("1234567890"),
						"total-retries": Buffer.from("3"),
					},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler(payload);

			expect(mockCallback).toHaveBeenCalledWith({
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: Buffer.from("test-key"),
					value: Buffer.from("test-value"),
					headers: payload.message.headers,
					offset: "100",
				},
				originalTopic: "dashboard.bybit.commands",
				error: "Test error",
				errorStack: "Error stack",
				failedAt: 1234567890,
				totalRetries: 3,
			});
		});

		it("должен обрабатывать заголовки как строки", async () => {
			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: null,
					value: null,
					headers: {
						"original-topic": "dashboard.bybit.commands",
						error: "Test error",
						"error-stack": "Error stack",
						"failed-at": "1234567890",
						"total-retries": "3",
					},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler(payload);

			expect(mockCallback).toHaveBeenCalledWith({
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: expect.objectContaining({
					key: null,
					value: null,
				}),
				originalTopic: "dashboard.bybit.commands",
				error: "Test error",
				errorStack: "Error stack",
				failedAt: 1234567890,
				totalRetries: 3,
			});
		});

		it("должен использовать дефолтные значения для отсутствующих заголовков", async () => {
			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: null,
					value: null,
					headers: {},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler(payload);

			expect(mockCallback).toHaveBeenCalledWith({
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: expect.any(Object),
				originalTopic: "unknown",
				error: "Unknown error",
				errorStack: "",
				failedAt: 0,
				totalRetries: 0,
			});
		});

		it("не должен прерывать обработку при ошибке в callback", async () => {
			mockCallback.mockRejectedValueOnce(new Error("Callback error"));

			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: null,
					value: null,
					headers: {
						"original-topic": Buffer.from("test-topic"),
						error: Buffer.from("Test error"),
					},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await expect(eachMessageHandler(payload)).resolves.not.toThrow();
		});

		it("должен обрабатывать невалидные числа в заголовках", async () => {
			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: null,
					value: null,
					headers: {
						"failed-at": "invalid",
						"total-retries": "invalid",
					},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler(payload);

			expect(mockCallback).toHaveBeenCalledWith(
				expect.objectContaining({
					failedAt: NaN,
					totalRetries: NaN,
				})
			);
		});

		it("должен обработать массив заголовков с undefined элементом", async () => {
			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: null,
					value: null,
					headers: {
						"original-topic": [undefined, "dashboard.bybit.commands"] as unknown as Buffer,
						error: Buffer.from("Test error"),
					},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler(payload);

			expect(mockCallback).toHaveBeenCalledWith(
				expect.objectContaining({
					originalTopic: "unknown", // undefined превращается в "unknown" через дефолт
				})
			);
		});

		it("должен обработать заголовок со значением Buffer", async () => {
			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: null,
					value: null,
					headers: {
						"original-topic": Buffer.from("dashboard.bybit.commands"),
						error: Buffer.from("Test error"),
					},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler(payload);

			expect(mockCallback).toHaveBeenCalledWith(
				expect.objectContaining({
					originalTopic: "dashboard.bybit.commands",
				})
			);
		});

		it("должен пропустить undefined значения в заголовках при simplifyHeaders", async () => {
			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: null,
					value: null,
					headers: {
						"original-topic": Buffer.from("dashboard.bybit.commands"),
						error: undefined as unknown as Buffer, // undefined значение
						"error-stack": Buffer.from("stack"),
					},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler(payload);

			expect(mockCallback).toHaveBeenCalledWith(
				expect.objectContaining({
					originalTopic: "dashboard.bybit.commands",
					error: "Unknown error", // undefined превращается в "Unknown error" через дефолт
					errorStack: "stack",
				})
			);
		});

		it("должен обработать массив заголовков с пустым первым элементом", async () => {
			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: null,
					value: null,
					headers: {
						"original-topic": [] as unknown as Buffer, // пустой массив
						error: Buffer.from("Test error"),
					},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler(payload);

			expect(mockCallback).toHaveBeenCalledWith(
				expect.objectContaining({
					originalTopic: "unknown", // пустой массив возвращает undefined, превращается в "unknown"
				})
			);
		});

		it("должен правильно обработать simplifyHeaders с массивом с непустым firstValue", async () => {
			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: null,
					value: null,
					headers: {
						"original-topic": [
							Buffer.from("dashboard.bybit.commands"),
							Buffer.from("other"),
						] as unknown as Buffer,
						error: Buffer.from("Test error"),
					},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler(payload);

			expect(mockCallback).toHaveBeenCalledWith(
				expect.objectContaining({
					originalTopic: "dashboard.bybit.commands",
					message: expect.objectContaining({
						headers: expect.objectContaining({
							"original-topic": Buffer.from("dashboard.bybit.commands"), // должен взять первый элемент массива
						}),
					}),
				})
			);
		});

		it("должен обработать non-Error исключение при обработке DLQ сообщения", async () => {
			const nonErrorException = "String error message";
			mockCallback.mockRejectedValueOnce(nonErrorException);

			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: null,
					value: Buffer.from("test value"),
					headers: {
						"original-topic": Buffer.from("dashboard.bybit.commands"),
						error: Buffer.from("Test error"),
					},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			// Не должно выбросить исключение, даже если callback бросил non-Error
			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await expect(eachMessageHandler(payload)).resolves.toBeUndefined();

			expect(mockCallback).toHaveBeenCalled();
		});

		it("должен обработать массив заголовков с объектом, имеющим метод toString", async () => {
			const customObject = {
				toString: () => "custom-value",
			};

			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: null,
					value: null,
					headers: {
						"original-topic": [customObject] as unknown as Buffer,
						error: Buffer.from("Test error"),
					},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler(payload);

			expect(mockCallback).toHaveBeenCalledWith(
				expect.objectContaining({
					originalTopic: "custom-value",
				})
			);
		});

		it("должен обработать массив заголовков с null первым элементом", async () => {
			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: null,
					value: null,
					headers: {
						"original-topic": [null] as unknown as Buffer,
						error: Buffer.from("Test error"),
					},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler(payload);

			expect(mockCallback).toHaveBeenCalledWith(
				expect.objectContaining({
					originalTopic: "unknown", // null превращается в undefined, затем в "unknown" через дефолт
				})
			);
		});

		it("должен обработать массив заголовков с undefined первым элементом", async () => {
			const payload: EachMessagePayload = {
				topic: "dashboard.bybit.dlq",
				partition: 0,
				message: {
					key: null,
					value: null,
					headers: {
						"original-topic": [undefined] as unknown as Buffer,
						error: Buffer.from("Test error"),
					},
					offset: "100",
					timestamp: "1234567890",
					attributes: 0,
				},
				heartbeat: jest.fn(),
				pause: jest.fn(),
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler(payload);

			expect(mockCallback).toHaveBeenCalledWith(
				expect.objectContaining({
					originalTopic: "unknown", // undefined превращается в "unknown" через дефолт
				})
			);
		});
	});
});
