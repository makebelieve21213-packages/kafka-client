import { randomUUID } from "crypto";

import KafkaClientError from "src/errors/kafka-client.error";
import RpcRequestError from "src/errors/rpc-request.error";

import type { LoggerService } from "@makebelieve21213-packages/logger";
import type { Producer, Consumer, KafkaMessage } from "kafkajs";
import type { KafkaResponse, PendingRequest } from "src/types/kafka-message";
import type { KafkaTopic } from "src/types/kafka-topics";
import type { RequestReplyOptions } from "src/types/request-reply-options.interface";

/**
 * Request-Reply паттерн
 * Отправка сообщения с ожиданием ответа
 */
export default class RequestReplyPattern {
	private readonly pendingRequests = new Map<string, PendingRequest>();
	private readonly defaultTimeout: number;
	private isListening = false;

	constructor(
		private readonly producer: Producer,
		private readonly consumer: Consumer,
		private readonly responseTopics: KafkaTopic[],
		private readonly logger: LoggerService,
		private readonly options: Partial<RequestReplyOptions> = {}
	) {
		this.logger.setContext(RequestReplyPattern.name);
		this.defaultTimeout = this.options.defaultTimeout || 30000; // 30 секунд
	}

	// Начать слушать ответы
	async startListening(): Promise<void> {
		if (this.isListening) {
			this.logger.warn("Already listening");
			return;
		}

		const topics = this.responseTopics.map((topic) => topic.toString());

		await this.consumer.subscribe({
			topics,
			fromBeginning: false,
		});

		await this.consumer.run({
			eachMessage: async ({ message }) => {
				await this.handleResponse(message);
			},
		});

		this.isListening = true;
		this.logger.log(`Started listening to response topics: ${topics.join(", ")}`);
	}

	// Остановить слушание ответов
	async stopListening(): Promise<void> {
		if (!this.isListening) {
			return;
		}

		// Отклонить все pending requests
		const error = new KafkaClientError("RequestReply stopped", "REQUEST_REPLY_STOPPED");

		for (const [correlationId, pending] of this.pendingRequests.entries()) {
			clearTimeout(pending.timer);
			pending.reject(error);
			this.pendingRequests.delete(correlationId);
		}

		await this.consumer.disconnect();
		this.isListening = false;
		this.logger.log("Stopped listening");
	}

	// Отправить запрос и дождаться ответа
	async send<TRequest, TResponse>(
		commandTopic: KafkaTopic,
		responseTopic: KafkaTopic,
		message: TRequest,
		timeout?: number,
		additionalHeaders?: Record<string, string>
	): Promise<TResponse> {
		const correlationId = randomUUID();
		const requestTimeout = timeout || this.defaultTimeout;

		// Создаем Promise для ожидания ответа
		const promise = new Promise<TResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pendingRequests.delete(correlationId);
				reject(
					new KafkaClientError(
						`Request timeout after ${requestTimeout}ms for correlationId: ${correlationId}`,
						"REQUEST_TIMEOUT"
					)
				);
			}, requestTimeout);

			this.pendingRequests.set(correlationId, {
				resolve: resolve as (value: unknown) => void,
				reject,
				timer,
				timestamp: Date.now(),
			});
		});

		// Формируем заголовки: базовые + дополнительные
		const headers: Record<string, string> = {
			"correlation-id": correlationId,
			"reply-to": responseTopic.toString(),
			"message-type": "request-reply",
			timestamp: Date.now().toString(),
			...(additionalHeaders || {}),
		};

		// Отправляем команду
		await this.producer.send({
			topic: commandTopic.toString(),
			messages: [
				{
					key: correlationId,
					value: JSON.stringify(message),
					headers,
				},
			],
		});

		this.logger.log(`Sent request with correlationId ${correlationId} to ${commandTopic}`);

		return promise;
	}

	// Обработка ответа из response топика
	private async handleResponse(message: KafkaMessage): Promise<void> {
		if (!message.value) {
			return;
		}

		// Проверяем наличие заголовков и correlation-id
		if (!message.headers) {
			this.logger.warn("Received response without headers");
			return;
		}

		// Проверяем тип сообщения - игнорируем Fire-and-Forget сообщения
		const messageType = message.headers["message-type"];
		const messageTypeStr = Buffer.isBuffer(messageType)
			? messageType.toString("utf-8")
			: String(messageType || "");

		if (messageTypeStr === "fire-and-forget") {
			// Это Fire-and-Forget сообщение, не обрабатываем его в Request-Reply
			return;
		}

		// Пробуем найти correlation-id в разных форматах (регистронезависимо)
		const headerKeys = Object.keys(message.headers);
		const correlationIdKey = headerKeys.find((key) => key.toLowerCase() === "correlation-id");

		if (!correlationIdKey) {
			this.logger.warn(
				`Received response without correlation-id. Available headers: ${headerKeys.join(", ")}`
			);
			return;
		}

		const correlationIdHeader = message.headers[correlationIdKey];
		if (!correlationIdHeader) {
			this.logger.warn("Received response with correlation-id header but value is empty");
			return;
		}

		// Извлекаем correlation-id из заголовка (может быть Buffer или string)
		let correlationId: string;

		if (Buffer.isBuffer(correlationIdHeader)) {
			correlationId = correlationIdHeader.toString("utf-8");
		} else if (typeof correlationIdHeader === "string") {
			correlationId = correlationIdHeader;
		} else if (Array.isArray(correlationIdHeader)) {
			const firstValue = correlationIdHeader[0];
			correlationId = Buffer.isBuffer(firstValue) ? firstValue.toString("utf-8") : String(firstValue);
		} else {
			correlationId = String(correlationIdHeader);
		}

		const pending = this.pendingRequests.get(correlationId);

		if (!pending) {
			this.logger.warn(`No pending request for correlationId: ${correlationId}`);
			return;
		}

		// Нашли ожидающий запрос - возвращаем результат
		clearTimeout(pending.timer);
		this.pendingRequests.delete(correlationId);

		try {
			const response: KafkaResponse = JSON.parse(message.value.toString());

			if (response.success) {
				pending.resolve(response.data);
				this.logger.log(`Received success response for ${correlationId}`);
			} else {
				const errorMessage = response.message || response.error || "Unknown error";
				const statusCode = response.statusCode || 500;
				const errorName = response.error || "InternalServerError";

				// Создаем специальную ошибку с сохранением statusCode
				const rpcError = new RpcRequestError(errorMessage, statusCode, errorName);
				pending.reject(rpcError);
				this.logger.warn(
					`Received error response for ${correlationId}: ${errorMessage} (status: ${statusCode})`
				);
			}
		} catch (error: Error | unknown) {
			const kafkaError = KafkaClientError.fromError(error, "Failed to parse response");
			pending.reject(kafkaError);
			this.logger.error(`Error parsing response for ${correlationId}`, kafkaError.stack);
		}
	}

	// Получить количество ожидающих запросов
	getPendingRequestsCount(): number {
		return this.pendingRequests.size;
	}

	// Очистить старые pending requests (cleanup)
	cleanupOldRequests(maxAge = 60000): number {
		const now = Date.now();
		let cleaned = 0;

		for (const [correlationId, pending] of this.pendingRequests.entries()) {
			if (now - pending.timestamp > maxAge) {
				clearTimeout(pending.timer);
				pending.reject(new KafkaClientError("Request expired", "REQUEST_EXPIRED"));
				this.pendingRequests.delete(correlationId);
				cleaned++;
			}
		}

		if (cleaned) {
			this.logger.log(`Cleaned up ${cleaned} old pending requests`);
		}

		return cleaned;
	}
}
