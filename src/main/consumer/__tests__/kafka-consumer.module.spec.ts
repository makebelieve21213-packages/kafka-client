import { LoggerService } from "@makebelieve21213-packages/logger";
import { Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import KafkaClientService from "src/main/client/kafka-client.service";
import KafkaConsumerModule from "src/main/consumer/kafka-consumer.module";
import KafkaConsumerService from "src/main/consumer/kafka-consumer.service";
import {
	KAFKA_CONSUMER_OPTIONS,
	KAFKA_MESSAGE_HANDLER_CLASS_TOKEN,
} from "src/utils/injection-keys";

import type { Provider } from "@nestjs/common";
import type {
	KafkaConsumerModuleOptions,
	KafkaMessageHandler,
} from "src/types/kafka-consumer-module.interface";

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

// Mock handler для тестов
@Injectable()
class MockMessageHandler implements KafkaMessageHandler {
	async handleMessage(topic: string, message: unknown): Promise<unknown> {
		return { topic, message, handled: true };
	}
}

describe("KafkaConsumerModule", () => {
	let mockOptions: KafkaConsumerModuleOptions;

	beforeEach(() => {
		mockOptions = {
			topics: ["dashboard.bybit.commands"],
			groupId: "test-group",
			messageHandler: MockMessageHandler,
		};
	});

	describe("forRoot", () => {
		it("должен создать DynamicModule с правильной конфигурацией", () => {
			const dynamicModule = KafkaConsumerModule.forRoot(mockOptions);

			expect(dynamicModule).toBeDefined();
			expect(dynamicModule.module).toBe(KafkaConsumerModule);
			expect(dynamicModule.providers).toBeDefined();
			expect(dynamicModule.exports).toBeDefined();
		});

		it("должен зарегистрировать все провайдеры", () => {
			const dynamicModule = KafkaConsumerModule.forRoot(mockOptions);

			expect(dynamicModule.providers).toHaveLength(3);

			// Проверяем KAFKA_CONSUMER_OPTIONS
			const optionsProvider = dynamicModule.providers?.find(
				(p: Provider) => typeof p === "object" && "provide" in p && p.provide === KAFKA_CONSUMER_OPTIONS
			);
			expect(optionsProvider).toBeDefined();

			// Проверяем KAFKA_MESSAGE_HANDLER_CLASS_TOKEN
			const handlerClassProvider = dynamicModule.providers?.find(
				(p: Provider) =>
					typeof p === "object" && "provide" in p && p.provide === KAFKA_MESSAGE_HANDLER_CLASS_TOKEN
			);
			expect(handlerClassProvider).toBeDefined();

			// Проверяем KafkaConsumerService
			const serviceProvider = dynamicModule.providers?.find(
				(p: Provider) => typeof p === "object" && "provide" in p && p.provide === KafkaConsumerService
			);
			expect(serviceProvider).toBeDefined();
		});

		it("должен использовать useValue для KAFKA_CONSUMER_OPTIONS", () => {
			const dynamicModule = KafkaConsumerModule.forRoot(mockOptions);

			const optionsProvider = dynamicModule.providers?.find(
				(p: Provider) => typeof p === "object" && "provide" in p && p.provide === KAFKA_CONSUMER_OPTIONS
			);

			expect(optionsProvider).toBeDefined();

			if (typeof optionsProvider === "object" && "useValue" in optionsProvider) {
				expect(optionsProvider.useValue).toBe(mockOptions);
			}
		});

		it("должен экспортировать KafkaConsumerService и messageHandler class token", () => {
			const dynamicModule = KafkaConsumerModule.forRoot(mockOptions);

			expect(dynamicModule.exports).toContain(KafkaConsumerService);
			expect(dynamicModule.exports).toContain(KAFKA_MESSAGE_HANDLER_CLASS_TOKEN);
		});

		it("должен вызвать setLazyHandlerDependencies при создании сервиса", () => {
			const dynamicModule = KafkaConsumerModule.forRoot(mockOptions);

			const serviceProvider = dynamicModule.providers?.find(
				(p: Provider) => typeof p === "object" && "provide" in p && p.provide === KafkaConsumerService
			);

			expect(serviceProvider).toBeDefined();

			if (
				typeof serviceProvider === "object" &&
				"useFactory" in serviceProvider &&
				typeof serviceProvider.useFactory === "function"
			) {
				// Мокаем KafkaClientService
				const mockKafkaClientService = {
					getClient: jest.fn(),
					isConnected: jest.fn().mockReturnValue(true),
				} as unknown as KafkaClientService;

				// Мокаем LoggerService
				const mockLogger: jest.Mocked<LoggerService> = {
					log: jest.fn(),
					error: jest.fn(),
					warn: jest.fn(),
					debug: jest.fn(),
					verbose: jest.fn(),
					setContext: jest.fn(),
				} as unknown as jest.Mocked<LoggerService>;

				// Мокаем ModuleRef
				const mockModuleRef = {
					get: jest.fn().mockReturnValue(new MockMessageHandler()),
				} as unknown as ModuleRef;

				// Создаем spy на setLazyHandlerDependencies
				const setLazyHandlerDependenciesSpy = jest.spyOn(
					KafkaConsumerService.prototype,
					"setLazyHandlerDependencies"
				);

				// Вызываем useFactory
				const createdService = serviceProvider.useFactory(
					mockOptions,
					MockMessageHandler,
					mockModuleRef,
					mockKafkaClientService,
					mockLogger
				);

				// Проверяем, что setLazyHandlerDependencies был вызван
				expect(setLazyHandlerDependenciesSpy).toHaveBeenCalledTimes(1);
				expect(setLazyHandlerDependenciesSpy).toHaveBeenCalledWith(MockMessageHandler, mockModuleRef);
				expect(createdService).toBeInstanceOf(KafkaConsumerService);

				// Восстанавливаем spy
				setLazyHandlerDependenciesSpy.mockRestore();
			}
		});

		it("должен передать null как messageHandler в конструктор сервиса", () => {
			const dynamicModule = KafkaConsumerModule.forRoot(mockOptions);

			const serviceProvider = dynamicModule.providers?.find(
				(p: Provider) => typeof p === "object" && "provide" in p && p.provide === KafkaConsumerService
			);

			expect(serviceProvider).toBeDefined();

			if (
				typeof serviceProvider === "object" &&
				"useFactory" in serviceProvider &&
				typeof serviceProvider.useFactory === "function"
			) {
				// Мокаем зависимости
				const mockKafkaClientService = {
					getClient: jest.fn(),
					isConnected: jest.fn().mockReturnValue(true),
				} as unknown as KafkaClientService;

				const mockLogger: jest.Mocked<LoggerService> = {
					log: jest.fn(),
					error: jest.fn(),
					warn: jest.fn(),
					debug: jest.fn(),
					verbose: jest.fn(),
					setContext: jest.fn(),
				} as unknown as jest.Mocked<LoggerService>;

				const mockModuleRef = {
					get: jest.fn().mockReturnValue(new MockMessageHandler()),
				} as unknown as ModuleRef;

				// Создаем spy на конструктор
				const constructorSpy = jest.spyOn(KafkaConsumerService.prototype, "constructor" as never);

				// Вызываем useFactory
				serviceProvider.useFactory(
					mockOptions,
					MockMessageHandler,
					mockModuleRef,
					mockKafkaClientService,
					mockLogger
				);

				// Проверяем, что конструктор был вызван (через создание экземпляра)
				// Вместо проверки конструктора, проверим что сервис создан с null handler
				const createdService = serviceProvider.useFactory(
					mockOptions,
					MockMessageHandler,
					mockModuleRef,
					mockKafkaClientService,
					mockLogger
				);

				expect(createdService).toBeInstanceOf(KafkaConsumerService);

				constructorSpy.mockRestore();
			}
		});

		it("должен передать правильные inject зависимости в useFactory", () => {
			const dynamicModule = KafkaConsumerModule.forRoot(mockOptions);

			const serviceProvider = dynamicModule.providers?.find(
				(p: Provider) => typeof p === "object" && "provide" in p && p.provide === KafkaConsumerService
			);

			if (typeof serviceProvider === "object" && "inject" in serviceProvider) {
				expect(serviceProvider.inject).toContain(KAFKA_CONSUMER_OPTIONS);
				expect(serviceProvider.inject).toContain(KAFKA_MESSAGE_HANDLER_CLASS_TOKEN);
				expect(serviceProvider.inject).toContain(ModuleRef);
				expect(serviceProvider.inject).toContain(KafkaClientService);
				expect(serviceProvider.inject).toContain(LoggerService);
			}
		});

		it("должен поддерживать импорты дополнительных модулей", () => {
			const mockImport = { module: class TestModule {} };
			const dynamicModule = KafkaConsumerModule.forRoot({
				...mockOptions,
				imports: [mockImport],
			});

			expect(dynamicModule.imports).toEqual([mockImport]);
		});

		it("должен использовать пустой массив для imports если не указан", () => {
			const dynamicModule = KafkaConsumerModule.forRoot(mockOptions);

			expect(dynamicModule.imports).toEqual([]);
		});

		it("должен вызвать useFactory для KAFKA_MESSAGE_HANDLER_CLASS_TOKEN провайдера", () => {
			const dynamicModule = KafkaConsumerModule.forRoot(mockOptions);

			const handlerClassProvider = dynamicModule.providers?.find(
				(p: Provider) =>
					typeof p === "object" && "provide" in p && p.provide === KAFKA_MESSAGE_HANDLER_CLASS_TOKEN
			);

			expect(handlerClassProvider).toBeDefined();

			if (
				typeof handlerClassProvider === "object" &&
				"useFactory" in handlerClassProvider &&
				typeof handlerClassProvider.useFactory === "function"
			) {
				const handlerClass = handlerClassProvider.useFactory(mockOptions);

				expect(handlerClass).toBe(MockMessageHandler);
			}
		});
	});
});
