import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { RpcException } from "@nestjs/microservices";
import KafkaClientError from "src/errors/kafka-client.error";
import KafkaClientService from "src/main/client/kafka-client.service";
import { KafkaTopic } from "src/types/kafka-topics";

import type { EachMessagePayload, IHeaders, Consumer } from "kafkajs";
import type {
	KafkaMessageHandler,
	KafkaConsumerServiceOptions,
} from "src/types/kafka-consumer-module.interface";

/**
 * Сервис для получения и обработки сообщений из Kafka
 * Слушает указанные топики и делегирует обработку сообщений handler'у
 * Использует единое подключение через KafkaClientService
 */
@Injectable()
export default class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
	private consumer?: Consumer;
	private readonly logger = new Logger(KafkaConsumerService.name);

	constructor(
		private readonly options: KafkaConsumerServiceOptions,
		private readonly messageHandler: KafkaMessageHandler,
		private readonly kafkaClientService: KafkaClientService
	) {}

	// Инициализация Kafka consumer при старте модуля
	async onModuleInit(): Promise<void> {
		this.logger.log("Initializing Kafka Consumer...");

		const { groupId } = this.options;

		if (!groupId) {
			throw new KafkaClientError(
				"groupId must be provided in KafkaConsumerServiceOptions",
				"INVALID_CONSUMER_OPTIONS"
			);
		}

		try {
			const kafkaClient = this.kafkaClientService.getClient();

			// Создаем НОВЫЙ consumer для этого модуля с уникальным groupId
			// Используем публичный API вместо доступа к приватным полям
			this.consumer = kafkaClient.createConsumer(groupId);

			await this.consumer.connect();

			// Подписываемся на топики
			await this.subscribeToTopics();

			this.logger.log(
				`Kafka Consumer initialized and subscribed to topics: ${this.options.topics.join(", ")}`
			);
		} catch (error: Error | unknown) {
			const kafkaError = KafkaClientError.fromError(error, "Failed to initialize Kafka Consumer");
			this.logger.error("Failed to initialize Kafka Consumer", kafkaError.stack);
			throw kafkaError;
		}
	}

	// Подписка на топики
	private async subscribeToTopics(): Promise<void> {
		if (!this.consumer) {
			throw new KafkaClientError("Kafka consumer not initialized", "CONSUMER_NOT_INITIALIZED");
		}

		// Подписываемся на топики
		await this.consumer.subscribe({
			topics: this.options.topics,
			fromBeginning: false,
		});

		// Обработка сообщений
		await this.consumer.run({
			eachMessage: async (payload: EachMessagePayload) => {
				await this.handleMessage(payload);
			},
		});
	}

	// Обработка входящего сообщения
	private async handleMessage(payload: EachMessagePayload): Promise<void> {
		const { topic, message } = payload;

		// Получаем correlation-id и reply-to ДО обработки
		const correlationId = this.getHeaderValue(message.headers, "correlation-id");
		const replyTo = this.getHeaderValue(message.headers, "reply-to");

		// Преобразуем заголовки в Record<string, string> для передачи в handler
		const headers: Record<string, string> = {};
		if (message.headers) {
			for (const [key, value] of Object.entries(message.headers)) {
				if (value !== undefined) {
					if (Array.isArray(value)) {
						headers[key] = typeof value[0] === "string" ? value[0] : value[0]?.toString() || "";
					} else {
						headers[key] = typeof value === "string" ? value : value.toString();
					}
				}
			}
		}

		try {
			if (!message.value) {
				this.logger.warn("Received empty message");
				return;
			}

			// Парсим сообщение
			const parsedMessage = JSON.parse(message.value.toString());

			this.logger.log(`Processing message from topic ${topic}`);

			// Делегируем обработку handler'у с заголовками
			const response = await this.messageHandler.handleMessage(topic, parsedMessage, headers);

			// Если есть reply-to, отправляем ответ
			if (correlationId && replyTo) {
				await this.sendResponse(replyTo, correlationId, {
					success: true,
					data: response,
					timestamp: Date.now(),
				});
			}

			this.logger.log(`Successfully processed message from topic ${topic}`);
		} catch (error: Error | unknown) {
			this.logger.error(
				`Error processing message from topic ${topic}`,
				error instanceof Error ? error.stack : undefined
			);

			// Отправляем ответ с ошибкой, если возможно
			if (correlationId && replyTo) {
				try {
					// Извлекаем statusCode из RPC ошибки
					let statusCode = 500;
					let errorName = "InternalServerError";
					let errorMessage = "Unknown error occurred";

					if (error instanceof RpcException) {
						const errorData = error.getError();

						if (typeof errorData === "object" && errorData !== null) {
							if ("statusCode" in errorData) {
								statusCode = (errorData as { statusCode: number }).statusCode;
							}
							if ("error" in errorData) {
								errorName = (errorData as { error: string }).error;
							}
							if ("message" in errorData) {
								errorMessage = (errorData as { message: string }).message;
							}
						} else if (typeof errorData === "string") {
							errorMessage = errorData;
						}
					} else if (error instanceof Error) {
						errorName = error.name;
						errorMessage = error.message;

						if (typeof error === "object" && error !== null && "statusCode" in error) {
							statusCode = (error as { statusCode: number }).statusCode;
						}
					}

					await this.sendResponse(replyTo, correlationId, {
						success: false,
						statusCode,
						error: errorName,
						message: errorMessage,
						timestamp: Date.now(),
					});
				} catch (sendError: Error | unknown) {
					const kafkaError = KafkaClientError.fromError(sendError, "Failed to send error response");
					this.logger.error("Failed to send error response", kafkaError.stack);
				}
			}
		}
	}

	// Отправка ответа обратно в response топик
	private async sendResponse(
		responseTopic: string,
		correlationId: string,
		response: unknown
	): Promise<void> {
		const kafkaClient = this.kafkaClientService.getClient();

		// Отправляем ответ с correlation-id в заголовках
		// Важно: передаем correlation-id как строку, KafkaJS сам преобразует в нужный формат при необходимости
		await kafkaClient.fireAndForget.send(responseTopic as KafkaTopic, response, {
			"correlation-id": correlationId,
		} as IHeaders);
	}

	// Получение значения заголовка как строки
	private getHeaderValue(headers: IHeaders | undefined, key: string): string | undefined {
		if (!headers) {
			return undefined;
		}

		const value = headers[key];
		if (!value) {
			return undefined;
		}

		if (Array.isArray(value)) {
			const firstValue = value[0];
			return typeof firstValue === "string" ? firstValue : firstValue?.toString();
		}

		return typeof value === "string" ? value : value.toString();
	}

	// Отключение от Kafka при остановке модуля
	async onModuleDestroy(): Promise<void> {
		this.logger.log("Disconnecting Kafka Consumer...");

		if (this.consumer) {
			await this.consumer.disconnect();
			this.logger.log("Kafka Consumer disconnected");
		}
	}
}
