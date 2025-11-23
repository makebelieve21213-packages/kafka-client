import { LoggerService } from "@makebelieve21213-packages/logger";
import { Test } from "@nestjs/testing";
import KafkaCore from "src/core/kafka.core";
import KafkaClientError from "src/errors/kafka-client.error";
import KafkaClientService from "src/main/client/kafka-client.service";

import type { TestingModule } from "@nestjs/testing";
import type { KafkaClientModuleOptions } from "src/types/module-options.interface";

// Mock KafkaCore
jest.mock("src/core/kafka.core");

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

describe("KafkaClientService", () => {
	let service: KafkaClientService;
	let module: TestingModule;
	let mockKafkaClient: jest.Mocked<KafkaCore>;
	let mockLogger: LoggerService;

	const mockOptions: KafkaClientModuleOptions = {
		brokers: ["localhost:9093", "localhost:9093"],
		clientId: "test-client",
		responseTopics: ["test-response-topic"],
		defaultTimeout: 5000,
	};

	beforeEach(async () => {
		mockLogger = new LoggerService({} as { serviceName: string });
		// Mock KafkaClient
		const mockRequestReplyStartListening = jest.fn().mockResolvedValue(undefined);

		mockKafkaClient = {
			connect: jest.fn().mockResolvedValue(undefined),
			disconnect: jest.fn().mockResolvedValue(undefined),
			getConnectionStatus: jest.fn().mockReturnValue(true),
			initRequestReply: jest.fn().mockReturnValue({
				startListening: mockRequestReplyStartListening,
			}),
			requestReply: {
				startListening: mockRequestReplyStartListening,
			},
		} as unknown as jest.Mocked<KafkaCore>;

		(KafkaCore as jest.MockedClass<typeof KafkaCore>).mockImplementation(() => mockKafkaClient);

		module = await Test.createTestingModule({
			providers: [
				{
					provide: LoggerService,
					useValue: mockLogger,
				},
				{
					provide: KafkaClientService,
					useFactory: (logger: LoggerService) => new KafkaClientService(mockOptions, logger),
					inject: [LoggerService],
				},
			],
		}).compile();

		service = module.get<KafkaClientService>(KafkaClientService);
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
	});

	describe("onModuleInit", () => {
		it("должен инициализировать Kafka Client с правильной конфигурацией", async () => {
			await service.onModuleInit();

			expect(KafkaCore).toHaveBeenCalledWith(
				{
					kafka: {
						clientId: "test-client",
						brokers: ["localhost:9093", "localhost:9093"],
						connectionTimeout: 10000,
						requestTimeout: 30000,
						retry: {
							retries: 8,
							initialRetryTime: 300,
							maxRetryTime: 30000,
						},
						enforceRequestTimeout: false,
						logLevel: 2,
					},
					requestReply: {
						defaultTimeout: 5000,
						groupId: "test-client-request-reply",
					},
				},
				mockLogger
			);
		});

		it("должен подключиться к Kafka", async () => {
			await service.onModuleInit();

			expect(mockKafkaClient.connect).toHaveBeenCalledTimes(1);
		});

		it("должен инициализировать Request-Reply паттерн если указаны response topics", async () => {
			await service.onModuleInit();

			expect(mockKafkaClient.initRequestReply).toHaveBeenCalledWith(["test-response-topic"]);
		});

		it("должен запустить listening для Request-Reply", async () => {
			await service.onModuleInit();

			expect(mockKafkaClient.requestReply?.startListening).toHaveBeenCalledTimes(1);
		});

		it("должен использовать defaultTimeout по умолчанию 30000 если не указан", async () => {
			const optionsWithoutTimeout: KafkaClientModuleOptions = {
				brokers: ["localhost:9093", "localhost:9093"],
				clientId: "test-client",
				responseTopics: ["test-response-topic"],
			};

			const serviceWithDefaults = new KafkaClientService(optionsWithoutTimeout, mockLogger);

			await serviceWithDefaults.onModuleInit();

			expect(KafkaCore).toHaveBeenCalledWith(
				{
					kafka: {
						clientId: "test-client",
						brokers: ["localhost:9093", "localhost:9093"],
						connectionTimeout: 10000,
						requestTimeout: 30000,
						retry: {
							retries: 8,
							initialRetryTime: 300,
							maxRetryTime: 30000,
						},
						enforceRequestTimeout: false,
						logLevel: 2,
					},
					requestReply: {
						defaultTimeout: 30000,
						groupId: "test-client-request-reply",
					},
				},
				mockLogger
			);
		});

		it("не должен инициализировать Request-Reply если нет response topics", async () => {
			const optionsWithoutResponse: KafkaClientModuleOptions = {
				brokers: ["localhost:9093"],
				clientId: "test-client",
			};

			const serviceWithoutResponse = new KafkaClientService(optionsWithoutResponse, mockLogger);

			await serviceWithoutResponse.onModuleInit();

			expect(mockKafkaClient.initRequestReply).not.toHaveBeenCalled();
		});

		it("не должен инициализировать Request-Reply если пустой массив response topics", async () => {
			const optionsWithEmptyResponse: KafkaClientModuleOptions = {
				brokers: ["localhost:9093"],
				clientId: "test-client",
				responseTopics: [],
			};

			const serviceWithEmptyResponse = new KafkaClientService(optionsWithEmptyResponse, mockLogger);

			await serviceWithEmptyResponse.onModuleInit();

			expect(mockKafkaClient.initRequestReply).not.toHaveBeenCalled();
		});

		it("должен выбросить KafkaClientError если brokers пустой массив", async () => {
			const invalidOptions: KafkaClientModuleOptions = {
				brokers: [],
				clientId: "test-client",
				responseTopics: ["test-response-topic"],
			};

			const invalidService = new KafkaClientService(invalidOptions, mockLogger);
			await expect(invalidService.onModuleInit()).rejects.toThrow(KafkaClientError);
			await expect(invalidService.onModuleInit()).rejects.toThrow(
				"brokers and clientId must be provided in KafkaClientModuleOptions"
			);
		});

		it("должен выбросить KafkaClientError если clientId пустая строка", async () => {
			const invalidOptions: KafkaClientModuleOptions = {
				brokers: ["localhost:9093"],
				clientId: "",
				responseTopics: ["test-response-topic"],
			};

			const invalidService = new KafkaClientService(invalidOptions, mockLogger);
			await expect(invalidService.onModuleInit()).rejects.toThrow(KafkaClientError);
			await expect(invalidService.onModuleInit()).rejects.toThrow(
				"brokers and clientId must be provided in KafkaClientModuleOptions"
			);
		});

		it("должен пробросить KafkaClientError при неудачном подключении", async () => {
			const connectionError = new Error("Connection failed");
			mockKafkaClient.connect.mockRejectedValueOnce(connectionError);

			const errorService = new KafkaClientService(mockOptions, mockLogger);
			await expect(errorService.onModuleInit()).rejects.toThrow(KafkaClientError);
		});

		it("должен пробросить правильное сообщение об ошибке при неудачном подключении", async () => {
			const connectionError = new Error("Connection failed");
			mockKafkaClient.connect.mockRejectedValueOnce(connectionError);

			const errorService = new KafkaClientService(mockOptions, mockLogger);
			await expect(errorService.onModuleInit()).rejects.toThrow("Connection failed");
		});

		it("должен преобразовать non-Error исключение в KafkaClientError при инициализации", async () => {
			const nonErrorException = "String error message";
			mockKafkaClient.connect.mockRejectedValueOnce(nonErrorException);

			const errorService = new KafkaClientService(mockOptions, mockLogger);
			await expect(errorService.onModuleInit()).rejects.toThrow(KafkaClientError);
		});

		it("должен преобразовать non-Error исключение и пробросить правильное сообщение", async () => {
			const nonErrorException = "String error message";
			mockKafkaClient.connect.mockRejectedValueOnce(nonErrorException);

			const errorService = new KafkaClientService(mockOptions, mockLogger);
			await expect(errorService.onModuleInit()).rejects.toThrow("String error message");
		});

		it("должен выбросить KafkaClientError если Request-Reply не инициализировался", async () => {
			// Моделируем ситуацию когда initRequestReply возвращает паттерн, но requestReply остается undefined
			const brokenMockClient = {
				...mockKafkaClient,
				requestReply: undefined,
			} as unknown as jest.Mocked<KafkaCore>;

			(KafkaCore as jest.MockedClass<typeof KafkaCore>).mockImplementationOnce(() => brokenMockClient);

			const brokenService = new KafkaClientService(mockOptions, mockLogger);
			await expect(brokenService.onModuleInit()).rejects.toThrow(KafkaClientError);
		});

		it("должен выбросить правильное сообщение если Request-Reply не инициализировался", async () => {
			// Моделируем ситуацию когда initRequestReply возвращает паттерн, но requestReply остается undefined
			const brokenMockClient = {
				...mockKafkaClient,
				requestReply: undefined,
			} as unknown as jest.Mocked<KafkaCore>;

			(KafkaCore as jest.MockedClass<typeof KafkaCore>).mockImplementationOnce(() => brokenMockClient);

			const brokenService = new KafkaClientService(mockOptions, mockLogger);
			await expect(brokenService.onModuleInit()).rejects.toThrow(
				"Failed to initialize Request-Reply pattern"
			);
		});
	});

	describe("onModuleDestroy", () => {
		it("должен отключиться от Kafka если клиент инициализирован", async () => {
			await service.onModuleInit();
			await service.onModuleDestroy();

			expect(mockKafkaClient.disconnect).toHaveBeenCalledTimes(1);
		});

		it("не должен падать если клиент не инициализирован", async () => {
			await expect(service.onModuleDestroy()).resolves.not.toThrow();
		});
	});

	describe("getClient", () => {
		it("должен вернуть KafkaClient если инициализирован", async () => {
			await service.onModuleInit();

			const client = service.getClient();

			expect(client).toBe(mockKafkaClient);
		});

		it("должен выбросить KafkaClientError если клиент не инициализирован", () => {
			expect(() => service.getClient()).toThrow(KafkaClientError);
			expect(() => service.getClient()).toThrow("Kafka client not initialized");
		});
	});

	describe("isConnected", () => {
		it("должен возвращать статус подключения от KafkaClient", async () => {
			await service.onModuleInit();

			mockKafkaClient.getConnectionStatus.mockReturnValue(true);
			expect(service.isConnected()).toBe(true);

			mockKafkaClient.getConnectionStatus.mockReturnValue(false);
			expect(service.isConnected()).toBe(false);
		});

		it("должен возвращать false если клиент не инициализирован", () => {
			expect(service.isConnected()).toBe(false);
		});
	});
});
