import type { KafkaConfig, ProducerConfig, ConsumerConfig } from "kafkajs";
import type { DLQHandlerOptions } from "src/types/dlq-handler.interface";
import type { RequestReplyOptions } from "src/types/request-reply-options.interface";
import type { RetryHandlerOptions } from "src/types/retry-handler.interface";

// Опции для KafkaCore
export interface KafkaCoreOptions {
	// Конфигурация Kafka
	kafka: KafkaConfig;
	// Конфигурация Producer
	producer?: ProducerConfig;
	// Конфигурация Consumer
	consumer?: ConsumerConfig;
	// Опции для Request-Reply паттерна
	requestReply?: Partial<RequestReplyOptions>;
	// Опции для Retry Handler
	retry?: Partial<RetryHandlerOptions>;
	// Опции для DLQ Handler
	dlq?: DLQHandlerOptions;
}
