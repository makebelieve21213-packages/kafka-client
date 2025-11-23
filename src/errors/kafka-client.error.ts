/**
 * Базовый класс ошибки для пакета kafka-client
 * Предоставляет единый интерфейс для всех ошибок, возникающих в пакете
 */
export default class KafkaClientError extends Error {
	constructor(
		readonly message: string,
		readonly code?: string,
		readonly details?: Record<string, unknown>
	) {
		super(message);

		this.name = "KafkaClientError";

		// Поддержка правильного цепочки прототипов для instanceof
		Object.setPrototypeOf(this, KafkaClientError.prototype);
	}

	// Проверяет, является ли ошибка экземпляром KafkaClientError
	static isKafkaClientError(error: unknown): error is KafkaClientError {
		return error instanceof KafkaClientError;
	}

	// Преобразует любую ошибку в KafkaClientError
	static fromError(error: unknown, defaultMessage = "Unknown error occurred"): KafkaClientError {
		if (KafkaClientError.isKafkaClientError(error)) {
			return error;
		}

		if (error instanceof Error) {
			return new KafkaClientError(error.message, undefined, {
				originalError: error.name,
				stack: error.stack,
			});
		}

		return new KafkaClientError(typeof error === "string" ? error : defaultMessage, undefined, {
			originalError: error,
		});
	}
}
