import { LoggerService } from "@makebelieve21213-packages/logger";
import { Test } from "@nestjs/testing";
import KafkaClientError from "src/errors/kafka-client.error";
import KafkaClientService from "src/main/client/kafka-client.service";
import KafkaProducerService from "src/main/producer/kafka-producer.service";
import { KafkaTopic } from "src/types/kafka-topics";

import type { TestingModule } from "@nestjs/testing";
import type KafkaCore from "src/core/kafka.core";

// Мокируем @makebelieve21213-packages/logger
jest.mock("@makebelieve21213-packages/logger", () => ({
	LoggerService: jest.fn().mockImplementation(() => ({
		log: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
		verbose: jest.fn(),
		setContext: jest.fn(),
	})),
}));

// Mock KafkaCore
jest.mock("src/core/kafka.core");

describe("KafkaProducerService", () => {
	let service: KafkaProducerService;
	let module: TestingModule;
	let mockKafkaClient: jest.Mocked<KafkaCore>;
	let mockKafkaClientService: jest.Mocked<KafkaClientService>;
	let mockLogger: jest.Mocked<LoggerService>;

	beforeEach(async () => {
		// Mock LoggerService
		mockLogger = {
			log: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
			verbose: jest.fn(),
			setContext: jest.fn(),
		} as unknown as jest.Mocked<LoggerService>;

		// Убеждаемся, что setContext возвращает undefined (void метод)
		mockLogger.setContext.mockReturnValue(undefined);

		// Mock KafkaClient
		const mockFireAndForgetSend = jest.fn().mockResolvedValue(undefined);
		const mockRequestReplySend = jest.fn().mockResolvedValue({ success: true });

		mockKafkaClient = {
			connect: jest.fn().mockResolvedValue(undefined),
			disconnect: jest.fn().mockResolvedValue(undefined),
			getConnectionStatus: jest.fn().mockReturnValue(true),
			fireAndForget: {
				send: mockFireAndForgetSend,
			},
			requestReply: {
				send: mockRequestReplySend,
				startListening: jest.fn().mockResolvedValue(undefined),
				stopListening: jest.fn().mockResolvedValue(undefined),
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
					provide: LoggerService,
					useValue: mockLogger,
				},
				{
					provide: KafkaClientService,
					useValue: mockKafkaClientService,
				},
				{
					provide: KafkaProducerService,
					useFactory: (kafkaClientService: KafkaClientService, logger: LoggerService) =>
						new KafkaProducerService(kafkaClientService, logger),
					inject: [KafkaClientService, LoggerService],
				},
			],
		}).compile();

		service = module.get<KafkaProducerService>(KafkaProducerService);
	});

	afterEach(async () => {
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
			const testService = new KafkaProducerService(mockKafkaClientService, mockLogger);

			expect(testService).toBeDefined();
			expect(testService).toBeInstanceOf(KafkaProducerService);
			expect(mockLogger.setContext).toHaveBeenCalledWith(KafkaProducerService.name);
		});

		it("должен сохранить kafkaClientService в приватном поле и использовать его", async () => {
			const testService = new KafkaProducerService(mockKafkaClientService, mockLogger);

			// Проверяем, что kafkaClientService используется при вызове методов
			await testService.sendFireAndForget(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" });

			// kafkaClientService.getClient должен быть вызван
			expect(mockKafkaClientService.getClient).toHaveBeenCalled();
		});

		it("должен принять kafkaClientService как параметр конструктора", () => {
			// Создаем отдельный мок для явной проверки передачи параметра
			const customMockKafkaClientService = {
				getClient: jest.fn().mockReturnValue(mockKafkaClient),
				isConnected: jest.fn().mockReturnValue(true),
			} as unknown as jest.Mocked<KafkaClientService>;

			// Создаем экземпляр с кастомным моком - явно вызываем конструктор
			const testService = new KafkaProducerService(customMockKafkaClientService, mockLogger);

			// Проверяем, что параметр был передан и используется
			expect(testService).toBeDefined();

			// Вызываем метод, который использует kafkaClientService
			testService.isConnected();

			// Проверяем, что наш кастомный мок был использован
			expect(customMockKafkaClientService.isConnected).toHaveBeenCalled();
		});

		it("должен использовать переданный kafkaClientService во всех методах", async () => {
			// Создаем новый мок с отслеживанием вызовов
			const trackedMockKafkaClientService = {
				getClient: jest.fn().mockReturnValue(mockKafkaClient),
				isConnected: jest.fn().mockReturnValue(true),
			} as unknown as jest.Mocked<KafkaClientService>;

			// Явно вызываем конструктор с параметром
			const testService = new KafkaProducerService(trackedMockKafkaClientService, mockLogger);

			// Проверяем использование через isConnected
			testService.isConnected();
			expect(trackedMockKafkaClientService.isConnected).toHaveBeenCalledTimes(1);

			// Проверяем использование через sendFireAndForget
			await testService.sendFireAndForget(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" });
			expect(trackedMockKafkaClientService.getClient).toHaveBeenCalledTimes(1);

			// Проверяем использование через sendCommand
			await testService.sendCommand(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				{ command: "TEST" }
			);
			expect(trackedMockKafkaClientService.getClient).toHaveBeenCalledTimes(2);
		});
	});

	describe("sendFireAndForget", () => {
		it("должен отправить сообщение через fire-and-forget паттерн", async () => {
			const message = { type: "TEST", data: "test-data" };

			await service.sendFireAndForget(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, message);

			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledTimes(1);
			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledWith(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				message
			);
		});

		it("должен обработать сложные объекты", async () => {
			const complexMessage = {
				type: "COMPLEX",
				nested: {
					data: [1, 2, 3],
					flag: true,
				},
			};

			await service.sendFireAndForget(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, complexMessage);

			expect(mockKafkaClient.fireAndForget.send).toHaveBeenCalledWith(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				complexMessage
			);
		});

		it("должен выбросить KafkaClientError если KafkaClientService возвращает KafkaClientError", async () => {
			mockKafkaClientService.getClient = jest.fn().mockImplementation(() => {
				throw new KafkaClientError("Kafka client not initialized", "CLIENT_NOT_INITIALIZED");
			});

			const uninitializedService = new KafkaProducerService(mockKafkaClientService, mockLogger);

			await expect(
				uninitializedService.sendFireAndForget(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" })
			).rejects.toThrow(KafkaClientError);
			await expect(
				uninitializedService.sendFireAndForget(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, { type: "TEST" })
			).rejects.toThrow("Kafka client not initialized");
		});

		it("должен обернуть ошибку отправки в KafkaClientError", async () => {
			const sendError = new Error("Send failed");
			(mockKafkaClient.fireAndForget.send as jest.Mock).mockRejectedValue(sendError);

			const error = await service
				.sendFireAndForget(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, {
					type: "TEST",
				})
				.catch((e: Error) => e);

			expect(error).toBeInstanceOf(KafkaClientError);
			expect((error as KafkaClientError).message).toBe("Send failed");
		});

		it("должен обработать неизвестную ошибку", async () => {
			(mockKafkaClient.fireAndForget.send as jest.Mock).mockRejectedValue("Unknown error");

			const error = await service
				.sendFireAndForget(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, {
					type: "TEST",
				})
				.catch((e: Error) => e);

			expect(error).toBeInstanceOf(KafkaClientError);
			expect((error as KafkaClientError).message).toBe("Unknown error");
		});
	});

	describe("sendCommand", () => {
		it("должен отправить команду и получить ответ", async () => {
			const request = { command: "GET_BALANCE", userId: "123" };
			const expectedResponse = { success: true, balance: 1000 };

			expect(mockKafkaClient.requestReply).toBeDefined();
			if (!mockKafkaClient.requestReply) return;
			(mockKafkaClient.requestReply.send as jest.Mock).mockResolvedValueOnce(expectedResponse);

			const response = await service.sendCommand<typeof request, typeof expectedResponse>(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request
			);

			expect(mockKafkaClient.requestReply.send).toHaveBeenCalledTimes(1);
			expect(mockKafkaClient.requestReply.send).toHaveBeenCalledWith(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request,
				undefined,
				undefined
			);
			expect(response).toEqual(expectedResponse);
		});

		it("должен использовать кастомный timeout", async () => {
			const request = { command: "GET_BALANCE" };
			const customTimeout = 10000;

			await service.sendCommand(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request,
				customTimeout
			);

			expect(mockKafkaClient.requestReply).toBeDefined();
			if (!mockKafkaClient.requestReply) return;
			expect(mockKafkaClient.requestReply.send).toHaveBeenCalledWith(
				KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
				KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
				request,
				customTimeout,
				undefined
			);
		});

		it("должен выбросить KafkaClientError если requestReply не инициализирован", async () => {
			// Создаем новый мок KafkaClient без requestReply
			const mockClientWithoutRequestReply = {
				...mockKafkaClient,
				requestReply: undefined,
			} as unknown as jest.Mocked<KafkaCore>;

			const mockClientServiceWithoutRequestReply = {
				getClient: jest.fn().mockReturnValue(mockClientWithoutRequestReply),
				isConnected: jest.fn().mockReturnValue(true),
			} as unknown as jest.Mocked<KafkaClientService>;

			const uninitializedService = new KafkaProducerService(
				mockClientServiceWithoutRequestReply,
				mockLogger
			);

			await expect(
				uninitializedService.sendCommand(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ command: "TEST" }
				)
			).rejects.toThrow(KafkaClientError);
			await expect(
				uninitializedService.sendCommand(
					KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
					KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
					{ command: "TEST" }
				)
			).rejects.toThrow("Kafka Request-Reply not initialized");
		});

		it("должен обернуть ошибку отправки команды в KafkaClientError", async () => {
			const commandError = new Error("Command failed");
			expect(mockKafkaClient.requestReply).toBeDefined();
			if (!mockKafkaClient.requestReply) return;
			(mockKafkaClient.requestReply.send as jest.Mock).mockRejectedValue(commandError);

			const error = await service
				.sendCommand(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, KafkaTopic.DASHBOARD_BYBIT_RESPONSES, {
					command: "TEST",
				})
				.catch((e: Error) => e);

			expect(error).toBeInstanceOf(KafkaClientError);
			expect((error as KafkaClientError).message).toBe("Command failed");
		});

		it("должен обработать неизвестную ошибку в sendCommand", async () => {
			expect(mockKafkaClient.requestReply).toBeDefined();
			if (!mockKafkaClient.requestReply) return;
			(mockKafkaClient.requestReply.send as jest.Mock).mockRejectedValue("Unknown error");

			const error = await service
				.sendCommand(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, KafkaTopic.DASHBOARD_BYBIT_RESPONSES, {
					command: "TEST",
				})
				.catch((e: Error) => e);

			expect(error).toBeInstanceOf(KafkaClientError);
			expect((error as KafkaClientError).message).toBe("Unknown error");
		});
	});

	describe("isConnected", () => {
		it("должен возвращать статус подключения от KafkaClientService", () => {
			mockKafkaClientService.isConnected.mockReturnValue(true);
			expect(service.isConnected()).toBe(true);

			mockKafkaClientService.isConnected.mockReturnValue(false);
			expect(service.isConnected()).toBe(false);
		});
	});
});
