import { LoggerService } from "@makebelieve21213-packages/logger";
import { Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import KafkaClientService from "src/main/client/kafka-client.service";
import KafkaConsumerModule from "src/main/consumer/kafka-consumer.module";
import KafkaConsumerService from "src/main/consumer/kafka-consumer.service";
import {
	KAFKA_CONSUMER_OPTIONS,
	KAFKA_MESSAGE_HANDLER_CLASS_TOKEN,
	KAFKA_MESSAGE_HANDLER_INSTANCE_TOKEN,
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

	describe("forRootAsync", () => {
		it("должен создать DynamicModule с правильной конфигурацией", () => {
			const dynamicModule = KafkaConsumerModule.forRootAsync({
				useFactory: () => mockOptions,
			});

			expect(dynamicModule).toBeDefined();
			expect(dynamicModule.module).toBe(KafkaConsumerModule);
			expect(dynamicModule.providers).toBeDefined();
			expect(dynamicModule.exports).toBeDefined();
		});

		it("должен зарегистрировать все провайдеры", () => {
			const dynamicModule = KafkaConsumerModule.forRootAsync({
				useFactory: () => mockOptions,
			});

			expect(dynamicModule.providers).toHaveLength(4);

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

			// Проверяем KAFKA_MESSAGE_HANDLER_INSTANCE_TOKEN
			const handlerInstanceProvider = dynamicModule.providers?.find(
				(p: Provider) =>
					typeof p === "object" && "provide" in p && p.provide === KAFKA_MESSAGE_HANDLER_INSTANCE_TOKEN
			);
			expect(handlerInstanceProvider).toBeDefined();

			// Проверяем KafkaConsumerService
			const serviceProvider = dynamicModule.providers?.find(
				(p: Provider) => typeof p === "object" && "provide" in p && p.provide === KafkaConsumerService
			);
			expect(serviceProvider).toBeDefined();
		});

		it("должен экспортировать KafkaConsumerService и messageHandler class token", () => {
			const dynamicModule = KafkaConsumerModule.forRootAsync({
				useFactory: () => mockOptions,
			});

			expect(dynamicModule.exports).toContain(KafkaConsumerService);
			expect(dynamicModule.exports).toContain(KAFKA_MESSAGE_HANDLER_CLASS_TOKEN);
		});

		it("должен использовать useFactory для инициализации сервиса", () => {
			const dynamicModule = KafkaConsumerModule.forRootAsync({
				useFactory: () => mockOptions,
			});

			const serviceProvider = dynamicModule.providers?.find(
				(p: Provider) => typeof p === "object" && "provide" in p && p.provide === KafkaConsumerService
			);

			expect(serviceProvider).toBeDefined();

			if (typeof serviceProvider === "object" && "useFactory" in serviceProvider) {
				expect(serviceProvider.useFactory).toBeDefined();
				expect(typeof serviceProvider.useFactory).toBe("function");
			}
		});

		it("должен передать правильные опции в провайдер через useFactory", () => {
			const customOptions: KafkaConsumerModuleOptions = {
				topics: ["custom.topic"],
				groupId: "custom-group",
				messageHandler: MockMessageHandler,
			};

			const dynamicModule = KafkaConsumerModule.forRootAsync({
				useFactory: () => customOptions,
			});

			const optionsProvider = dynamicModule.providers?.find(
				(p: Provider) => typeof p === "object" && "provide" in p && p.provide === KAFKA_CONSUMER_OPTIONS
			);

			expect(optionsProvider).toBeDefined();

			if (typeof optionsProvider === "object" && "useFactory" in optionsProvider) {
				expect(optionsProvider.useFactory).toBeDefined();
				expect(typeof optionsProvider.useFactory).toBe("function");
			}
		});

		it("должен передать inject зависимости в useFactory", () => {
			const dynamicModule = KafkaConsumerModule.forRootAsync({
				useFactory: () => mockOptions,
			});

			const serviceProvider = dynamicModule.providers?.find(
				(p: Provider) => typeof p === "object" && "provide" in p && p.provide === KafkaConsumerService
			);

			if (typeof serviceProvider === "object" && "inject" in serviceProvider) {
				expect(serviceProvider.inject).toContain(KAFKA_CONSUMER_OPTIONS);
				expect(serviceProvider.inject).toContain(KAFKA_MESSAGE_HANDLER_INSTANCE_TOKEN);
				expect(serviceProvider.inject).toContain(KafkaClientService);
				expect(serviceProvider.inject).toContain(LoggerService);
			}
		});

		it("должен поддерживать импорты дополнительных модулей", () => {
			const mockImport = { module: class TestModule {} };
			const dynamicModule = KafkaConsumerModule.forRootAsync({
				useFactory: () => mockOptions,
				imports: [mockImport],
			});

			expect(dynamicModule.imports).toEqual([mockImport]);
		});

		it("должен использовать пустой массив для imports если не указан", () => {
			const dynamicModule = KafkaConsumerModule.forRootAsync({
				useFactory: () => mockOptions,
			});

			expect(dynamicModule.imports).toEqual([]);
		});

		it("должен вызвать useFactory для создания сервиса", () => {
			const dynamicModule = KafkaConsumerModule.forRootAsync({
				useFactory: () => mockOptions,
			});

			const serviceProvider = dynamicModule.providers?.find(
				(p: Provider) => typeof p === "object" && "provide" in p && p.provide === KafkaConsumerService
			);

			expect(serviceProvider).toBeDefined();

			if (
				typeof serviceProvider === "object" &&
				"useFactory" in serviceProvider &&
				typeof serviceProvider.useFactory === "function"
			) {
				// Проверяем, что useFactory определена и является функцией
				expect(serviceProvider.useFactory).toBeDefined();
				expect(typeof serviceProvider.useFactory).toBe("function");

				// Проверяем, что useFactory принимает правильные параметры
				expect(serviceProvider.inject).toHaveLength(4);
				expect(serviceProvider.inject).toContain(KAFKA_CONSUMER_OPTIONS);
				expect(serviceProvider.inject).toContain(KAFKA_MESSAGE_HANDLER_INSTANCE_TOKEN);
				expect(serviceProvider.inject).toContain(KafkaClientService);
				expect(serviceProvider.inject).toContain(LoggerService);
			}
		});

		it("должен создать сервис в useFactory без вызова onModuleInit", () => {
			// Мокаем KafkaClientService с новым методом createConsumer
			const mockKafkaClientService = {
				getClient: jest.fn().mockReturnValue({
					createConsumer: jest.fn().mockReturnValue({
						connect: jest.fn().mockResolvedValue(undefined),
						subscribe: jest.fn().mockResolvedValue(undefined),
						run: jest.fn().mockResolvedValue(undefined),
						disconnect: jest.fn().mockResolvedValue(undefined),
					}),
					fireAndForget: {
						send: jest.fn().mockResolvedValue(undefined),
					},
				}),
				isConnected: jest.fn().mockReturnValue(true),
			};

			// Мокаем LoggerService
			const mockLogger: jest.Mocked<LoggerService> = {
				log: jest.fn(),
				error: jest.fn(),
				warn: jest.fn(),
				debug: jest.fn(),
				verbose: jest.fn(),
				setContext: jest.fn(),
			} as unknown as jest.Mocked<LoggerService>;

			// Мокаем onModuleInit чтобы убедиться, что он НЕ вызывается в useFactory
			const onModuleInitSpy = jest
				.spyOn(KafkaConsumerService.prototype, "onModuleInit")
				.mockResolvedValue(undefined);

			const dynamicModule = KafkaConsumerModule.forRootAsync({
				useFactory: () => mockOptions,
			});

			const serviceProvider = dynamicModule.providers?.find(
				(p: Provider) => typeof p === "object" && "provide" in p && p.provide === KafkaConsumerService
			);

			expect(serviceProvider).toBeDefined();

			if (
				typeof serviceProvider === "object" &&
				"useFactory" in serviceProvider &&
				typeof serviceProvider.useFactory === "function"
			) {
				const handler = new MockMessageHandler();

				// Вызываем useFactory с правильными параметрами
				const createdService = serviceProvider.useFactory(mockOptions, handler, mockKafkaClientService, mockLogger);

				// Проверяем, что создан экземпляр сервиса
				expect(createdService).toBeDefined();
				expect(createdService).toBeInstanceOf(KafkaConsumerService);

				// Проверяем, что onModuleInit НЕ был вызван в useFactory
				// NestJS вызовет его автоматически благодаря OnModuleInit lifecycle hook
				expect(onModuleInitSpy).not.toHaveBeenCalled();
			}

			// Восстанавливаем мок
			onModuleInitSpy.mockRestore();
		});

		it("должен вызвать useFactory для KAFKA_MESSAGE_HANDLER_CLASS_TOKEN провайдера", () => {
			const dynamicModule = KafkaConsumerModule.forRootAsync({
				useFactory: () => mockOptions,
			});

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

		it("должен вызвать useFactory для KAFKA_MESSAGE_HANDLER_INSTANCE_TOKEN провайдера", () => {
			const dynamicModule = KafkaConsumerModule.forRootAsync({
				useFactory: () => mockOptions,
			});

			const handlerInstanceProvider = dynamicModule.providers?.find(
				(p: Provider) =>
					typeof p === "object" && "provide" in p && p.provide === KAFKA_MESSAGE_HANDLER_INSTANCE_TOKEN
			);

			expect(handlerInstanceProvider).toBeDefined();

			if (
				typeof handlerInstanceProvider === "object" &&
				"useFactory" in handlerInstanceProvider &&
				typeof handlerInstanceProvider.useFactory === "function"
			) {
				// Создаем мок ModuleRef
				const mockModuleRef = {
					get: jest.fn().mockReturnValue(new MockMessageHandler()),
				} as unknown as ModuleRef;

				const handlerInstance = handlerInstanceProvider.useFactory(MockMessageHandler, mockModuleRef);

				expect(handlerInstance).toBeDefined();
				expect(handlerInstance).toBeInstanceOf(MockMessageHandler);
				expect(mockModuleRef.get).toHaveBeenCalledWith(MockMessageHandler, { strict: false });
			}
		});
	});
});
