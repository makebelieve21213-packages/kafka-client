import { LoggerService } from "@makebelieve21213-packages/logger";
import { Injectable } from "@nestjs/common";
import KafkaClientError from "src/errors/kafka-client.error";
import KafkaClientService from "src/main/client/kafka-client.service";
import { KafkaTopic } from "src/types/kafka-topics";

/**
 * Сервис для отправки сообщений через Kafka
 * Поддерживает Request-Reply паттерн
 * Использует единое подключение через KafkaClientService
 */
@Injectable()
export default class KafkaProducerService {
	constructor(
		private readonly kafkaClientService: KafkaClientService,
		private readonly logger: LoggerService
	) {
		this.logger.setContext(KafkaProducerService.name);
	}

	// Отправка сообщения без ожидания ответа (Fire-and-Forget)
	async sendFireAndForget<T>(topic: KafkaTopic, message: T): Promise<void> {
		try {
			const kafkaClient = this.kafkaClientService.getClient();
			await kafkaClient.fireAndForget.send(topic, message);
		} catch (error: Error | unknown) {
			const kafkaError = KafkaClientError.fromError(
				error,
				`Failed to send fire-and-forget message to ${topic}`
			);
			this.logger.error(`Failed to send fire-and-forget message to ${topic}`, kafkaError.stack);
			throw kafkaError;
		}
	}

	// Отправка команды с ожиданием ответа (Request-Reply)
	async sendCommand<TRequest, TResponse>(
		commandTopic: KafkaTopic,
		responseTopic: KafkaTopic,
		message: TRequest,
		timeout?: number,
		additionalHeaders?: Record<string, string>
	): Promise<TResponse> {
		try {
			const kafkaClient = this.kafkaClientService.getClient();

			if (!kafkaClient.requestReply) {
				throw new KafkaClientError(
					"Kafka Request-Reply not initialized",
					"REQUEST_REPLY_NOT_INITIALIZED"
				);
			}

			this.logger.log(`Sending command to ${commandTopic}`);

			const response = await kafkaClient.requestReply.send<TRequest, TResponse>(
				commandTopic,
				responseTopic,
				message,
				timeout,
				additionalHeaders
			);

			this.logger.log(`Received response from ${responseTopic}`);

			return response;
		} catch (error: Error | unknown) {
			const kafkaError = KafkaClientError.fromError(
				error,
				`Failed to send command to ${commandTopic}`
			);
			this.logger.error(`Failed to send command to ${commandTopic}`, kafkaError.stack);
			throw kafkaError;
		}
	}

	// Проверка статуса подключения
	isConnected(): boolean {
		return this.kafkaClientService.isConnected();
	}
}
