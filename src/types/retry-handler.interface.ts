// Опции для RetryHandler
export interface RetryHandlerOptions {
	// Максимальное количество попыток
	maxRetries: number;
	// Базовая задержка между попытками в мс
	baseDelay: number;
	// Использовать exponential backoff
	useExponentialBackoff: boolean;
}
