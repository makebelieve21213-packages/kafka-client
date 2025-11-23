import { randomUUID } from "crypto";

import type { LoggerService } from "@makebelieve21213-packages/logger";
import type { Producer, IHeaders } from "kafkajs";
import type { KafkaTopic } from "src/types/kafka-topics";

/**
 * Fire-and-Forget паттерн
 * Отправка сообщения без ожидания ответа
 */
export default class FireAndForgetPattern {
	constructor(
		private readonly producer: Producer,
		private readonly logger: LoggerService
	) {
		this.logger.setContext(FireAndForgetPattern.name);
	}

	// Отправить сообщение в топик (без ожидания ответа)
	async send<T>(topic: KafkaTopic, message: T, customHeaders?: IHeaders): Promise<void> {
		const messageId = randomUUID();

		/**
		 * Проверяем, есть ли correlation-id в customHeaders
		 * Если есть - это ответ на Request-Reply запрос
		 * Проверяем регистронезависимо и учитываем возможные форматы IHeaders
		 */
		let hasCorrelationId = false;

		if (customHeaders) {
			const headerKeys = Object.keys(customHeaders);
			const correlationIdKey = headerKeys.find((key) => key.toLowerCase() === "correlation-id");

			if (correlationIdKey) {
				const value = customHeaders[correlationIdKey];

				hasCorrelationId =
					value !== undefined &&
					value !== null &&
					!(Array.isArray(value) && !value.length) &&
					!(Buffer.isBuffer(value) && !value.length);
			}
		}

		const messageType = hasCorrelationId ? "request-reply" : "fire-and-forget";

		/**
		 * Формируем заголовки: базовые + кастомные
		 * Обрабатываем кастомные заголовки, преобразуя Buffer в строки если необходимо
		 */
		const headers: Record<string, string | Buffer> = {
			"message-id": messageId,
			"message-type": messageType,
			timestamp: Date.now().toString(),
		};

		// Добавляем кастомные заголовки, правильно обрабатывая Buffer значения
		if (customHeaders) {
			for (const [key, value] of Object.entries(customHeaders)) {
				if (value !== undefined && value !== null) {
					// Если значение - массив, берем первый элемент
					if (Array.isArray(value)) {
						const firstValue = value[0];

						// Преобразуем Buffer в строку для корректной передачи
						if (Buffer.isBuffer(firstValue)) {
							headers[key] = firstValue.toString("utf-8");
						} else {
							headers[key] = typeof firstValue === "string" ? firstValue : String(firstValue);
						}
					} else if (Buffer.isBuffer(value)) {
						// Преобразуем Buffer в строку для корректной передачи
						headers[key] = value.toString("utf-8");
					} else {
						headers[key] = typeof value === "string" ? value : String(value);
					}
				}
			}
		}

		await this.producer.send({
			topic: topic.toString(),
			messages: [
				{
					key: messageId,
					value: JSON.stringify(message),
					headers,
				},
			],
		});

		this.logger.log(`Sent message ${messageId} to topic ${topic}`);
	}

	// Отправить множество сообщений в топик (batch)
	async sendBatch<T>(topic: KafkaTopic, messages: T[]): Promise<void> {
		const kafkaMessages = messages.map((message) => {
			const messageId = randomUUID();

			return {
				key: messageId,
				value: JSON.stringify(message),
				headers: {
					"message-id": messageId,
					"message-type": "fire-and-forget",
					timestamp: Date.now().toString(),
				},
			};
		});

		await this.producer.send({
			topic: topic.toString(),
			messages: kafkaMessages,
		});

		this.logger.log(`Sent ${messages.length} messages to topic ${topic}`);
	}
}
