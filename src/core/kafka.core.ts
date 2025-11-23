import { Kafka, Partitioners, type Producer, type Consumer, type ConsumerConfig } from "kafkajs";
import FireAndForgetPattern from "src/core/patterns/fire-and-forget.pattern";
import RequestReplyPattern from "src/core/patterns/request-reply.pattern";
import DLQHandler from "src/core/retry/dlq-handler";
import RetryHandler from "src/core/retry/retry-handler";
import KafkaClientError from "src/errors/kafka-client.error";

import type { LoggerService } from "@makebelieve21213-packages/logger";
import type { KafkaCoreOptions } from "src/types/kafka-core.options.interface";
import type { KafkaTopic } from "src/types/kafka-topics";
import type { RequestReplyOptions } from "src/types/request-reply-options.interface";

/**
 * Низкоуровневый клиент для работы с Kafka
 * Предоставляет все паттерны и утилиты
 */
export default class KafkaCore {
	private readonly kafka: Kafka;
	private readonly producer: Producer;
	private readonly consumer: Consumer;
	private readonly dlqConsumer?: Consumer;

	// Паттерны
	readonly fireAndForget: FireAndForgetPattern;
	readonly requestReply?: RequestReplyPattern;

	// Handlers
	readonly retryHandler: RetryHandler;
	readonly dlqHandler?: DLQHandler;

	private isConnected = false;

	constructor(
		private readonly options: KafkaCoreOptions,
		private readonly logger: LoggerService
	) {
		this.logger.setContext(KafkaCore.name);
		// Инициализация Kafka
		this.kafka = new Kafka(this.options.kafka);

		// Инициализация Producer с DefaultPartitioner для устранения предупреждения
		this.producer = this.kafka.producer({
			createPartitioner: Partitioners.DefaultPartitioner,
			...this.options.producer,
		});

		// Инициализация Consumer для Request-Reply
		this.consumer = this.kafka.consumer({
			groupId: this.options.requestReply?.groupId || `${this.options.kafka.clientId}-consumer`,
			...this.options.consumer,
		});

		// Инициализация DLQ Consumer
		if (this.options.dlq) {
			this.dlqConsumer = this.kafka.consumer({
				groupId: this.options.dlq.groupId || `${this.options.kafka.clientId}-dlq-consumer`,
				...this.options.consumer,
			});
		}

		// Инициализация паттернов
		this.fireAndForget = new FireAndForgetPattern(this.producer, this.logger);

		// Инициализация handlers
		this.retryHandler = new RetryHandler(this.producer, this.logger, this.options.retry);

		if (this.dlqConsumer && this.options.dlq) {
			this.dlqHandler = new DLQHandler(this.dlqConsumer, this.options.dlq, this.logger);
		}
	}

	// Инициализировать Request-Reply паттерн
	initRequestReply(
		responseTopics: KafkaTopic[],
		options?: Partial<RequestReplyOptions>
	): RequestReplyPattern {
		if (this.requestReply) {
			throw new KafkaClientError(
				"RequestReply pattern already initialized",
				"REQUEST_REPLY_ALREADY_INITIALIZED"
			);
		}

		const pattern = new RequestReplyPattern(
			this.producer,
			this.consumer,
			responseTopics,
			this.logger,
			options
		);

		// Присваиваем через Object.defineProperty для readonly поля
		Object.defineProperty(this, "requestReply", {
			value: pattern,
			writable: false,
		});

		return pattern;
	}

	// Подключиться к Kafka
	async connect(): Promise<void> {
		if (this.isConnected) {
			this.logger.warn("Already connected");
			return;
		}

		await this.producer.connect();
		await this.consumer.connect();

		if (this.dlqConsumer) {
			await this.dlqConsumer.connect();
		}

		this.isConnected = true;
		this.logger.log("Connected to Kafka");
	}

	// Отключиться от Kafka
	async disconnect(): Promise<void> {
		if (!this.isConnected) {
			return;
		}

		if (this.requestReply) {
			await this.requestReply.stopListening();
		}

		if (this.dlqHandler) {
			await this.dlqHandler.stop();
		}

		await this.producer.disconnect();
		await this.consumer.disconnect();

		if (this.dlqConsumer) {
			await this.dlqConsumer.disconnect();
		}

		this.isConnected = false;
		this.logger.log("Disconnected from Kafka");
	}

	// Проверить подключение
	getConnectionStatus(): boolean {
		return this.isConnected;
	}

	// Создать новый consumer с указанным groupId
	createConsumer(groupId: string, config?: Omit<ConsumerConfig, "groupId">): Consumer {
		return this.kafka.consumer({
			groupId,
			...config,
		});
	}
}
