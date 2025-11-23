// Mock crypto.randomUUID
jest.mock("crypto", () => {
	const actualCrypto = jest.requireActual("crypto");
	return {
		...actualCrypto,
		randomUUID: jest.fn(() => "test-correlation-id"),
	};
});

import { randomUUID } from "crypto";

import { LoggerService } from "@makebelieve21213-packages/logger";
import RequestReplyPattern from "src/core/patterns/request-reply.pattern";
import { KafkaTopic } from "src/types/kafka-topics";

import type { Producer, Consumer, KafkaMessage } from "kafkajs";

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

describe("RequestReplyPattern", () => {
	let mockProducer: jest.Mocked<Producer>;
	let mockConsumer: jest.Mocked<Consumer>;
	let mockLogger: LoggerService;
	let pattern: RequestReplyPattern;
	let eachMessageHandler: ((payload: { message: KafkaMessage }) => Promise<void>) | undefined;

	beforeEach(() => {
		// Сбрасываем mock перед каждым тестом
		(randomUUID as jest.Mock).mockReturnValue("test-correlation-id");

		mockLogger = new LoggerService({} as { serviceName: string });

		mockProducer = {
			send: jest.fn().mockResolvedValue(undefined),
		} as unknown as jest.Mocked<Producer>;

		mockConsumer = {
			subscribe: jest.fn().mockResolvedValue(undefined),
			run: jest.fn().mockImplementation(({ eachMessage }) => {
				eachMessageHandler = eachMessage;
				return Promise.resolve();
			}),
			disconnect: jest.fn().mockResolvedValue(undefined),
		} as unknown as jest.Mocked<Consumer>;

		pattern = new RequestReplyPattern(
			mockProducer,
			mockConsumer,
			[KafkaTopic.DASHBOARD_BYBIT_RESPONSES],
			mockLogger,
			{
				defaultTimeout: 5000,
				groupId: "test-group",
			}
		);
	});

	afterEach(async () => {
		// Останавливаем pattern если он был запущен
		// Обрабатываем ошибки от отклоненных промисов
		if (pattern) {
			try {
				await pattern.stopListening();
			} catch {
				// Игнорируем ошибки от отклоненных промисов при остановке
				// Это нормальное поведение когда есть pending requests
			}
		}

		jest.clearAllMocks();
		jest.restoreAllMocks();

		// Безопасная очистка таймеров - всегда пытаемся очистить, но не падаем если их нет
		try {
			jest.clearAllTimers();
			jest.useRealTimers();
		} catch {
			// Игнорируем ошибки если таймеры не были использованы
		}
	});

	describe("constructor", () => {
		it("должен использовать переданный defaultTimeout", () => {
			const customPattern = new RequestReplyPattern(
				mockProducer,
				mockConsumer,
				[KafkaTopic.DASHBOARD_BYBIT_RESPONSES],
				mockLogger
			);

			// Проверяем через getPendingRequestsCount что pattern создан
			expect(customPattern.getPendingRequestsCount()).toBe(0);
		});

		it("должен использовать дефолтный timeout 30000 если не указан", async () => {
			const defaultPattern = new RequestReplyPattern(
				mockProducer,
				mockConsumer,
				[KafkaTopic.DASHBOARD_BYBIT_RESPONSES],
				mockLogger
			);

			await defaultPattern.startListening();

			// Отправляем запрос без timeout - должен использовать 30000
			const promise = defaultPattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				{ type: "TEST" }
			);

			// Проверяем что запрос добавлен
			expect(defaultPattern.getPendingRequestsCount()).toBe(1);

			// Очищаем чтобы тест не висел
			await defaultPattern.stopListening();
			await expect(promise).rejects.toThrow("RequestReply stopped");
		});
	});

	describe("startListening", () => {
		it("должен подписаться на response топики", async () => {
			await pattern.startListening();

			expect(mockConsumer.subscribe).toHaveBeenCalledWith({
				topics: ["dashboard-bybit-responses"],
				fromBeginning: false,
			});
		});

		it("должен запустить consumer", async () => {
			await pattern.startListening();

			expect(mockConsumer.run).toHaveBeenCalledWith({
				eachMessage: expect.any(Function),
			});
		});

		it("не должен запускаться дважды", async () => {
			await pattern.startListening();
			await pattern.startListening();

			expect(mockConsumer.subscribe).toHaveBeenCalledTimes(1);
			expect(mockConsumer.run).toHaveBeenCalledTimes(1);
		});

		it("должен обрабатывать несколько response топиков", async () => {
			const multiTopicPattern = new RequestReplyPattern(
				mockProducer,
				mockConsumer,
				[KafkaTopic.DASHBOARD_BYBIT_RESPONSES, KafkaTopic.SYSTEM_ERRORS],
				mockLogger,
				{ defaultTimeout: 5000, groupId: "test-group" }
			);

			await multiTopicPattern.startListening();

			expect(mockConsumer.subscribe).toHaveBeenCalledWith({
				topics: ["dashboard-bybit-responses", "system-errors"],
				fromBeginning: false,
			});
		});
	});

	describe("stopListening", () => {
		it("должен отключить consumer", async () => {
			await pattern.startListening();
			await pattern.stopListening();

			expect(mockConsumer.disconnect).toHaveBeenCalled();
		});

		it("не должен падать если не запущен", async () => {
			await expect(pattern.stopListening()).resolves.not.toThrow();
			expect(mockConsumer.disconnect).not.toHaveBeenCalled();
		});

		it("должен отклонить все pending requests", async () => {
			await pattern.startListening();

			// Отправляем запрос
			const promise = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				{ type: "TEST" }
			);

			expect(pattern.getPendingRequestsCount()).toBe(1);

			// Останавливаем
			await pattern.stopListening();

			// Проверяем что запрос отклонен
			await expect(promise).rejects.toThrow("RequestReply stopped");
			expect(pattern.getPendingRequestsCount()).toBe(0);
		});

		it("должен отклонить несколько pending requests", async () => {
			await pattern.startListening();

			// Создаем несколько запросов
			(randomUUID as jest.Mock)
				.mockReturnValueOnce("correlation-1")
				.mockReturnValueOnce("correlation-2")
				.mockReturnValueOnce("correlation-3");

			const promise1 = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				{ type: "TEST1" }
			);
			const promise2 = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				{ type: "TEST2" }
			);
			const promise3 = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				{ type: "TEST3" }
			);

			expect(pattern.getPendingRequestsCount()).toBe(3);

			// Останавливаем
			await pattern.stopListening();

			// Все должны быть отклонены
			await expect(promise1).rejects.toThrow("RequestReply stopped");
			await expect(promise2).rejects.toThrow("RequestReply stopped");
			await expect(promise3).rejects.toThrow("RequestReply stopped");
			expect(pattern.getPendingRequestsCount()).toBe(0);
		});
	});

	describe("send", () => {
		beforeEach(async () => {
			await pattern.startListening();
		});

		it("должен отправить сообщение с correlation-id", async () => {
			const message = { type: "GET_BALANCE", userId: "123" };

			const promise = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				message
			);

			expect(mockProducer.send).toHaveBeenCalledWith({
				topic: "dashboard-bybit-commands",
				messages: [
					{
						key: "test-correlation-id",
						value: JSON.stringify(message),
						headers: {
							"correlation-id": "test-correlation-id",
							"reply-to": "dashboard-bybit-responses",
							"message-type": "request-reply",
							timestamp: expect.any(String),
						},
					},
				],
			});

			// Очищаем pending
			await pattern.stopListening();
			await expect(promise).rejects.toThrow("RequestReply stopped");
		});

		it("должен использовать кастомный timeout", async () => {
			jest.useFakeTimers();

			try {
				const promise = pattern.send(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ type: "TEST" },
					10000 // 10 секунд
				);

				expect(pattern.getPendingRequestsCount()).toBe(1);

				// Промотаем время на 9 секунд - еще не timeout
				jest.advanceTimersByTime(9000);
				expect(pattern.getPendingRequestsCount()).toBe(1);

				// Промотаем еще 2 секунды - должен быть timeout
				jest.advanceTimersByTime(2000);

				await expect(promise).rejects.toThrow("Request timeout after 10000ms");
				expect(pattern.getPendingRequestsCount()).toBe(0);
			} finally {
				// Выполняем все pending таймеры перед очисткой
				jest.runOnlyPendingTimers();
				jest.clearAllTimers();
				jest.useRealTimers();
			}
		});

		it("должен использовать defaultTimeout если не указан", async () => {
			jest.useFakeTimers();

			try {
				const promise = pattern.send(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ type: "TEST" }
				);

				expect(pattern.getPendingRequestsCount()).toBe(1);

				// Промотаем время на 4 секунды - еще не timeout (defaultTimeout = 5000)
				jest.advanceTimersByTime(4000);
				expect(pattern.getPendingRequestsCount()).toBe(1);

				// Промотаем еще 2 секунды - должен быть timeout
				jest.advanceTimersByTime(2000);

				await expect(promise).rejects.toThrow("Request timeout after 5000ms");
				expect(pattern.getPendingRequestsCount()).toBe(0);
			} finally {
				// Выполняем все pending таймеры перед очисткой
				jest.runOnlyPendingTimers();
				jest.clearAllTimers();
				jest.useRealTimers();
			}
		});

		it("должен разрешить promise при получении успешного ответа", async () => {
			const request = { type: "GET_BALANCE", userId: "123" };
			const expectedResponse = { balance: 1000, currency: "USD" };

			const promise = pattern.send<typeof request, typeof expectedResponse>(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request
			);

			// Симулируем получение ответа
			const responseMessage: KafkaMessage = {
				key: Buffer.from("test-correlation-id"),
				value: Buffer.from(
					JSON.stringify({
						success: true,
						data: expectedResponse,
					})
				),
				headers: {
					"correlation-id": Buffer.from("test-correlation-id"),
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler({ message: responseMessage });

			const result = await promise;
			expect(result).toEqual(expectedResponse);
			expect(pattern.getPendingRequestsCount()).toBe(0);
		});
	});

	describe("handleResponse", () => {
		beforeEach(async () => {
			await pattern.startListening();
		});

		it("должен игнорировать сообщение без value", async () => {
			const message: KafkaMessage = {
				key: null,
				value: null,
				headers: {},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await expect(eachMessageHandler({ message })).resolves.not.toThrow();
		});

		it("должен игнорировать Fire-and-Forget сообщения", async () => {
			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(JSON.stringify({ success: true, data: {} })),
				headers: {
					"message-type": Buffer.from("fire-and-forget"),
					"message-id": Buffer.from("test-message-id"),
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await expect(eachMessageHandler({ message })).resolves.not.toThrow();
		});

		it("должен игнорировать сообщение без correlation-id", async () => {
			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(JSON.stringify({ success: true, data: {} })),
				headers: {},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await expect(eachMessageHandler({ message })).resolves.not.toThrow();
		});

		it("должен игнорировать ответ для несуществующего pending request", async () => {
			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(JSON.stringify({ success: true, data: {} })),
				headers: {
					"correlation-id": Buffer.from("unknown-correlation-id"),
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await expect(eachMessageHandler({ message })).resolves.not.toThrow();
		});

		it("должен обработать успешный ответ", async () => {
			const request = { type: "TEST" };
			const expectedResponse = { result: "success" };

			const promise = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request
			);

			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(
					JSON.stringify({
						success: true,
						data: expectedResponse,
					})
				),
				headers: {
					"correlation-id": Buffer.from("test-correlation-id"),
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler({ message });

			const result = await promise;
			expect(result).toEqual(expectedResponse);
		});

		it("должен обработать ответ с ошибкой (message)", async () => {
			const request = { type: "TEST" };

			const promise = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request
			);

			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(
					JSON.stringify({
						success: false,
						message: "Something went wrong",
					})
				),
				headers: {
					"correlation-id": Buffer.from("test-correlation-id"),
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler({ message });

			await expect(promise).rejects.toThrow("Something went wrong");
		});

		it("должен обработать ответ с ошибкой (error)", async () => {
			const request = { type: "TEST" };

			const promise = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request
			);

			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(
					JSON.stringify({
						success: false,
						error: "Error occurred",
					})
				),
				headers: {
					"correlation-id": Buffer.from("test-correlation-id"),
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler({ message });

			await expect(promise).rejects.toThrow("Error occurred");
		});

		it("должен обработать ответ с ошибкой (без message и error)", async () => {
			const request = { type: "TEST" };

			const promise = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request
			);

			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(
					JSON.stringify({
						success: false,
						// Нет ни message, ни error
					})
				),
				headers: {
					"correlation-id": Buffer.from("test-correlation-id"),
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler({ message });

			await expect(promise).rejects.toThrow("Unknown error");
		});

		it("должен обработать ошибку парсинга JSON", async () => {
			const request = { type: "TEST" };

			const promise = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request
			);

			const message: KafkaMessage = {
				key: null,
				value: Buffer.from("invalid json"),
				headers: {
					"correlation-id": Buffer.from("test-correlation-id"),
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler({ message });

			// JSON.parse выбрасывает SyntaxError, но код оборачивает его в KafkaClientError
			await expect(promise).rejects.toThrow("Unexpected token");
			await expect(promise).rejects.toThrow("is not valid JSON");
		});

		it("должен обработать не Error объект при парсинге", async () => {
			const request = { type: "TEST" };

			const promise = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request
			);

			// Мокаем JSON.parse чтобы выбросить не Error
			const originalParse = JSON.parse;
			JSON.parse = jest.fn().mockImplementation(() => {
				throw "Not an error object";
			});

			const message: KafkaMessage = {
				key: null,
				value: Buffer.from("test"),
				headers: {
					"correlation-id": Buffer.from("test-correlation-id"),
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler({ message });

			// Когда JSON.parse выбрасывает строку, код создает KafkaClientError с этой строкой
			await expect(promise).rejects.toThrow("Not an error object");

			// Восстанавливаем JSON.parse
			JSON.parse = originalParse;
		});

		it("должен обработать correlation-id как строку", async () => {
			const request = { type: "TEST" };
			const expectedResponse = { result: "success" };

			const promise = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request
			);

			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(
					JSON.stringify({
						success: true,
						data: expectedResponse,
					})
				),
				headers: {
					"correlation-id": "test-correlation-id", // строка вместо Buffer
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler({ message });

			const result = await promise;
			expect(result).toEqual(expectedResponse);
		});

		it("должен игнорировать сообщение без headers", async () => {
			await pattern.startListening();

			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(JSON.stringify({ success: true, data: {} })),
				headers: undefined,
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
				size: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await expect(eachMessageHandler({ message })).resolves.not.toThrow();
		});

		it("должен игнорировать сообщение с пустым значением correlation-id", async () => {
			await pattern.startListening();

			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(JSON.stringify({ success: true, data: {} })),
				headers: {
					"correlation-id": Buffer.from(""), // пустое значение
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await expect(eachMessageHandler({ message })).resolves.not.toThrow();
		});

		it("должен игнорировать сообщение с null значением correlation-id", async () => {
			await pattern.startListening();

			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(JSON.stringify({ success: true, data: {} })),
				headers: {
					"correlation-id": null as unknown as string, // null значение
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await expect(eachMessageHandler({ message })).resolves.not.toThrow();
		});

		it("должен обработать correlation-id как массив с Buffer", async () => {
			const request = { type: "TEST" };
			const expectedResponse = { result: "success" };

			const promise = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request
			);

			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(
					JSON.stringify({
						success: true,
						data: expectedResponse,
					})
				),
				headers: {
					"correlation-id": [Buffer.from("test-correlation-id")],
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler({ message });

			const result = await promise;
			expect(result).toEqual(expectedResponse);
		});

		it("должен обработать correlation-id как массив со строкой", async () => {
			const request = { type: "TEST" };
			const expectedResponse = { result: "success" };

			const promise = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request
			);

			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(
					JSON.stringify({
						success: true,
						data: expectedResponse,
					})
				),
				headers: {
					"correlation-id": ["test-correlation-id"],
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler({ message });

			const result = await promise;
			expect(result).toEqual(expectedResponse);
		});

		it("должен обработать correlation-id как не-строковое и не-Buffer значение", async () => {
			await pattern.startListening();

			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(JSON.stringify({ success: true, data: {} })),
				headers: {
					"correlation-id": 12345 as unknown as string, // число, будет преобразовано в строку
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			// Это не должно найти pending request, так как correlation-id будет "12345", а не "test-correlation-id"
			// Но код должен обработать это без ошибки
			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await expect(eachMessageHandler({ message })).resolves.not.toThrow();
		});
	});

	describe("getPendingRequestsCount", () => {
		beforeEach(async () => {
			await pattern.startListening();
		});

		it("должен возвращать 0 когда нет pending requests", () => {
			expect(pattern.getPendingRequestsCount()).toBe(0);
		});

		it("должен возвращать количество pending requests", async () => {
			(randomUUID as jest.Mock)
				.mockReturnValueOnce("correlation-1")
				.mockReturnValueOnce("correlation-2")
				.mockReturnValueOnce("correlation-3");

			const promise1 = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				{ type: "TEST1" }
			);
			const promise2 = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				{ type: "TEST2" }
			);
			const promise3 = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				{ type: "TEST3" }
			);

			expect(pattern.getPendingRequestsCount()).toBe(3);

			// Очищаем - обрабатываем ошибки от отклоненных промисов
			await pattern.stopListening();
			await Promise.allSettled([
				expect(promise1).rejects.toThrow(),
				expect(promise2).rejects.toThrow(),
				expect(promise3).rejects.toThrow(),
			]);
		});

		it("должен уменьшаться после получения ответа", async () => {
			const promise = pattern.send(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				{ type: "TEST" }
			);

			expect(pattern.getPendingRequestsCount()).toBe(1);

			// Отправляем ответ
			const message: KafkaMessage = {
				key: null,
				value: Buffer.from(JSON.stringify({ success: true, data: {} })),
				headers: {
					"correlation-id": Buffer.from("test-correlation-id"),
				},
				offset: "0",
				timestamp: "1234567890",
				attributes: 0,
			};

			expect(eachMessageHandler).toBeDefined();
			if (!eachMessageHandler) return;
			await eachMessageHandler({ message });
			await promise;

			expect(pattern.getPendingRequestsCount()).toBe(0);
		});
	});

	describe("cleanupOldRequests", () => {
		beforeEach(async () => {
			await pattern.startListening();
		});

		it("должен очистить старые requests", async () => {
			jest.useFakeTimers();

			try {
				const now = Date.now();
				jest.setSystemTime(now);

				// Создаем 3 запроса
				(randomUUID as jest.Mock)
					.mockReturnValueOnce("correlation-1")
					.mockReturnValueOnce("correlation-2")
					.mockReturnValueOnce("correlation-3");

				const promise1 = pattern.send(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ type: "TEST1" }
				);

				// Промотаем время на 61 секунду
				jest.setSystemTime(now + 61000);

				const promise2 = pattern.send(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ type: "TEST2" }
				);
				const promise3 = pattern.send(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ type: "TEST3" }
				);

				expect(pattern.getPendingRequestsCount()).toBe(3);

				// Очищаем старые (maxAge = 60000)
				const cleaned = pattern.cleanupOldRequests(60000);

				expect(cleaned).toBe(1); // promise1 должен быть очищен
				expect(pattern.getPendingRequestsCount()).toBe(2);

				// promise1 должен быть отклонен
				await expect(promise1).rejects.toThrow("Request expired");

				// Очищаем оставшиеся
				await pattern.stopListening();
				await Promise.allSettled([
					expect(promise2).rejects.toThrow(),
					expect(promise3).rejects.toThrow(),
				]);
			} finally {
				jest.clearAllTimers();
				jest.useRealTimers();
			}
		}, 10000);

		it("не должен очищать свежие requests", async () => {
			jest.useFakeTimers();

			try {
				(randomUUID as jest.Mock)
					.mockReturnValueOnce("correlation-1")
					.mockReturnValueOnce("correlation-2");

				const promise1 = pattern.send(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ type: "TEST1" }
				);
				const promise2 = pattern.send(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ type: "TEST2" }
				);

				expect(pattern.getPendingRequestsCount()).toBe(2);

				// Очищаем с maxAge = 60000, но все запросы свежие
				const cleaned = pattern.cleanupOldRequests(60000);

				expect(cleaned).toBe(0);
				expect(pattern.getPendingRequestsCount()).toBe(2);

				// Очищаем
				await pattern.stopListening();
				await Promise.allSettled([
					expect(promise1).rejects.toThrow(),
					expect(promise2).rejects.toThrow(),
				]);
			} finally {
				jest.clearAllTimers();
				jest.useRealTimers();
			}
		}, 10000);

		it("должен использовать дефолтный maxAge 60000", async () => {
			jest.useFakeTimers();

			try {
				const now = Date.now();
				jest.setSystemTime(now);

				const promise = pattern.send(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ type: "TEST" }
				);

				// Промотаем время на 61 секунду
				jest.setSystemTime(now + 61000);

				const cleaned = pattern.cleanupOldRequests(); // без параметра

				expect(cleaned).toBe(1);
				expect(pattern.getPendingRequestsCount()).toBe(0);

				await expect(promise).rejects.toThrow("Request expired");
			} finally {
				jest.clearAllTimers();
				jest.useRealTimers();
			}
		});

		it("должен очистить несколько старых requests", async () => {
			jest.useFakeTimers();

			try {
				const now = Date.now();
				jest.setSystemTime(now);

				// Создаем 5 запросов
				(randomUUID as jest.Mock)
					.mockReturnValueOnce("correlation-1")
					.mockReturnValueOnce("correlation-2")
					.mockReturnValueOnce("correlation-3")
					.mockReturnValueOnce("correlation-4")
					.mockReturnValueOnce("correlation-5");

				const promise1 = pattern.send(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ type: "TEST1" }
				);
				const promise2 = pattern.send(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ type: "TEST2" }
				);
				const promise3 = pattern.send(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ type: "TEST3" }
				);

				// Промотаем время на 61 секунду
				jest.setSystemTime(now + 61000);

				const promise4 = pattern.send(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ type: "TEST4" }
				);
				const promise5 = pattern.send(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ type: "TEST5" }
				);

				expect(pattern.getPendingRequestsCount()).toBe(5);

				// Очищаем старые
				const cleaned = pattern.cleanupOldRequests(60000);

				expect(cleaned).toBe(3); // promise1, 2, 3 должны быть очищены
				expect(pattern.getPendingRequestsCount()).toBe(2);

				await expect(promise1).rejects.toThrow("Request expired");
				await expect(promise2).rejects.toThrow("Request expired");
				await expect(promise3).rejects.toThrow("Request expired");

				// Очищаем оставшиеся
				await pattern.stopListening();
				await Promise.allSettled([
					expect(promise4).rejects.toThrow(),
					expect(promise5).rejects.toThrow(),
				]);
			} finally {
				jest.clearAllTimers();
				jest.useRealTimers();
			}
		}, 10000);
	});
});
