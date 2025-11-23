// Колбэк для обработки сообщения из DLQ
export type DLQMessageCallback = (payload: {
	topic: string;
	partition: number;
	message: {
		key: Buffer | null;
		value: Buffer | null;
		headers?: Record<string, Buffer | string>;
		offset: string;
	};
	originalTopic: string;
	error: string;
	errorStack: string;
	failedAt: number;
	totalRetries: number;
}) => Promise<void>;

// Опции для DLQHandler
export interface DLQHandlerOptions {
	// Колбэк для обработки сообщений из DLQ
	onMessage: DLQMessageCallback;
	// Consumer group ID
	groupId?: string;
}
