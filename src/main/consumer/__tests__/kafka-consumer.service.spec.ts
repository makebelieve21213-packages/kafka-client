import { RpcException } from "@nestjs/microservices";
import { Test } from "@nestjs/testing";
import KafkaClientError from "src/errors/kafka-client.error";
import KafkaConsumerService from "src/main/consumer/kafka-consumer.service";

import type { TestingModule } from "@nestjs/testing";
import type { EachMessagePayload, IHeaders, Kafka, Consumer } from "kafkajs";
import type KafkaCore from "src/core/kafka.core";
import type KafkaClientService from "src/main/client/kafka-client.service";
import type {
	KafkaConsumerServiceOptions,
	KafkaMessageHandler,
} from "src/types/kafka-consumer-module.interface";

// Мокируем @makebelieve21213-packages/logger
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

// Mock KafkaCore
jest.mock("src/core/kafka.core");

describe("KafkaConsumerService", () => {
	let service: KafkaConsumerService;
	let module: TestingModule;
	let messageHandler: jest.Mocked<KafkaMessageHandler>;
	let mockKafkaClient: jest.Mocked<KafkaCore>;
	let mockKafkaClientService: jest.Mocked<KafkaClientService>;
	let mockConsumer: jest.Mocked<Consumer>;
	let mockKafka: jest.Mocked<Kafka>;

	// Mock класс для messageHandler
	class MockMessageHandler implements KafkaMessageHandler {
		handleMessage = jest.fn().mockResolvedValue({ success: true });
	}

	const mockOptions: KafkaConsumerServiceOptions = {
		topics: ["test-topic-1", "test-topic-2"],
		groupId: "test-group",
		messageHandler: MockMessageHandler,
	};

	// Helper функция для создания mock EachMessagePayload
	const createMockPayload = (
		topic: string,
		value: Buffer | null,
		headers: IHeaders = {}
	): EachMessagePayload =>
		({
			topic,
			partition: 0,
			message: {
				key: Buffer.from("test-key"),
				value,
				headers,
				offset: "0",
				timestamp: "1234567890",
			},
			heartbeat: jest.fn(),
			pause: jest.fn(),
		}) as unknown as EachMessagePayload;

	beforeEach(async () => {
		// Mock MessageHandler
		messageHandler = {
			handleMessage: jest.fn().mockResolvedValue({ success: true }),
		};

		// Mock consumer
		mockConsumer = {
			connect: jest.fn().mockResolvedValue(undefined),
			disconnect: jest.fn().mockResolvedValue(undefined),
			subscribe: jest.fn().mockResolvedValue(undefined),
			run: jest.fn().mockResolvedValue(undefined),
		} as unknown as jest.Mocked<Consumer>;

		// Mock Kafka instance
		mockKafka = {
			consumer: jest.fn().mockReturnValue(mockConsumer),
		} as unknown as jest.Mocked<Kafka>;

		// Mock KafkaClient
		mockKafkaClient = {
			connect: jest.fn().mockResolvedValue(undefined),
			disconnect: jest.fn().mockResolvedValue(undefined),
			getConnectionStatus: jest.fn().mockReturnValue(true),
			kafka: mockKafka,
			createConsumer: jest.fn().mockReturnValue(mockConsumer),
			fireAndForget: {
				send: jest.fn().mockResolvedValue(undefined),
			},
		} as unknown as jest.Mocked<KafkaCore>;

		// Mock KafkaClientService
		mockKafkaClientService = {
			getClient: jest.fn().mockReturnValue(mockKafkaClient),
			isConnected: jest.fn().mockReturnValue(true),
		} as unknown as jest.Mocked<KafkaClientService>;

		module = await Test.createTestingModule({
			providers: [
				{
					provide: KafkaConsumerService,
					useFactory: () =>
						new KafkaConsumerService(mockOptions, messageHandler, mockKafkaClientService),
				},
			],
		}).compile();

		service = module.get<KafkaConsumerService>(KafkaConsumerService);
	});

	afterEach(async () => {
		// Закрываем Kafka connection если сервис был инициализирован
		if (service) {
			await service.onModuleDestroy();
		}

		// Закрываем TestingModule
		if (module) {
			await module.close();
		}

		jest.clearAllMocks();
		jest.restoreAllMocks();
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	describe("constructor", () => {
		it("должен создать экземпляр с правильными зависимостями", () => {
			const testService = new KafkaConsumerService(
				mockOptions,
				messageHandler,
				mockKafkaClientService
			);

			expect(testService).toBeDefined();
			expect(testService).toBeInstanceOf(KafkaConsumerService);
		});

		it("должен сохранить kafkaClientService в приватном поле", async () => {
			const testService = new KafkaConsumerService(
				mockOptions,
				messageHandler,
				mockKafkaClientService
			);

			// Проверяем, что kafkaClientService используется при инициализации
			await testService.onModuleInit();

			// kafkaClientService.getClient должен быть вызван
			expect(mockKafkaClientService.getClient).toHaveBeenCalled();
		});

		it("должен принять kafkaClientService как третий параметр конструктора", async () => {
			// Создаем отдельный мок для явной проверки передачи параметра
			const customMockKafkaClientService = {
				getClient: jest.fn().mockReturnValue(mockKafkaClient),
				isConnected: jest.fn().mockReturnValue(true),
			} as unknown as jest.Mocked<KafkaClientService>;

			// Явно вызываем конструктор с кастомным моком
			const testService = new KafkaConsumerService(
				mockOptions,
				messageHandler,
				customMockKafkaClientService
			);

			// Проверяем, что параметр был передан и используется
			expect(testService).toBeDefined();

			// Вызываем метод, который использует kafkaClientService
			await testService.onModuleInit();

			// Проверяем, что наш кастомный мок был использован
			expect(customMockKafkaClientService.getClient).toHaveBeenCalled();
		});

		it("должен использовать переданный kafkaClientService при отправке ответа", async () => {
			// Создаем новый мок с отслеживанием вызовов
			const trackedMockKafkaClientService = {
				getClient: jest.fn().mockReturnValue(mockKafkaClient),
				isConnected: jest.fn().mockReturnValue(true),
			} as unknown as jest.Mocked<KafkaClientService>;

			// Явно вызываем конструктор с параметром
			const testService = new KafkaConsumerService(
				mockOptions,
				messageHandler,
				trackedMockKafkaClientService
			);

			await testService.onModuleInit();

			// Получаем обработчик сообщений
			const runCall = mockConsumer.run.mock.calls[0]?.[0] as {
				eachMessage: (payload: EachMessagePayload) => Promise<void>;
			};
			const eachMessageHandler = runCall.eachMessage;

			// Создаем payload с correlation-id и reply-to
			const headers: IHeaders = {
				"correlation-id": "test-correlation-id",
				"reply-to": "test-response-topic",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			messageHandler.handleMessage.mockResolvedValueOnce({ result: "success" });

			await eachMessageHandler(payload);

			// Проверяем, что kafkaClientService.getClient был вызван для отправки ответа
			expect(trackedMockKafkaClientService.getClient).toHaveBeenCalled();
		});
	});

	describe("onModuleInit", () => {
		it("должен получить KafkaClient из KafkaClientService", async () => {
			await service.onModuleInit();

			expect(mockKafkaClientService.getClient).toHaveBeenCalledTimes(1);
		});

		it("должен создать consumer через createConsumer метод", async () => {
			await service.onModuleInit();

			expect(mockKafkaClient.createConsumer).toHaveBeenCalledWith("test-group");
		});

		it("должен подключить consumer к Kafka", async () => {
			await service.onModuleInit();

			expect(mockConsumer.connect).toHaveBeenCalledTimes(1);
		});

		it("должен подписаться на указанные топики", async () => {
			await service.onModuleInit();

			expect(mockConsumer.subscribe).toHaveBeenCalledTimes(1);
			expect(mockConsumer.subscribe).toHaveBeenCalledWith({
				topics: ["test-topic-1", "test-topic-2"],
				fromBeginning: false,
			});
		});

		it("должен запустить обработку сообщений", async () => {
			await service.onModuleInit();

			expect(mockConsumer.run).toHaveBeenCalledTimes(1);
			expect(mockConsumer.run).toHaveBeenCalledWith({
				eachMessage: expect.any(Function),
			});
		});

		it("должен выбросить KafkaClientError если groupId пустая строка", async () => {
			const invalidOptions: KafkaConsumerServiceOptions = {
				topics: ["test-topic"],
				groupId: "",
				messageHandler: MockMessageHandler,
			};

			const invalidService = new KafkaConsumerService(
				invalidOptions,
				messageHandler,
				mockKafkaClientService
			);
			await expect(invalidService.onModuleInit()).rejects.toThrow(KafkaClientError);
			await expect(invalidService.onModuleInit()).rejects.toThrow(
				"groupId must be provided in KafkaConsumerServiceOptions"
			);
		});

		it("должен пробросить KafkaClientError при неудачном подключении", async () => {
			const connectionError = new Error("Connection failed");
			mockConsumer.connect.mockRejectedValueOnce(connectionError);

			const testService1 = new KafkaConsumerService(
				mockOptions,
				messageHandler,
				mockKafkaClientService
			);

			await expect(testService1.onModuleInit()).rejects.toThrow(KafkaClientError);

			mockConsumer.connect.mockRejectedValueOnce(connectionError);
			const testService2 = new KafkaConsumerService(
				mockOptions,
				messageHandler,
				mockKafkaClientService
			);

			await expect(testService2.onModuleInit()).rejects.toThrow("Connection failed");
		});

		it("должен преобразовать non-Error исключение в KafkaClientError при инициализации", async () => {
			const nonErrorException = "String error message";
			mockConsumer.connect.mockRejectedValueOnce(nonErrorException);

			const testService1 = new KafkaConsumerService(
				mockOptions,
				messageHandler,
				mockKafkaClientService
			);

			await expect(testService1.onModuleInit()).rejects.toThrow(KafkaClientError);

			mockConsumer.connect.mockRejectedValueOnce(nonErrorException);
			const testService2 = new KafkaConsumerService(
				mockOptions,
				messageHandler,
				mockKafkaClientService
			);

			await expect(testService2.onModuleInit()).rejects.toThrow("String error message");
		});
	});

	describe("handleMessage", () => {
		let eachMessageHandler: (payload: EachMessagePayload) => Promise<void>;

		beforeEach(async () => {
			await service.onModuleInit();

			// Получаем обработчик сообщений из mockConsumer.run
			const runCall = mockConsumer.run.mock.calls[0]?.[0] as {
				eachMessage: (payload: EachMessagePayload) => Promise<void>;
			};
			eachMessageHandler = runCall.eachMessage;
		});

		it("должен обработать валидное сообщение", async () => {
			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST", data: "test-data" }))
			);

			await eachMessageHandler(payload);

			expect(messageHandler.handleMessage).toHaveBeenCalledTimes(1);
			expect(messageHandler.handleMessage).toHaveBeenCalledWith(
				"test-topic-1",
				{
					type: "TEST",
					data: "test-data",
				},
				{}
			);
		});

		it("должен пропустить пустые сообщения", async () => {
			const payload = createMockPayload("test-topic-1", null);

			await eachMessageHandler(payload);

			expect(messageHandler.handleMessage).not.toHaveBeenCalled();
		});

		it("должен отправить ответ если есть correlation-id и reply-to", async () => {
			const headers: IHeaders = {
				"correlation-id": "test-correlation-id",
				"reply-to": "test-response-topic",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			messageHandler.handleMessage.mockResolvedValueOnce({ result: "success" });

			await eachMessageHandler(payload);

			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledTimes(1);
			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledWith(
				"test-response-topic",
				{
					success: true,
					data: { result: "success" },
					timestamp: expect.any(Number),
				},
				{
					"correlation-id": "test-correlation-id",
				}
			);
		});

		it("не должен отправлять ответ если нет correlation-id", async () => {
			const headers: IHeaders = {
				"reply-to": "test-response-topic",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			await eachMessageHandler(payload);

			expect(mockKafkaClient.fireAndForget.send).not.toHaveBeenCalled();
		});

		it("не должен отправлять ответ если нет reply-to", async () => {
			const headers: IHeaders = {
				"correlation-id": "test-correlation-id",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			await eachMessageHandler(payload);

			expect(mockKafkaClient.fireAndForget.send).not.toHaveBeenCalled();
		});

		it("должен отправить ответ с ошибкой при неудачной обработке", async () => {
			const headers: IHeaders = {
				"correlation-id": "test-correlation-id",
				"reply-to": "test-response-topic",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			const handlerError = new Error("Handler error");
			messageHandler.handleMessage.mockRejectedValueOnce(handlerError);

			await eachMessageHandler(payload);

			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledTimes(1);
			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledWith(
				"test-response-topic",
				{
					success: false,
					statusCode: 500,
					error: "Error",
					message: "Handler error",
					timestamp: expect.any(Number),
				},
				{
					"correlation-id": "test-correlation-id",
				}
			);
		});

		it("должен обработать неизвестную ошибку", async () => {
			const headers: IHeaders = {
				"correlation-id": "test-correlation-id",
				"reply-to": "test-response-topic",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			messageHandler.handleMessage.mockRejectedValueOnce("Unknown error");

			await eachMessageHandler(payload);

			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledWith(
				"test-response-topic",
				{
					success: false,
					statusCode: 500,
					error: "InternalServerError",
					message: "Unknown error occurred",
					timestamp: expect.any(Number),
				},
				{
					"correlation-id": "test-correlation-id",
				}
			);
		});

		it("должен извлечь кастомный statusCode из RPC ошибки", async () => {
			const headers: IHeaders = {
				"correlation-id": "test-correlation-id",
				"reply-to": "test-response-topic",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			// Mock RPC ошибки с кастомным statusCode через RpcException
			const rpcError = new RpcException({
				statusCode: 400,
				message: "Invalid API key",
				error: "BadRequest",
			});

			messageHandler.handleMessage.mockRejectedValueOnce(rpcError);

			await eachMessageHandler(payload);

			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledWith(
				"test-response-topic",
				{
					success: false,
					statusCode: 400, // Должен извлечь кастомный statusCode
					error: "BadRequest", // Должен извлечь error из RPC ошибки
					message: "Invalid API key", // Должен извлечь message из RPC ошибки
					timestamp: expect.any(Number),
				},
				{
					"correlation-id": "test-correlation-id",
				}
			);
		});

		it("должен обработать RpcException со строковым getError()", async () => {
			const headers: IHeaders = {
				"correlation-id": "test-correlation-id",
				"reply-to": "test-response-topic",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			// Mock RPC ошибки со строковым getError()
			const rpcError = new RpcException("Simple error message");

			messageHandler.handleMessage.mockRejectedValueOnce(rpcError);

			await eachMessageHandler(payload);

			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledWith(
				"test-response-topic",
				{
					success: false,
					statusCode: 500, // Дефолтный statusCode для строкового getError()
					error: "InternalServerError", // Дефолтный errorName
					message: "Simple error message", // Должен извлечь строку из getError()
					timestamp: expect.any(Number),
				},
				{
					"correlation-id": "test-correlation-id",
				}
			);
		});

		it("должен извлечь statusCode из обычного Error объекта с property statusCode", async () => {
			const headers: IHeaders = {
				"correlation-id": "test-correlation-id",
				"reply-to": "test-response-topic",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			// Создаем Error с дополнительным свойством statusCode
			const customError = new Error("Custom error message");
			(customError as Error & { statusCode: number }).statusCode = 422;

			messageHandler.handleMessage.mockRejectedValueOnce(customError);

			await eachMessageHandler(payload);

			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledWith(
				"test-response-topic",
				{
					success: false,
					statusCode: 422, // Должен извлечь statusCode из Error объекта
					error: "Error", // Должен использовать error.name
					message: "Custom error message", // Должен использовать error.message
					timestamp: expect.any(Number),
				},
				{
					"correlation-id": "test-correlation-id",
				}
			);
		});

		it("должен залогировать ошибку если не удалось отправить error response", async () => {
			const headers: IHeaders = {
				"correlation-id": "test-correlation-id",
				"reply-to": "test-response-topic",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			// Mock handler чтобы выбросить ошибку
			messageHandler.handleMessage.mockRejectedValueOnce(new Error("Processing failed"));

			// Mock fireAndForget.send чтобы выбросить ошибку при отправке response
			mockKafkaClient.fireAndForget.send = jest
				.fn()
				.mockRejectedValueOnce(new Error("Failed to send response"));

			// Spy на logger.error
			const loggerErrorSpy = jest.spyOn((service as never)["logger"], "error");

			await eachMessageHandler(payload);

			// Должен залогировать ошибку отправки response с stack
			expect(loggerErrorSpy).toHaveBeenCalledWith(`Failed to send error response`, expect.any(String));
		});

		it("должен залогировать ошибку (не Error) если не удалось отправить error response", async () => {
			const headers: IHeaders = {
				"correlation-id": "test-correlation-id",
				"reply-to": "test-response-topic",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			// Mock handler чтобы выбросить ошибку
			messageHandler.handleMessage.mockRejectedValueOnce(new Error("Processing failed"));

			// Mock fireAndForget.send чтобы выбросить НЕ Error объект
			mockKafkaClient.fireAndForget.send = jest.fn().mockRejectedValueOnce("String error");

			// Spy на logger.error
			const loggerErrorSpy = jest.spyOn((service as never)["logger"], "error");

			await eachMessageHandler(payload);

			// Должен залогировать ошибку отправки response со stack trace (KafkaClientError.fromError создает Error со stack)
			expect(loggerErrorSpy).toHaveBeenCalledWith(
				`Failed to send error response`,
				expect.stringContaining("KafkaClientError: String error")
			);
		});

		it("не должен пытаться отправить error response если нет correlationId", async () => {
			const headers: IHeaders = {
				// Только reply-to, но нет correlation-id
				"reply-to": "test-response-topic",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			// Mock handler чтобы выбросить ошибку
			messageHandler.handleMessage.mockRejectedValueOnce(new Error("Processing failed"));

			await eachMessageHandler(payload);

			// Не должен пытаться отправить response, так как нет correlation-id
			expect(mockKafkaClient.fireAndForget.send).not.toHaveBeenCalled();
		});

		it("не должен пытаться отправить error response если нет replyTo", async () => {
			const headers: IHeaders = {
				// Только correlation-id, но нет reply-to
				"correlation-id": "test-correlation-id",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			// Mock handler чтобы выбросить ошибку
			messageHandler.handleMessage.mockRejectedValueOnce(new Error("Processing failed"));

			await eachMessageHandler(payload);

			// Не должен пытаться отправить response, так как нет reply-to
			expect(mockKafkaClient.fireAndForget.send).not.toHaveBeenCalled();
		});
	});

	describe("getHeaderValue", () => {
		let eachMessageHandler: (payload: EachMessagePayload) => Promise<void>;

		beforeEach(async () => {
			await service.onModuleInit();

			const runCall = mockConsumer.run.mock.calls[0]?.[0] as {
				eachMessage: (payload: EachMessagePayload) => Promise<void>;
			};
			eachMessageHandler = runCall.eachMessage;
		});

		it("должен извлечь строковое значение заголовка", async () => {
			const headers: IHeaders = {
				"correlation-id": "test-id",
				"reply-to": "test-topic",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			messageHandler.handleMessage.mockResolvedValueOnce({ result: "success" });

			await eachMessageHandler(payload);

			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledWith(
				"test-topic",
				expect.any(Object),
				{
					"correlation-id": "test-id",
				}
			);
		});

		it("должен обработать Buffer значение заголовка", async () => {
			const headers: IHeaders = {
				"correlation-id": Buffer.from("test-id"),
				"reply-to": Buffer.from("test-topic"),
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			messageHandler.handleMessage.mockResolvedValueOnce({ result: "success" });

			await eachMessageHandler(payload);

			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledWith(
				"test-topic",
				expect.any(Object),
				{
					"correlation-id": "test-id",
				}
			);
		});

		it("должен обработать массив значений заголовка", async () => {
			const headers: IHeaders = {
				"correlation-id": ["test-id-1", "test-id-2"] as unknown as Buffer,
				"reply-to": ["test-topic-1", "test-topic-2"] as unknown as Buffer,
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				headers
			);

			messageHandler.handleMessage.mockResolvedValueOnce({ result: "success" });

			await eachMessageHandler(payload);

			// Должен использовать первый элемент массива
			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledWith(
				"test-topic-1",
				expect.any(Object),
				{
					"correlation-id": "test-id-1",
				}
			);
		});

		it("должен вернуть undefined для несуществующего заголовка", async () => {
			const payload = createMockPayload("test-topic-1", Buffer.from(JSON.stringify({ type: "TEST" })));

			await eachMessageHandler(payload);

			// Не должен отправить ответ, так как нет correlation-id
			expect(mockKafkaClient.fireAndForget.send).not.toHaveBeenCalled();
		});

		it("должен вернуть undefined если headers не определены", async () => {
			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST" })),
				undefined as unknown as IHeaders
			);

			await eachMessageHandler(payload);

			expect(mockKafkaClient.fireAndForget.send).not.toHaveBeenCalled();
		});

		it("должен обработать headers с Array значениями (Buffer)", async () => {
			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST", data: "test" })),
				{
					"correlation-id": [Buffer.from("correlation-123")],
					"reply-to": [Buffer.from("response-topic")],
				}
			);

			await eachMessageHandler(payload);

			expect(messageHandler.handleMessage).toHaveBeenCalledWith(
				"test-topic-1",
				{
					type: "TEST",
					data: "test",
				},
				{
					"correlation-id": "correlation-123",
					"reply-to": "response-topic",
				}
			);

			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledWith(
				"response-topic",
				{
					success: true,
					data: { success: true },
					timestamp: expect.any(Number),
				},
				{
					"correlation-id": "correlation-123",
				}
			);
		});

		it("должен обработать headers с Array значениями (string)", async () => {
			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST", data: "test" })),
				{
					"correlation-id": ["correlation-456"],
					"reply-to": ["response-topic-2"],
				}
			);

			await eachMessageHandler(payload);

			expect(messageHandler.handleMessage).toHaveBeenCalledWith(
				"test-topic-1",
				{
					type: "TEST",
					data: "test",
				},
				{
					"correlation-id": "correlation-456",
					"reply-to": "response-topic-2",
				}
			);

			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledWith(
				"response-topic-2",
				{
					success: true,
					data: { success: true },
					timestamp: expect.any(Number),
				},
				{
					"correlation-id": "correlation-456",
				}
			);
		});

		it("должен обработать headers с Array значениями (не строка, преобразование через toString)", async () => {
			// Создаем объект с методом toString для тестирования строки 100
			const numberValue = 12345;
			const objectWithToString = {
				toString: () => "converted-to-string",
			};

			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST", data: "test" })),
				{
					"correlation-id": [numberValue as unknown as Buffer],
					"reply-to": [objectWithToString as unknown as Buffer],
					"custom-header": [null as unknown as Buffer], // null -> пустая строка
				}
			);

			await eachMessageHandler(payload);

			expect(messageHandler.handleMessage).toHaveBeenCalledWith(
				"test-topic-1",
				{
					type: "TEST",
					data: "test",
				},
				{
					"correlation-id": "12345", // число преобразовано в строку
					"reply-to": "converted-to-string", // объект преобразован через toString()
					"custom-header": "", // null -> пустая строка через || ""
				}
			);
		});

		it("должен обработать headers с Array значениями (undefined -> пустая строка)", async () => {
			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST", data: "test" })),
				{
					"correlation-id": [undefined as unknown as Buffer],
					"reply-to": ["response-topic"],
				}
			);

			await eachMessageHandler(payload);

			expect(messageHandler.handleMessage).toHaveBeenCalledWith(
				"test-topic-1",
				{
					type: "TEST",
					data: "test",
				},
				{
					"correlation-id": "", // undefined -> пустая строка через || ""
					"reply-to": "response-topic",
				}
			);
		});

		it("должен обработать headers с Array значениями (undefined в getHeaderValue)", async () => {
			const payload = createMockPayload(
				"test-topic-1",
				Buffer.from(JSON.stringify({ type: "TEST", data: "test" })),
				{
					"test-header": [undefined as unknown as Buffer],
				}
			);

			await eachMessageHandler(payload);

			// Проверяем, что undefined обрабатывается корректно
			expect(messageHandler.handleMessage).toHaveBeenCalled();
		});
	});

	describe("onModuleDestroy", () => {
		it("должен отключить consumer если он инициализирован", async () => {
			await service.onModuleInit();
			await service.onModuleDestroy();

			expect(mockConsumer.disconnect).toHaveBeenCalledTimes(1);
		});

		it("не должен падать если consumer не инициализирован", async () => {
			await expect(service.onModuleDestroy()).resolves.not.toThrow();
		});
	});

	describe("Defensive checks", () => {
		it("subscribeToTopics должен выбросить ошибку если consumer не инициализирован", async () => {
			// Создаем сервис без инициализации
			const uninitializedService = new KafkaConsumerService(
				mockOptions,
				messageHandler,
				mockKafkaClientService
			);

			// Пытаемся вызвать приватный метод subscribeToTopics через инициализацию
			// но делаем так чтобы consumer connection failed
			mockConsumer.connect.mockRejectedValueOnce(new Error("Connection failed"));

			await expect(uninitializedService.onModuleInit()).rejects.toThrow("Connection failed");
		});

		it("subscribeToTopics должен выбросить явную ошибку Kafka consumer not initialized", async () => {
			const uninitializedService = new KafkaConsumerService(
				mockOptions,
				messageHandler,
				mockKafkaClientService
			);

			// Используем reflection для вызова приватного метода напрямую
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const subscribeMethod = (uninitializedService as any)["subscribeToTopics"].bind(
				uninitializedService
			);

			await expect(subscribeMethod()).rejects.toThrow("Kafka consumer not initialized");
		});

		it("getHeaderValue должен вернуть undefined если headers undefined", async () => {
			const uninitializedService = new KafkaConsumerService(
				mockOptions,
				messageHandler,
				mockKafkaClientService
			);

			// Используем reflection для вызова приватного метода напрямую
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const getHeaderValueMethod = (uninitializedService as any)["getHeaderValue"].bind(
				uninitializedService
			);

			const result = getHeaderValueMethod(undefined, "correlation-id");
			expect(result).toBeUndefined();
		});

		it("getHeaderValue должен вернуть undefined если заголовок отсутствует", async () => {
			const uninitializedService = new KafkaConsumerService(
				mockOptions,
				messageHandler,
				mockKafkaClientService
			);

			// Используем reflection для вызова приватного метода напрямую
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const getHeaderValueMethod = (uninitializedService as any)["getHeaderValue"].bind(
				uninitializedService
			);

			const result = getHeaderValueMethod({ "some-header": "value" }, "nonexistent-header");
			expect(result).toBeUndefined();
		});
	});
});
