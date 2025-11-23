import KafkaProducerModule from "src/main/producer/kafka-producer.module";
import KafkaProducerService from "src/main/producer/kafka-producer.service";

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

describe("KafkaProducerModule", () => {
	describe("forRootAsync", () => {
		it("должен создать DynamicModule с правильной конфигурацией", () => {
			const dynamicModule = KafkaProducerModule.forRootAsync();

			expect(dynamicModule).toBeDefined();
			expect(dynamicModule.module).toBe(KafkaProducerModule);
			expect(dynamicModule.providers).toBeDefined();
			expect(dynamicModule.exports).toBeDefined();
		});

		it("должен зарегистрировать KafkaProducerService как провайдер", () => {
			const dynamicModule = KafkaProducerModule.forRootAsync();

			const serviceProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KafkaProducerService
			);
			expect(serviceProvider).toBeDefined();
		});

		it("должен экспортировать KafkaProducerService", () => {
			const dynamicModule = KafkaProducerModule.forRootAsync();

			expect(dynamicModule.exports).toContain(KafkaProducerService);
		});

		it("должен поддерживать импорты дополнительных модулей", () => {
			const mockImport = { module: class TestModule {} };
			const dynamicModule = KafkaProducerModule.forRootAsync({
				imports: [mockImport],
			});

			expect(dynamicModule.imports).toEqual([mockImport]);
		});

		it("должен использовать пустой массив для imports если не указан", () => {
			const dynamicModule = KafkaProducerModule.forRootAsync();

			expect(dynamicModule.imports).toEqual([]);
		});

		it("должен вызвать useFactory для создания сервиса", () => {
			const mockKafkaClientService = {
				getClient: jest.fn(),
				isConnected: jest.fn(),
			};

			const mockLoggerService = {
				log: jest.fn(),
				error: jest.fn(),
				warn: jest.fn(),
				debug: jest.fn(),
				verbose: jest.fn(),
				setContext: jest.fn(),
			};

			const dynamicModule = KafkaProducerModule.forRootAsync();

			const serviceProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KafkaProducerService
			);

			expect(serviceProvider).toBeDefined();

			if (
				typeof serviceProvider === "object" &&
				"useFactory" in serviceProvider &&
				typeof serviceProvider.useFactory === "function"
			) {
				const createdService = serviceProvider.useFactory(mockKafkaClientService, mockLoggerService);

				expect(createdService).toBeDefined();
				expect(createdService).toBeInstanceOf(KafkaProducerService);
			}
		});
	});
});
