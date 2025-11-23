import { LoggerService } from "@makebelieve21213-packages/logger";
import KafkaClientModule from "src/main/client/kafka-client.module";
import KafkaClientService from "src/main/client/kafka-client.service";
import {
	type KafkaClientModuleOptions,
	type KafkaClientModuleAsyncOptions,
} from "src/types/module-options.interface";
import { KAFKA_CLIENT_OPTIONS } from "src/utils/injection-keys";

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

describe("KafkaClientModule", () => {
	let mockOptions: KafkaClientModuleOptions;

	beforeEach(() => {
		mockOptions = {
			brokers: ["localhost:9093"],
			clientId: "test-client",
			responseTopics: ["dashboard.response"],
			defaultTimeout: 5000,
		};
	});

	describe("forRoot", () => {
		it("должен создать DynamicModule с правильной конфигурацией", () => {
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => mockOptions,
			};
			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			expect(dynamicModule).toBeDefined();
			expect(dynamicModule.module).toBe(KafkaClientModule);
			expect(dynamicModule.providers).toBeDefined();
			expect(dynamicModule.exports).toBeDefined();
		});

		it("должен зарегистрировать все провайдеры", () => {
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => mockOptions,
			};
			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			expect(dynamicModule.providers).toHaveLength(2);

			// Проверяем KAFKA_CLIENT_OPTIONS
			const optionsProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KAFKA_CLIENT_OPTIONS
			);
			expect(optionsProvider).toBeDefined();

			// Проверяем KafkaClientService
			const serviceProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KafkaClientService
			);
			expect(serviceProvider).toBeDefined();
		});

		it("должен экспортировать KafkaClientService", () => {
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => mockOptions,
			};
			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			expect(dynamicModule.exports).toContain(KafkaClientService);
		});

		it("должен использовать useFactory для инициализации сервиса", () => {
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => mockOptions,
			};
			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			const serviceProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KafkaClientService
			);

			expect(serviceProvider).toBeDefined();

			if (typeof serviceProvider === "object" && "useFactory" in serviceProvider) {
				expect(serviceProvider.useFactory).toBeDefined();
				expect(typeof serviceProvider.useFactory).toBe("function");
			}
		});

		it("должен передать правильные опции в провайдер", () => {
			const customOptions: KafkaClientModuleOptions = {
				brokers: ["localhost:9093"],
				clientId: "custom-client",
				responseTopics: ["custom.response"],
				defaultTimeout: 10000,
			};

			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => customOptions,
			};
			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			const optionsProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KAFKA_CLIENT_OPTIONS
			);

			expect(optionsProvider).toBeDefined();

			if (typeof optionsProvider === "object" && "useFactory" in optionsProvider) {
				expect(optionsProvider.useFactory).toBeDefined();
				expect(typeof optionsProvider.useFactory).toBe("function");
				const result = optionsProvider.useFactory();
				expect(result).toEqual(customOptions);
			}
		});

		it("должен передать inject зависимости в useFactory", () => {
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => mockOptions,
			};
			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			const serviceProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KafkaClientService
			);

			if (typeof serviceProvider === "object" && "inject" in serviceProvider) {
				expect(serviceProvider.inject).toEqual([KAFKA_CLIENT_OPTIONS, LoggerService]);
			}
		});

		it("должен обрабатывать опции без responseTopics", () => {
			const optionsWithoutResponse: KafkaClientModuleOptions = {
				brokers: ["localhost:9093"],
				clientId: "test-client",
			};

			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => optionsWithoutResponse,
			};
			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			const optionsProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KAFKA_CLIENT_OPTIONS
			);

			expect(optionsProvider).toBeDefined();

			if (typeof optionsProvider === "object" && "useFactory" in optionsProvider) {
				expect(optionsProvider.useFactory).toBeDefined();
				expect(typeof optionsProvider.useFactory).toBe("function");
				const result = optionsProvider.useFactory();
				expect(result).toEqual(optionsWithoutResponse);
			}
		});

		it("должен создать сервис в useFactory без вызова onModuleInit", () => {
			// Мокаем onModuleInit чтобы убедиться, что он НЕ вызывается в useFactory
			const onModuleInitSpy = jest
				.spyOn(KafkaClientService.prototype, "onModuleInit")
				.mockResolvedValue(undefined);

			const mockLogger = new LoggerService({} as { serviceName: string });

			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => mockOptions,
			};
			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			const serviceProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KafkaClientService
			);

			expect(serviceProvider).toBeDefined();

			if (
				typeof serviceProvider === "object" &&
				"useFactory" in serviceProvider &&
				typeof serviceProvider.useFactory === "function"
			) {
				// Вызываем useFactory
				const createdService = serviceProvider.useFactory(mockOptions, mockLogger);

				// Проверяем, что создан экземпляр сервиса
				expect(createdService).toBeDefined();
				expect(createdService).toBeInstanceOf(KafkaClientService);

				// Проверяем, что onModuleInit НЕ был вызван в useFactory
				// NestJS вызовет его автоматически благодаря OnModuleInit lifecycle hook
				expect(onModuleInitSpy).not.toHaveBeenCalled();
			}

			// Восстанавливаем мок
			onModuleInitSpy.mockRestore();
		});
	});

	describe("forRootAsync", () => {
		it("должен создать DynamicModule с правильной конфигурацией через useFactory", () => {
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => mockOptions,
			};

			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			expect(dynamicModule).toBeDefined();
			expect(dynamicModule.module).toBe(KafkaClientModule);
			expect(dynamicModule.providers).toBeDefined();
			expect(dynamicModule.exports).toBeDefined();
		});

		it("должен использовать useFactory для создания опций", () => {
			const factory = jest.fn().mockReturnValue(mockOptions);
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: factory,
			};

			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			const optionsProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KAFKA_CLIENT_OPTIONS
			);

			expect(optionsProvider).toBeDefined();

			if (typeof optionsProvider === "object" && "useFactory" in optionsProvider) {
				expect(optionsProvider.useFactory).toBe(factory);
			}
		});

		it("должен поддерживать inject зависимости", () => {
			const MockConfigService = class {};
			const factory = jest.fn();
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: factory,
				inject: [MockConfigService],
			};

			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			const optionsProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KAFKA_CLIENT_OPTIONS
			);

			if (typeof optionsProvider === "object" && "inject" in optionsProvider) {
				expect(optionsProvider.inject).toEqual([MockConfigService]);
			}
		});

		it("должен использовать пустой массив inject если не указан", () => {
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => mockOptions,
			};

			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			const optionsProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KAFKA_CLIENT_OPTIONS
			);

			if (typeof optionsProvider === "object" && "inject" in optionsProvider) {
				expect(optionsProvider.inject).toEqual([]);
			}
		});

		it("должен поддерживать imports для модулей зависимостей", () => {
			const MockModule = class {};
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => mockOptions,
				imports: [MockModule],
			};

			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			expect(dynamicModule.imports).toEqual([MockModule]);
		});

		it("должен использовать пустой массив imports если не указан", () => {
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => mockOptions,
			};

			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			expect(dynamicModule.imports).toEqual([]);
		});

		it("должен зарегистрировать все провайдеры", () => {
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => mockOptions,
			};

			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			expect(dynamicModule.providers).toHaveLength(2);

			// Проверяем KAFKA_CLIENT_OPTIONS
			const optionsProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KAFKA_CLIENT_OPTIONS
			);
			expect(optionsProvider).toBeDefined();

			// Проверяем KafkaClientService
			const serviceProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KafkaClientService
			);
			expect(serviceProvider).toBeDefined();
		});

		it("должен экспортировать KafkaClientService", () => {
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => mockOptions,
			};

			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			expect(dynamicModule.exports).toContain(KafkaClientService);
		});

		it("должен поддерживать асинхронную фабрику", async () => {
			const factory = jest.fn().mockResolvedValue(mockOptions);
			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: factory,
			};

			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			const optionsProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KAFKA_CLIENT_OPTIONS
			);

			if (
				typeof optionsProvider === "object" &&
				"useFactory" in optionsProvider &&
				typeof optionsProvider.useFactory === "function"
			) {
				const result = await optionsProvider.useFactory();
				expect(result).toEqual(mockOptions);
			}
		});

		it("должен создать сервис в useFactory без вызова onModuleInit", () => {
			// Мокаем onModuleInit чтобы убедиться, что он НЕ вызывается в useFactory
			const onModuleInitSpy = jest
				.spyOn(KafkaClientService.prototype, "onModuleInit")
				.mockResolvedValue(undefined);

			const mockLogger = new LoggerService({} as { serviceName: string });

			const asyncOptions: KafkaClientModuleAsyncOptions = {
				useFactory: () => mockOptions,
			};

			const dynamicModule = KafkaClientModule.forRootAsync(asyncOptions);

			const serviceProvider = dynamicModule.providers?.find(
				(p) => typeof p === "object" && "provide" in p && p.provide === KafkaClientService
			);

			expect(serviceProvider).toBeDefined();

			if (
				typeof serviceProvider === "object" &&
				"useFactory" in serviceProvider &&
				typeof serviceProvider.useFactory === "function"
			) {
				// Вызываем useFactory
				const createdService = serviceProvider.useFactory(mockOptions, mockLogger);

				// Проверяем, что создан экземпляр сервиса
				expect(createdService).toBeDefined();
				expect(createdService).toBeInstanceOf(KafkaClientService);

				// Проверяем, что onModuleInit НЕ был вызван в useFactory
				// NestJS вызовет его автоматически благодаря OnModuleInit lifecycle hook
				expect(onModuleInitSpy).not.toHaveBeenCalled();
			}

			// Восстанавливаем мок
			onModuleInitSpy.mockRestore();
		});
	});
});
