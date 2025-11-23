import { LoggerService } from "@makebelieve21213-packages/logger";
import RetryHandler from "src/core/retry/retry-handler";

import type { Producer } from "kafkajs";
import type { InternalKafkaMessage } from "src/types/kafka-message";

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

describe("RetryHandler", () => {
	let mockProducer: jest.Mocked<Producer>;
	let mockLogger: LoggerService;
	let retryHandler: RetryHandler;

	beforeEach(() => {
		mockLogger = new LoggerService({} as { serviceName: string });

		mockProducer = {
			send: jest.fn().mockResolvedValue(undefined),
		} as unknown as jest.Mocked<Producer>;

		retryHandler = new RetryHandler(mockProducer, mockLogger, {
			maxRetries: 3,
			baseDelay: 100,
			useExponentialBackoff: true,
		});
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe("handleError", () => {
		it("должен отправить сообщение обратно в топик при первой ошибке", async () => {
			const message: InternalKafkaMessage = {
				key: "test-key",
				value: Buffer.from("test-value"),
				headers: {},
			};

			const error = new Error("Test error");

			await retryHandler.handleError("test-topic", message, error);

			expect(mockProducer.send).toHaveBeenCalledTimes(1);
			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "test-topic",
				messages: [
					{
						key: "test-key",
						value: Buffer.from("test-value"),
						headers: {
							"retry-count": "1",
							"retry-timestamp": expect.any(String),
							"last-error": "Test error",
						},
					},
				],
			});
		});

		it("должен отправить сообщение в DLQ после превышения maxRetries", async () => {
			const message: InternalKafkaMessage = {
				key: "test-key",
				value: Buffer.from("test-value"),
				headers: {
					"retry-count": "3",
				},
			};

			const error = new Error("Test error");

			await retryHandler.handleError("test-topic", message, error);

			expect(mockProducer.send).toHaveBeenCalledTimes(1);
			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "test-topic.dlq",
				messages: [
					{
						key: "test-key",
						value: Buffer.from("test-value"),
						headers: {
							"retry-count": "3",
							"original-topic": "test-topic",
							error: "Test error",
							"error-stack": expect.any(String),
							"failed-at": expect.any(String),
							"total-retries": "3",
						},
					},
				],
			});
		});

		it("должен увеличивать retry-count при каждой попытке", async () => {
			const message: InternalKafkaMessage = {
				key: "test-key",
				value: Buffer.from("test-value"),
				headers: {
					"retry-count": "1",
				},
			};

			const error = new Error("Test error");

			await retryHandler.handleError("test-topic", message, error);

			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "test-topic",
				messages: [
					expect.objectContaining({
						headers: expect.objectContaining({
							"retry-count": "2",
						}),
					}),
				],
			});
		});

		it("должен обрабатывать ошибку без stack trace", async () => {
			const message: InternalKafkaMessage = {
				key: "test-key",
				value: Buffer.from("test-value"),
				headers: {
					"retry-count": "3",
				},
			};

			const error = new Error("Test error");
			error.stack = undefined;

			await retryHandler.handleError("test-topic", message, error);

			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "test-topic.dlq",
				messages: [
					expect.objectContaining({
						headers: expect.objectContaining({
							"error-stack": "",
						}),
					}),
				],
			});
		});
	});

	describe("exponential backoff", () => {
		it("должен использовать exponential backoff для задержки", async () => {
			jest.spyOn(global, "setTimeout");

			const message: InternalKafkaMessage = {
				key: "test-key",
				value: Buffer.from("test-value"),
				headers: {
					"retry-count": "1",
				},
			};

			await retryHandler.handleError("test-topic", message, new Error("Test error"));

			// exponential backoff: baseDelay * 2^(retryCount - 1)
			// retryCount будет 2, поэтому задержка = 100 * 2^(2-1) = 200ms
			expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 200);

			jest.restoreAllMocks();
		});

		it("должен использовать константную задержку если useExponentialBackoff = false", async () => {
			const handlerWithoutBackoff = new RetryHandler(mockProducer, mockLogger, {
				maxRetries: 3,
				baseDelay: 100,
				useExponentialBackoff: false,
			});

			jest.spyOn(global, "setTimeout");

			const message: InternalKafkaMessage = {
				key: "test-key",
				value: Buffer.from("test-value"),
				headers: {
					"retry-count": "1",
				},
			};

			await handlerWithoutBackoff.handleError("test-topic", message, new Error("Test error"));

			// Константная задержка = baseDelay = 100ms
			expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 100);

			jest.restoreAllMocks();
		});
	});

	describe("retry count parsing", () => {
		it("должен корректно парсить retry-count как строку", async () => {
			const message: InternalKafkaMessage = {
				key: "test-key",
				value: Buffer.from("test-value"),
				headers: {
					"retry-count": "2",
				},
			};

			await retryHandler.handleError("test-topic", message, new Error("Test error"));

			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "test-topic",
				messages: [
					expect.objectContaining({
						headers: expect.objectContaining({
							"retry-count": "3",
						}),
					}),
				],
			});
		});

		it("должен корректно парсить retry-count как Buffer", async () => {
			const message: InternalKafkaMessage = {
				key: "test-key",
				value: Buffer.from("test-value"),
				headers: {
					"retry-count": Buffer.from("2"),
				},
			};

			await retryHandler.handleError("test-topic", message, new Error("Test error"));

			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "test-topic",
				messages: [
					expect.objectContaining({
						headers: expect.objectContaining({
							"retry-count": "3",
						}),
					}),
				],
			});
		});

		it("должен использовать 0 если retry-count отсутствует", async () => {
			const message: InternalKafkaMessage = {
				key: "test-key",
				value: Buffer.from("test-value"),
				headers: {},
			};

			await retryHandler.handleError("test-topic", message, new Error("Test error"));

			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "test-topic",
				messages: [
					expect.objectContaining({
						headers: expect.objectContaining({
							"retry-count": "1",
						}),
					}),
				],
			});
		});

		it("должен использовать 0 если retry-count невалидный", async () => {
			const message: InternalKafkaMessage = {
				key: "test-key",
				value: Buffer.from("test-value"),
				headers: {
					"retry-count": "invalid",
				},
			};

			await retryHandler.handleError("test-topic", message, new Error("Test error"));

			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "test-topic",
				messages: [
					expect.objectContaining({
						headers: expect.objectContaining({
							"retry-count": "1",
						}),
					}),
				],
			});
		});
	});

	describe("default options", () => {
		it("должен использовать дефолтные опции", async () => {
			const handlerWithDefaults = new RetryHandler(mockProducer, mockLogger);

			const message: InternalKafkaMessage = {
				key: "test-key",
				value: Buffer.from("test-value"),
				headers: {
					"retry-count": "3", // maxRetries по умолчанию = 3
				},
			};

			await handlerWithDefaults.handleError("test-topic", message, new Error("Test error"));

			// Должно отправить в DLQ
			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "test-topic.dlq",
				messages: [expect.any(Object)],
			});
		});
	});

	describe("delay handling", () => {
		it("должен пропустить sleep когда calculateDelay возвращает 0", async () => {
			const handlerWithZeroDelay = new RetryHandler(mockProducer, mockLogger, {
				maxRetries: 3,
				baseDelay: 0,
				useExponentialBackoff: false,
			});

			// Mock calculateDelay чтобы гарантировать что вернется 0
			const calculateDelaySpy = jest
				.spyOn(handlerWithZeroDelay as never, "calculateDelay" as never)
				.mockReturnValue(0 as never);

			// Spy на private метод sleep
			const sleepSpy = jest.spyOn(handlerWithZeroDelay as never, "sleep" as never);

			const message: InternalKafkaMessage = {
				key: "test-key",
				value: Buffer.from("test-value"),
				headers: {},
			};

			await handlerWithZeroDelay.handleError("test-topic", message, new Error("Test error"));

			// Проверяем что calculateDelay был вызван
			expect(calculateDelaySpy).toHaveBeenCalled();

			// sleep НЕ должен вызываться когда delay === 0
			expect(sleepSpy).not.toHaveBeenCalled();

			// Проверяем, что сообщение отправлено в retry топик
			expect(mockProducer.send).toHaveBeenCalledTimes(1);
			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "test-topic",
				messages: [
					expect.objectContaining({
						headers: expect.objectContaining({
							"retry-count": "1",
						}),
					}),
				],
			});

			sleepSpy.mockRestore();
			calculateDelaySpy.mockRestore();
		});

		it("должен вызвать sleep когда calculateDelay возвращает > 0", async () => {
			const handlerWithDelay = new RetryHandler(mockProducer, mockLogger, {
				maxRetries: 3,
				baseDelay: 100,
				useExponentialBackoff: false,
			});

			// Spy на private метод sleep и замокать его для ускорения теста
			const sleepSpy = jest
				.spyOn(handlerWithDelay as never, "sleep" as never)
				.mockResolvedValue(undefined as never);

			const message: InternalKafkaMessage = {
				key: "test-key",
				value: Buffer.from("test-value"),
				headers: {},
			};

			await handlerWithDelay.handleError("test-topic", message, new Error("Test error"));

			// sleep ДОЛЖЕН вызваться когда delay > 0
			expect(sleepSpy).toHaveBeenCalledWith(100);

			sleepSpy.mockRestore();
		});
	});
});
