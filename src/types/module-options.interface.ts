import type { InjectionToken, ModuleMetadata, OptionalFactoryDependency } from "@nestjs/common";

// Опции конфигурации для Kafka Client модуля
export interface KafkaClientModuleOptions {
	// Kafka brokers (например, ['localhost:9092'])
	brokers: string[];
	// ID клиента Kafka
	clientId: string;
	// Топики для ответов (response topics) для Request-Reply паттерна
	responseTopics?: string[];
	// Таймаут по умолчанию для Request-Reply в мс
	defaultTimeout?: number;
	// Таймаут подключения к брокеру в мс (по умолчанию 10000)
	connectionTimeout?: number;
	// Таймаут запроса к брокеру в мс (по умолчанию 30000)
	requestTimeout?: number;
	// Настройки retry для подключения
	retry?: {
		// Максимальное количество попыток (по умолчанию 8)
		retries?: number;
		// Начальное время ожидания перед retry в мс (по умолчанию 300)
		initialRetryTime?: number;
		// Максимальное время ожидания перед retry в мс (по умолчанию 30000)
		maxRetryTime?: number;
	};
}

// Тип для функции фабрики с динамическими аргументами
type KafkaModuleOptionsFactory<T extends unknown[] = []> = (
	...args: T
) => Promise<KafkaClientModuleOptions> | KafkaClientModuleOptions;

// Асинхронные опции для динамической конфигурации модуля через useFactory
export interface KafkaClientModuleAsyncOptions<T extends unknown[] = []>
	extends Pick<ModuleMetadata, "imports"> {
	/**
	 * Фабрика для создания опций
	 * Аргументы функции соответствуют зависимостям из inject
	 */
	useFactory: KafkaModuleOptionsFactory<T>;
	// Зависимости для инъекции в useFactory
	inject?: (InjectionToken | OptionalFactoryDependency)[];
}
