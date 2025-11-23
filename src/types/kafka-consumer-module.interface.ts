import type {
	DynamicModule,
	ForwardReference,
	InjectionToken,
	ModuleMetadata,
	OptionalFactoryDependency,
	Type,
} from "@nestjs/common";

// Обработчик сообщений Kafka
export interface KafkaMessageHandler {
	handleMessage(topic: string, message: unknown, headers?: Record<string, string>): Promise<unknown>;
}

// Опции конфигурации для Kafka Consumer модуля
export interface KafkaConsumerModuleOptions {
	// Топики для подписки
	topics: string[];
	// ID группы потребителей
	groupId: string;
	// Обработчик сообщений
	messageHandler: Type<KafkaMessageHandler>;
	// Дополнительные модули для импорта (например, модули с зависимостями handler'а)
	imports?: Array<Type<unknown> | DynamicModule | ForwardReference>;
}

// Тип для функции фабрики с динамическими аргументами
type KafkaConsumerModuleOptionsFactory<T extends unknown[] = []> = (
	...args: T
) => Promise<KafkaConsumerModuleOptions> | KafkaConsumerModuleOptions;

// Асинхронные опции для динамической конфигурации модуля через useFactory
export interface KafkaConsumerModuleAsyncOptions<T extends unknown[] = []>
	extends Pick<ModuleMetadata, "imports"> {
	/**
	 * Фабрика для создания опций
	 * Аргументы функции соответствуют зависимостям из inject
	 */
	useFactory: KafkaConsumerModuleOptionsFactory<T>;
	// Зависимости для инъекции в useFactory
	inject?: (InjectionToken | OptionalFactoryDependency)[];
}

/**
 * Опции конфигурации для Kafka Consumer Service
 * Отличается от KafkaConsumerModuleOptions тем, что messageHandler здесь - это экземпляр, а не класс
 */
export interface KafkaConsumerServiceOptions {
	topics: string[];
	groupId: string;
	messageHandler: unknown;
}
