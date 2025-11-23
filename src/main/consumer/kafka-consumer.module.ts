import { Module, Global, DynamicModule, Provider, Type } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import KafkaClientService from "src/main/client/kafka-client.service";
import KafkaConsumerService from "src/main/consumer/kafka-consumer.service";
import {
	KAFKA_CONSUMER_OPTIONS,
	KAFKA_MESSAGE_HANDLER_CLASS_TOKEN,
	KAFKA_MESSAGE_HANDLER_INSTANCE_TOKEN,
} from "src/utils/injection-keys";

import type {
	KafkaConsumerModuleAsyncOptions,
	KafkaConsumerModuleOptions,
	KafkaMessageHandler,
} from "src/types/kafka-consumer-module.interface";

/**
 * Глобальный модуль для получения сообщений через Kafka (Consumer)
 * Использует единое подключение через KafkaClientModule
 */
@Global()
@Module({})
export default class KafkaConsumerModule {
	/**
	 * Регистрация модуля с опциями через useFactory
	 * Используется в сервисах, которые ПРИНИМАЮТ сообщения и ОБРАБАТЫВАЮТ их
	 * Позволяет инжектить зависимости для создания конфигурации
	 */
	static forRootAsync<T extends unknown[]>(
		options: KafkaConsumerModuleAsyncOptions<T>
	): DynamicModule {
		const providers: Provider[] = [
			// Провайдер для опций модуля
			{
				provide: KAFKA_CONSUMER_OPTIONS,
				useFactory: options.useFactory,
				inject: options.inject || [],
			},
			// Провайдер для класса messageHandler из опций
			{
				provide: KAFKA_MESSAGE_HANDLER_CLASS_TOKEN,
				useFactory: (moduleOptions: KafkaConsumerModuleOptions): Type<KafkaMessageHandler> => {
					return moduleOptions.messageHandler;
				},
				inject: [KAFKA_CONSUMER_OPTIONS],
			},
			/**
			 * Провайдер для экземпляра messageHandler
			 * Создаем экземпляр класса через ModuleRef для корректной инжекции зависимостей
			 * messageHandler должен быть зарегистрирован как провайдер в модуле, указанном в imports
			 */
			{
				provide: KAFKA_MESSAGE_HANDLER_INSTANCE_TOKEN,
				useFactory: (
					handlerClass: Type<KafkaMessageHandler>,
					moduleRef: ModuleRef
				): KafkaMessageHandler => {
					return moduleRef.get(handlerClass, { strict: false });
				},
				inject: [KAFKA_MESSAGE_HANDLER_CLASS_TOKEN, ModuleRef],
			},
			// Провайдер для KafkaConsumerService
			{
				provide: KafkaConsumerService,
				useFactory: (
					moduleOptions: KafkaConsumerModuleOptions,
					messageHandler: KafkaMessageHandler,
					kafkaClientService: KafkaClientService
				): KafkaConsumerService => {
					// NestJS автоматически вызовет onModuleInit() - не нужно вызывать вручную
					return new KafkaConsumerService(moduleOptions, messageHandler, kafkaClientService);
				},
				inject: [KAFKA_CONSUMER_OPTIONS, KAFKA_MESSAGE_HANDLER_INSTANCE_TOKEN, KafkaClientService],
			},
		];

		return {
			module: KafkaConsumerModule,
			imports: options.imports || [],
			providers,
			exports: [KafkaConsumerService, KAFKA_MESSAGE_HANDLER_CLASS_TOKEN],
		};
	}
}
