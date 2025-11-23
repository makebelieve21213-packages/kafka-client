import { LoggerService } from "@makebelieve21213-packages/logger";
import { Kafka } from "kafkajs";
import KafkaCore from "src/core/kafka.core";
import KafkaClientError from "src/errors/kafka-client.error";
import { KafkaTopic } from "src/types/kafka-topics";

import type { KafkaCoreOptions } from "src/types/kafka-core.options.interface";

jest.mock("kafkajs");

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

describe("KafkaCore", () => {
	let mockKafka: jest.Mocked<Kafka>;
	let mockLogger: LoggerService;
	let mockProducer: {
		connect: jest.Mock;
		disconnect: jest.Mock;
		send: jest.Mock;
	};
	let mockConsumer: {
		connect: jest.Mock;
		disconnect: jest.Mock;
		subscribe: jest.Mock;
		run: jest.Mock;
	};
	let mockDlqConsumer: {
		connect: jest.Mock;
		disconnect: jest.Mock;
		subscribe: jest.Mock;
		run: jest.Mock;
	};

	beforeEach(() => {
		mockLogger = new LoggerService({} as { serviceName: string });
		mockProducer = {
			connect: jest.fn().mockResolvedValue(undefined),
			disconnect: jest.fn().mockResolvedValue(undefined),
			send: jest.fn().mockResolvedValue(undefined),
		};

		mockConsumer = {
			connect: jest.fn().mockResolvedValue(undefined),
			disconnect: jest.fn().mockResolvedValue(undefined),
			subscribe: jest.fn().mockResolvedValue(undefined),
			run: jest.fn().mockResolvedValue(undefined),
		};

		mockDlqConsumer = {
			connect: jest.fn().mockResolvedValue(undefined),
			disconnect: jest.fn().mockResolvedValue(undefined),
			subscribe: jest.fn().mockResolvedValue(undefined),
			run: jest.fn().mockResolvedValue(undefined),
		};

		let consumerCallCount = 0;
		mockKafka = {
			producer: jest.fn().mockReturnValue(mockProducer),
			consumer: jest.fn().mockImplementation(() => {
				consumerCallCount++;
				// Первый вызов - основной consumer, второй и далее - DLQ consumer
				return consumerCallCount === 1 ? mockConsumer : mockDlqConsumer;
			}),
		} as unknown as jest.Mocked<Kafka>;

		(Kafka as jest.MockedClass<typeof Kafka>).mockReturnValue(mockKafka);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe("constructor", () => {
		it("должен создать Kafka клиент с опциями", () => {
			const options: KafkaCoreOptions = {
				kafka: {
					clientId: "test-client",
					brokers: ["localhost:9093"],
				},
			};

			new KafkaCore(options, mockLogger);

			expect(Kafka).toHaveBeenCalledWith(options.kafka);
		});

		it("должен инициализировать producer и consumer", () => {
			const options: KafkaCoreOptions = {
				kafka: {
					clientId: "test-client",
					brokers: ["localhost:9093"],
				},
			};

			new KafkaCore(options, mockLogger);

			expect(mockKafka.producer).toHaveBeenCalled();
			expect(mockKafka.consumer).toHaveBeenCalledWith({
				groupId: "test-client-consumer",
			});
		});

		it("должен инициализировать DLQ consumer если передан dlq опция", () => {
			const options: KafkaCoreOptions = {
				kafka: {
					clientId: "test-client",
					brokers: ["localhost:9093"],
				},
				dlq: {
					onMessage: jest.fn(),
					groupId: "test-dlq-group",
				},
			};

			new KafkaCore(options, mockLogger);

			expect(mockKafka.consumer).toHaveBeenCalledWith({
				groupId: "test-dlq-group",
			});
		});

		it("не должен инициализировать DLQ consumer если dlq опция не передана", () => {
			const options: KafkaCoreOptions = {
				kafka: {
					clientId: "test-client",
					brokers: ["localhost:9093"],
				},
			};

			new KafkaCore(options, mockLogger);

			expect(mockKafka.consumer).toHaveBeenCalledTimes(1);
		});
	});

	describe("initRequestReply", () => {
		let client: KafkaCore;

		beforeEach(() => {
			const options: KafkaCoreOptions = {
				kafka: {
					clientId: "test-client",
					brokers: ["localhost:9093"],
				},
			};

			client = new KafkaCore(options, mockLogger);
		});

		it("должен инициализировать RequestReply паттерн", () => {
			const responseTopics = [KafkaTopic.DASHBOARD_BYBIT_RESPONSES];

			const pattern = client.initRequestReply(responseTopics);

			expect(pattern).toBeDefined();
			expect(client.requestReply).toBe(pattern);
		});

		it("должен выбросить KafkaClientError если уже инициализирован", () => {
			const responseTopics = [KafkaTopic.DASHBOARD_BYBIT_RESPONSES];

			client.initRequestReply(responseTopics);

			expect(() => client.initRequestReply(responseTopics)).toThrow(KafkaClientError);
			expect(() => client.initRequestReply(responseTopics)).toThrow(
				"RequestReply pattern already initialized"
			);
		});
	});

	describe("connect", () => {
		let client: KafkaCore;

		beforeEach(() => {
			const options: KafkaCoreOptions = {
				kafka: {
					clientId: "test-client",
					brokers: ["localhost:9093"],
				},
			};

			client = new KafkaCore(options, mockLogger);
		});

		it("должен подключить producer и consumer", async () => {
			await client.connect();

			expect(mockProducer.connect).toHaveBeenCalled();
			expect(mockConsumer.connect).toHaveBeenCalled();
		});

		it("должен подключить DLQ consumer если он есть", async () => {
			const optionsWithDlq: KafkaCoreOptions = {
				kafka: {
					clientId: "test-client",
					brokers: ["localhost:9093"],
				},
				dlq: {
					onMessage: jest.fn(),
				},
			};

			const clientWithDlq = new KafkaCore(optionsWithDlq, mockLogger);
			await clientWithDlq.connect();

			expect(mockDlqConsumer.connect).toHaveBeenCalled();
		});

		it("не должен подключаться дважды", async () => {
			await client.connect();
			await client.connect();

			expect(mockProducer.connect).toHaveBeenCalledTimes(1);
		});

		it("должен установить isConnected в true", async () => {
			expect(client.getConnectionStatus()).toBe(false);

			await client.connect();

			expect(client.getConnectionStatus()).toBe(true);
		});
	});

	describe("disconnect", () => {
		let client: KafkaCore;

		beforeEach(async () => {
			const options: KafkaCoreOptions = {
				kafka: {
					clientId: "test-client",
					brokers: ["localhost:9093"],
				},
			};

			client = new KafkaCore(options, mockLogger);
			await client.connect();
		});

		it("должен отключить producer и consumer", async () => {
			await client.disconnect();

			expect(mockProducer.disconnect).toHaveBeenCalled();
			expect(mockConsumer.disconnect).toHaveBeenCalled();
		});

		it("должен отключить DLQ consumer если он есть", async () => {
			const optionsWithDlq: KafkaCoreOptions = {
				kafka: {
					clientId: "test-client",
					brokers: ["localhost:9093"],
				},
				dlq: {
					onMessage: jest.fn(),
				},
			};

			const clientWithDlq = new KafkaCore(optionsWithDlq, mockLogger);
			await clientWithDlq.connect();
			await clientWithDlq.disconnect();

			expect(mockDlqConsumer.disconnect).toHaveBeenCalled();
		});

		it("должен остановить RequestReply если он был инициализирован", async () => {
			client.initRequestReply([KafkaTopic.DASHBOARD_BYBIT_RESPONSES]);
			expect(client.requestReply).toBeDefined();
			if (!client.requestReply) return;
			await client.requestReply.startListening();

			const stopListeningSpy = jest.spyOn(client.requestReply, "stopListening");

			await client.disconnect();

			expect(stopListeningSpy).toHaveBeenCalled();
		});

		it("не должен падать если не подключен", async () => {
			const newClient = new KafkaCore(
				{
					kafka: {
						clientId: "test-client",
						brokers: ["localhost:9093"],
					},
				},
				mockLogger
			);

			await expect(newClient.disconnect()).resolves.not.toThrow();
		});

		it("должен установить isConnected в false", async () => {
			expect(client.getConnectionStatus()).toBe(true);

			await client.disconnect();

			expect(client.getConnectionStatus()).toBe(false);
		});
	});

	describe("patterns", () => {
		let client: KafkaCore;

		beforeEach(() => {
			const options: KafkaCoreOptions = {
				kafka: {
					clientId: "test-client",
					brokers: ["localhost:9093"],
				},
			};

			client = new KafkaCore(options, mockLogger);
		});

		it("должен предоставить fireAndForget паттерн", () => {
			expect(client.fireAndForget).toBeDefined();
		});

		it("должен предоставить retryHandler", () => {
			expect(client.retryHandler).toBeDefined();
		});

		it("должен предоставить dlqHandler если передан dlq опция", () => {
			const optionsWithDlq: KafkaCoreOptions = {
				kafka: {
					clientId: "test-client",
					brokers: ["localhost:9093"],
				},
				dlq: {
					onMessage: jest.fn(),
				},
			};

			const clientWithDlq = new KafkaCore(optionsWithDlq, mockLogger);

			expect(clientWithDlq.dlqHandler).toBeDefined();
		});

		it("не должен предоставить dlqHandler если dlq опция не передана", () => {
			expect(client.dlqHandler).toBeUndefined();
		});
	});

	describe("createConsumer", () => {
		let client: KafkaCore;

		beforeEach(() => {
			const options: KafkaCoreOptions = {
				kafka: {
					clientId: "test-client",
					brokers: ["localhost:9093"],
				},
			};

			client = new KafkaCore(options, mockLogger);
			jest.clearAllMocks(); // Очищаем вызовы consumer из конструктора
		});

		it("должен создать новый consumer с указанным groupId", () => {
			const groupId = "custom-group";

			client.createConsumer(groupId);

			expect(mockKafka.consumer).toHaveBeenCalledWith({
				groupId,
			});
		});

		it("должен создать новый consumer с дополнительной конфигурацией", () => {
			const groupId = "custom-group";
			const config = {
				sessionTimeout: 10000,
				heartbeatInterval: 3000,
			};

			client.createConsumer(groupId, config);

			expect(mockKafka.consumer).toHaveBeenCalledWith({
				groupId,
				...config,
			});
		});

		it("должен вернуть consumer объект", () => {
			const groupId = "custom-group";

			const consumer = client.createConsumer(groupId);

			expect(consumer).toBeDefined();
			expect(consumer).toBe(mockDlqConsumer); // Второй вызов consumer возвращает mockDlqConsumer
		});
	});
});
