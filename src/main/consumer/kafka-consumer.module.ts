import { LoggerService } from "@makebelieve21213-packages/logger";
import { Module, Global, DynamicModule, Provider, Type } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import KafkaClientService from "src/main/client/kafka-client.service";
import KafkaConsumerService from "src/main/consumer/kafka-consumer.service";
import {
	KAFKA_CONSUMER_OPTIONS,
	KAFKA_MESSAGE_HANDLER_CLASS_TOKEN,
} from "src/utils/injection-keys";

import type {
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
	 * Регистрация модуля с опциями напрямую
	 * Используется в сервисах, которые ПРИНИМАЮТ сообщения и ОБРАБАТЫВАЮТ их
	 * Handler инициализируется лениво в onModuleInit() для корректной работы с forwardRef
	 */
	static forRoot(options: KafkaConsumerModuleOptions): DynamicModule {
		const providers: Provider[] = [
			{
				provide: KAFKA_CONSUMER_OPTIONS,
				useValue: options,
			},
			{
				provide: KAFKA_MESSAGE_HANDLER_CLASS_TOKEN,
				useFactory: (moduleOptions: KafkaConsumerModuleOptions) => {
					return moduleOptions.messageHandler;
				},
				inject: [KAFKA_CONSUMER_OPTIONS],
			},
			{
				provide: KafkaConsumerService,
				useFactory: (
					moduleOptions: KafkaConsumerModuleOptions,
					handlerClass: Type<KafkaMessageHandler>,
					moduleRef: ModuleRef,
					kafkaClientService: KafkaClientService,
					logger: LoggerService
				) => {
					const service = new KafkaConsumerService(
						moduleOptions,
						null, // будет получен позже
						kafkaClientService,
						logger
					);
					service.setLazyHandlerDependencies(handlerClass, moduleRef);
					return service;
				},
				inject: [
					KAFKA_CONSUMER_OPTIONS,
					KAFKA_MESSAGE_HANDLER_CLASS_TOKEN,
					ModuleRef,
					KafkaClientService,
					LoggerService,
				],
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
