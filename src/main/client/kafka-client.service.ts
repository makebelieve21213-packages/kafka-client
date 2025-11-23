import { LoggerService } from "@makebelieve21213-packages/logger";
import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import KafkaCore from "src/core/kafka.core";
import KafkaClientError from "src/errors/kafka-client.error";
import { KafkaTopic } from "src/types/kafka-topics";

import type { KafkaClientModuleOptions } from "src/types/module-options.interface";

/**
 * Сервис для единого подключения к Kafka
 * Предоставляет доступ к KafkaCore для Producer и Consumer сервисов
 */
@Injectable()
export default class KafkaClientService implements OnModuleInit, OnModuleDestroy {
	private kafkaClient?: KafkaCore;

	constructor(
		private readonly options: KafkaClientModuleOptions,
		private readonly logger: LoggerService
	) {
		this.logger.setContext(KafkaClientService.name);
	}

	// Инициализация единого Kafka клиента при старте модуля
	async onModuleInit(): Promise<void> {
		this.logger.log("Initializing Kafka Client...");

		const { brokers, clientId } = this.options;

		if (!brokers || !brokers.length || !clientId) {
			throw new KafkaClientError(
				"brokers and clientId must be provided in KafkaClientModuleOptions",
				"INVALID_MODULE_OPTIONS"
			);
		}

		try {
			this.logger.log(`Connecting to Kafka brokers: ${brokers.join(", ")}`);

			// Используем статичный groupId для Request-Reply паттерна
			// Это предотвращает создание множества consumer groups при перезапусках
			const requestReplyGroupId = `${clientId}-request-reply`;

			// Настройки таймаутов для надежного подключения в Docker окружении
			const connectionTimeout = this.options.connectionTimeout ?? 10000;
			const requestTimeout = this.options.requestTimeout ?? 30000;
			const retryConfig = this.options.retry ?? {
				retries: 8,
				initialRetryTime: 300,
				maxRetryTime: 30000,
			};

			this.logger.log(
				`Connection timeout: ${connectionTimeout}ms, Request timeout: ${requestTimeout}ms`
			);

			this.kafkaClient = new KafkaCore(
				{
					kafka: {
						clientId,
						brokers,
						connectionTimeout,
						requestTimeout,
						retry: retryConfig,
						enforceRequestTimeout: false,
						logLevel: 2,
					},
					requestReply: {
						defaultTimeout: this.options.defaultTimeout || 30000,
						groupId: requestReplyGroupId,
					},
				},
				this.logger
			);

			this.logger.log("Attempting to connect to Kafka...");
			await this.kafkaClient.connect();
			this.logger.log("Successfully connected to Kafka");

			// Инициализируем Request-Reply паттерн, если указаны response topics
			if (this.options.responseTopics && this.options.responseTopics.length) {
				const responseTopics = this.options.responseTopics.map((topic) => topic as KafkaTopic);
				this.kafkaClient.initRequestReply(responseTopics);

				if (!this.kafkaClient.requestReply) {
					throw new KafkaClientError(
						"Failed to initialize Request-Reply pattern",
						"REQUEST_REPLY_INIT_FAILED"
					);
				}

				await this.kafkaClient.requestReply.startListening();

				this.logger.log(
					`Request-Reply pattern initialized for topics: ${this.options.responseTopics.join(", ")}`
				);
			}

			this.logger.log("Kafka Client initialized successfully");
		} catch (error: Error | unknown) {
			const kafkaError = KafkaClientError.fromError(error, "Failed to initialize Kafka Client");
			this.logger.error("Failed to initialize Kafka Client", kafkaError.stack);
			throw kafkaError;
		}
	}

	// Отключение от Kafka при остановке модуля
	async onModuleDestroy(): Promise<void> {
		this.logger.log("Disconnecting Kafka Client...");

		if (this.kafkaClient) {
			await this.kafkaClient.disconnect();
			this.logger.log("Kafka Client disconnected");
		}
	}

	// Получить экземпляр KafkaCore
	getClient(): KafkaCore {
		if (!this.kafkaClient) {
			throw new KafkaClientError("Kafka client not initialized", "CLIENT_NOT_INITIALIZED");
		}
		return this.kafkaClient;
	}

	// Проверка статуса подключения
	isConnected(): boolean {
		return this.kafkaClient?.getConnectionStatus() ?? false;
	}
}
