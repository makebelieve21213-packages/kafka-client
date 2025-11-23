import KafkaClientError from "src/errors/kafka-client.error";

import type { LoggerService } from "@makebelieve21213-packages/logger";
import type { Consumer, EachMessagePayload, IHeaders } from "kafkajs";
import type { DLQHandlerOptions, DLQMessageCallback } from "src/types/dlq-handler.interface";
import type { KafkaTopic } from "src/types/kafka-topics";

/**
 * Handler для слушания Dead Letter Queue
 * Используется для мониторинга и обработки неудачных сообщений
 */
export default class DLQHandler {
	private readonly onMessage: DLQMessageCallback;
	private isRunning = false;

	constructor(
		private readonly consumer: Consumer,
		private readonly options: DLQHandlerOptions,
		private readonly logger: LoggerService
	) {
		this.logger.setContext(DLQHandler.name);
		this.onMessage = this.options.onMessage;
	}

	// Начать слушать DLQ топики
	async start(dlqTopics: KafkaTopic[]): Promise<void> {
		if (this.isRunning) {
			this.logger.warn("Already running");
			return;
		}

		const topics = dlqTopics.map((topic) => topic.toString());

		await this.consumer.subscribe({
			topics,
			fromBeginning: false,
		});

		await this.consumer.run({
			eachMessage: async (payload: EachMessagePayload) => {
				await this.handleDLQMessage(payload);
			},
		});

		this.isRunning = true;
		this.logger.log(`Started listening to DLQ topics: ${topics.join(", ")}`);
	}

	// Остановить слушание DLQ
	async stop(): Promise<void> {
		if (!this.isRunning) {
			return;
		}

		await this.consumer.disconnect();
		this.isRunning = false;
		this.logger.log("Stopped");
	}

	// Обработка сообщения из DLQ
	private async handleDLQMessage(payload: EachMessagePayload): Promise<void> {
		const { topic, partition, message } = payload;

		try {
			/* istanbul ignore next */
			const headers = message.headers || {};

			const originalTopic = this.getHeaderValue(headers, "original-topic") || "unknown";
			const error = this.getHeaderValue(headers, "error") || "Unknown error";
			const errorStack = this.getHeaderValue(headers, "error-stack") || "";
			const failedAt = parseInt(this.getHeaderValue(headers, "failed-at") || "0", 10);
			const totalRetries = parseInt(this.getHeaderValue(headers, "total-retries") || "0", 10);

			// Преобразуем IHeaders в Record<string, Buffer | string>
			const simplifiedHeaders = this.simplifyHeaders(headers);

			await this.onMessage({
				topic,
				partition,
				message: {
					key: message.key,
					value: message.value,
					headers: simplifiedHeaders,
					offset: message.offset,
				},
				originalTopic,
				error,
				errorStack,
				failedAt,
				totalRetries,
			});

			this.logger.log(`Processed DLQ message from topic ${originalTopic}, offset ${message.offset}`);
		} catch (error: Error | unknown) {
			const kafkaError = KafkaClientError.fromError(error, "Error processing DLQ message");
			this.logger.error("Error processing DLQ message", kafkaError.stack);
			// Не бросаем ошибку наверх, чтобы не прерывать обработку других сообщений
		}
	}

	// Получить значение header как строку из IHeaders
	private getHeaderValue(headers: IHeaders, key: string): string | undefined {
		const value = headers[key];

		if (!value) {
			return undefined;
		}

		// IHeaders может содержать string | Buffer | (string | Buffer)[]
		if (Array.isArray(value)) {
			// Берем первый элемент, если это массив
			const firstValue = value[0];
			return typeof firstValue === "string" ? firstValue : firstValue?.toString();
		}

		return typeof value === "string" ? value : value.toString();
	}

	// Упростить IHeaders до Record<string, Buffer | string>
	private simplifyHeaders(headers: IHeaders): Record<string, Buffer | string> {
		const result: Record<string, Buffer | string> = {};

		for (const [key, value] of Object.entries(headers)) {
			if (!value) {
				continue;
			}

			if (Array.isArray(value)) {
				// Берем первый элемент, если это массив
				const firstValue = value[0];
				if (firstValue) {
					result[key] = firstValue;
				}
			} else {
				result[key] = value;
			}
		}

		return result;
	}
}
