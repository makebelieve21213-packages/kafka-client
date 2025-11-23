import { LoggerService } from "@makebelieve21213-packages/logger";
import { Module, Global, DynamicModule, Provider } from "@nestjs/common";
import KafkaClientService from "src/main/client/kafka-client.service";
import {
	KafkaClientModuleOptions,
	KafkaClientModuleAsyncOptions,
} from "src/types/module-options.interface";
import { KAFKA_CLIENT_OPTIONS } from "src/utils/injection-keys";

/**
 * Глобальный модуль для единого подключения к Kafka
 * Создает ОДИН экземпляр KafkaClient на микросервис
 * Используется Producer и Consumer сервисами
 */
@Global()
@Module({})
export default class KafkaClientModule {
	/**
	 * Регистрация модуля с динамическими опциями через useFactory
	 * Позволяет инжектить зависимости для создания конфигурации
	 */
	static forRootAsync<T extends unknown[]>(
		options: KafkaClientModuleAsyncOptions<T>
	): DynamicModule {
		const providers: Provider[] = [
			{
				provide: KAFKA_CLIENT_OPTIONS,
				useFactory: options.useFactory,
				inject: options.inject || [],
			},
			{
				provide: KafkaClientService,
				useFactory: (
					moduleOptions: KafkaClientModuleOptions,
					logger: LoggerService
				): KafkaClientService => {
					return new KafkaClientService(moduleOptions, logger);
				},
				inject: [KAFKA_CLIENT_OPTIONS, LoggerService],
			},
		];

		return {
			module: KafkaClientModule,
			imports: options.imports || [],
			providers,
			exports: [KafkaClientService],
		};
	}
}
