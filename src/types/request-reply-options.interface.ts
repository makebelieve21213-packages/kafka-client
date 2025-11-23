// Опции для Request-Reply паттерна
export interface RequestReplyOptions {
	// Timeout для ожидания ответа в мс
	defaultTimeout: number;
	// Consumer group ID
	groupId: string;
}
