// Базовый интерфейс для всех Kafka сообщений
export interface BaseKafkaMessage {
	// Уникальный ID сообщения
	id: string;
	// Временная метка создания сообщения
	timestamp: number;
	// Correlation ID для Request-Reply паттерна
	correlationId?: string;
	// Топик для ответа (если требуется)
	replyTo?: string;
	// Количество попыток обработки
	retryCount?: number;
}

// Заголовки Kafka сообщения
export interface KafkaMessageHeaders {
	// Correlation ID для сопоставления запроса и ответа
	"correlation-id"?: string;
	// Топик для отправки ответа
	"reply-to"?: string;
	// Тип сообщения
	"message-type"?: string;
	// Временная метка
	timestamp?: string;
	// Счетчик попыток обработки
	"retry-count"?: string;
	// Временная метка последней попытки
	"retry-timestamp"?: string;
	// Последняя ошибка
	"last-error"?: string;
	// Исходный топик (для DLQ)
	"original-topic"?: string;
	// Текст ошибки (для DLQ)
	error?: string;
	// Stack trace ошибки (для DLQ)
	"error-stack"?: string;
	// Временная метка отправки в DLQ
	"failed-at"?: string;
	// Общее количество попыток
	"total-retries"?: string;
}

// Успешный ответ на команду
export interface SuccessResponse<T = unknown> {
	success: true;
	data: T;
	timestamp: number;
}

// Ответ с ошибкой
export interface ErrorResponse {
	success: false;
	statusCode: number;
	error: string;
	message: string;
	timestamp: number;
	code?: string;
}

// Общий тип ответа
export type KafkaResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

// Внутреннее представление Kafka сообщения
export interface InternalKafkaMessage {
	key: string | Buffer | null;
	value: string | Buffer;
	headers?: Record<string, string | Buffer>;
	partition?: number;
	offset?: string;
	timestamp?: string;
}

// Pending Request для Request-Reply паттерна
export interface PendingRequest<T = unknown> {
	resolve: (value: T) => void;
	reject: (reason: Error) => void;
	timer: NodeJS.Timeout;
	timestamp: number;
}
