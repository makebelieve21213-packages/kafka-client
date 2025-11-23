import { LoggerService } from "@makebelieve21213-packages/logger";
import { Module, Global, DynamicModule, Provider } from "@nestjs/common";
import KafkaClientService from "src/main/client/kafka-client.service";
import KafkaProducerService from "src/main/producer/kafka-producer.service";

import type { KafkaProducerModuleAsyncOptions } from "src/types/kafka-producer-module.interface";

/**
 * Глобальный модуль для отправки сообщений через Kafka (Producer + Request-Reply)
 * Использует единое подключение через KafkaClientModule
 */
@Global()
@Module({})
export default class KafkaProducerModule {
	/**
	 * Регистрация модуля с опциями через useFactory
	 * Используется в сервисах, которые ОТПРАВЛЯЮТ сообщения и ЖДУТ ответа
	 * ВАЖНО: Требует импорта KafkaClientModule.forRootAsync() в корневом модуле
	 */
	static forRootAsync<T extends unknown[]>(
		options?: KafkaProducerModuleAsyncOptions<T>
	): DynamicModule {
		const providers: Provider[] = [
			{
				provide: KafkaProducerService,
				useFactory: (
					kafkaClientService: KafkaClientService,
					logger: LoggerService
				): KafkaProducerService => {
					return new KafkaProducerService(kafkaClientService, logger);
				},
				inject: [KafkaClientService, LoggerService],
			},
		];

		return {
			module: KafkaProducerModule,
			imports: options?.imports || [],
			providers,
			exports: [KafkaProducerService],
		};
	}
}
