import type { ModuleMetadata } from "@nestjs/common";

// Опции конфигурации для Kafka Producer модуля
// В данный момент модуль не требует опций, но интерфейс создан для консистентности API
export interface KafkaProducerModuleOptions {
	// Опции могут быть добавлены в будущем
}

// Асинхронные опции для динамической конфигурации модуля
// Поскольку модуль не требует опций, все поля опциональны
export interface KafkaProducerModuleAsyncOptions<T extends unknown[] = []>
	extends Pick<ModuleMetadata, "imports"> {
	/**
	 * Фабрика для создания опций (опциональна, так как модуль не требует конфигурации)
	 * Аргументы функции соответствуют зависимостям из inject
	 */
	useFactory?: () => Promise<KafkaProducerModuleOptions> | KafkaProducerModuleOptions;
	// Зависимости для инъекции в useFactory
	inject?: T;
}
