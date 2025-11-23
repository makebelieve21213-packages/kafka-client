import type { LoggerService } from "@makebelieve21213-packages/logger";
import type { Producer } from "kafkajs";
import type { InternalKafkaMessage } from "src/types/kafka-message";
import type { RetryHandlerOptions } from "src/types/retry-handler.interface";

/**
 * Handler для обработки retry логики и отправки в DLQ
 * Реализует механизм повторных попыток с exponential backoff
 */
export default class RetryHandler {
	private readonly maxRetries: number;
	private readonly baseDelay: number;
	private readonly useExponentialBackoff: boolean;

	constructor(
		private readonly producer: Producer,
		private readonly logger: LoggerService,
		private readonly options: Partial<RetryHandlerOptions> = {}
	) {
		this.logger.setContext(RetryHandler.name);

		this.maxRetries = this.options.maxRetries || 3;
		this.baseDelay = this.options.baseDelay || 1000;
		this.useExponentialBackoff = this.options.useExponentialBackoff !== false;
	}

	// Обработка ошибки: retry или DLQ
	async handleError(
		originalTopic: string,
		message: InternalKafkaMessage,
		error: Error
	): Promise<void> {
		const retryCount = this.getRetryCount(message);

		if (retryCount < this.maxRetries) {
			await this.sendToRetry(originalTopic, message, error, retryCount);
		} else {
			await this.sendToDLQ(originalTopic, message, error);
		}
	}

	// Отправка сообщения обратно в топик для retry
	private async sendToRetry(
		topic: string,
		message: InternalKafkaMessage,
		error: Error,
		currentRetryCount: number
	): Promise<void> {
		const newRetryCount = currentRetryCount + 1;
		const delay = this.calculateDelay(newRetryCount);

		// Добавляем небольшую задержку перед retry
		if (delay) {
			await this.sleep(delay);
		}

		await this.producer.send({
			topic,
			messages: [
				{
					key: message.key,
					value: message.value,
					headers: {
						...message.headers,
						"retry-count": newRetryCount.toString(),
						"retry-timestamp": Date.now().toString(),
						"last-error": error.message,
					},
				},
			],
		});

		this.logger.log(`Retry ${newRetryCount}/${this.maxRetries} for message in topic ${topic}`);
	}

	// Отправка сообщения в Dead Letter Queue
	private async sendToDLQ(
		originalTopic: string,
		message: InternalKafkaMessage,
		error: Error
	): Promise<void> {
		const dlqTopic = `${originalTopic}.dlq`;

		await this.producer.send({
			topic: dlqTopic,
			messages: [
				{
					key: message.key,
					value: message.value,
					headers: {
						...message.headers,
						"original-topic": originalTopic,
						error: error.message,
						"error-stack": error.stack || "",
						"failed-at": Date.now().toString(),
						"total-retries": this.maxRetries.toString(),
					},
				},
			],
		});

		this.logger.error(`Message moved to DLQ: ${dlqTopic}. Error: ${error.message}`);
	}

	// Получить текущий счетчик retry из headers
	private getRetryCount(message: InternalKafkaMessage): number {
		const retryCountHeader = message.headers?.["retry-count"];

		if (!retryCountHeader) {
			return 0;
		}

		const retryCountStr =
			typeof retryCountHeader === "string" ? retryCountHeader : retryCountHeader.toString();

		return parseInt(retryCountStr, 10) || 0;
	}

	// Вычислить задержку для retry с exponential backoff
	private calculateDelay(retryCount: number): number {
		if (!this.useExponentialBackoff) {
			return this.baseDelay;
		}

		// Exponential backoff: baseDelay * 2^(retryCount - 1)
		return this.baseDelay * Math.pow(2, retryCount - 1);
	}

	// Утилита для задержки
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
