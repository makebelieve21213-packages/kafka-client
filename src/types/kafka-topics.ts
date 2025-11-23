/**
 * Перечисление всех Kafka топиков в проекте
 * Используется для типобезопасности при работе с Kafka
 */
export enum KafkaTopic {
	// Bybit Dashboard топики
	DASHBOARD_BYBIT_COMMANDS = "dashboard-bybit-commands",
	DASHBOARD_BYBIT_RESPONSES = "dashboard-bybit-responses",
	DASHBOARD_BYBIT_DLQ = "dashboard-bybit-dlq",

	// Alerts топики
	DASHBOARD_ALERTS_COMMANDS = "dashboard-alerts-commands",
	DASHBOARD_ALERTS_RESPONSES = "dashboard-alerts-responses",
	DASHBOARD_ALERTS_EVENTS = "dashboard-alerts-events",
	DASHBOARD_ALERTS_DLQ = "dashboard-alerts-dlq",

	// Settings топики
	DASHBOARD_SETTINGS_COMMANDS = "dashboard-settings-commands",
	DASHBOARD_SETTINGS_RESPONSES = "dashboard-settings-responses",
	DASHBOARD_SETTINGS_DLQ = "dashboard-settings-dlq",

	// Chat топики
	CHAT_SERVICE_COMMANDS = "chat-service-commands",
	CHAT_SERVICE_RESPONSES = "chat-service-responses",
	// Опциональный топик для streaming chunks
	CHAT_SERVICE_STREAMING = "chat-service-streaming",
	CHAT_SERVICE_DLQ = "chat-service-dlq",

	// MCP топики
	MCP_TOOLS_COMMANDS = "mcp-tools-commands",
	MCP_TOOLS_RESPONSES = "mcp-tools-responses",
	MCP_TOOLS_DLQ = "mcp-tools-dlq",

	// Системные топики
	SYSTEM_ERRORS = "system-errors",
}

// Конфигурация топика
export interface TopicConfig {
	partitions: number;
	retentionHours: number;
	description: string;
}

// Конфигурация топиков с настройками
export const KAFKA_TOPIC_CONFIG: Record<KafkaTopic, TopicConfig> = {
	[KafkaTopic.DASHBOARD_BYBIT_COMMANDS]: {
		partitions: 3,
		retentionHours: 168, // 7 дней
		description: "Команды для Bybit дашборда",
	},
	[KafkaTopic.DASHBOARD_BYBIT_RESPONSES]: {
		partitions: 3,
		retentionHours: 24, // 1 день
		description: "Ответы от Bybit дашборда",
	},
	[KafkaTopic.DASHBOARD_BYBIT_DLQ]: {
		partitions: 1,
		retentionHours: 720, // 30 дней
		description: "Dead Letter Queue для Bybit",
	},
	[KafkaTopic.DASHBOARD_ALERTS_COMMANDS]: {
		partitions: 3,
		retentionHours: 168, // 7 дней
		description: "Команды для Alerts сервиса",
	},
	[KafkaTopic.DASHBOARD_ALERTS_RESPONSES]: {
		partitions: 3,
		retentionHours: 24, // 1 день
		description: "Ответы от Alerts сервиса",
	},
	[KafkaTopic.DASHBOARD_ALERTS_EVENTS]: {
		partitions: 3,
		retentionHours: 168, // 7 дней
		description: "События о новых алертах для пользователей",
	},
	[KafkaTopic.DASHBOARD_ALERTS_DLQ]: {
		partitions: 1,
		retentionHours: 720, // 30 дней
		description: "Dead Letter Queue для Alerts",
	},
	[KafkaTopic.DASHBOARD_SETTINGS_COMMANDS]: {
		partitions: 3,
		retentionHours: 168, // 7 дней
		description: "Команды для Settings сервиса",
	},
	[KafkaTopic.DASHBOARD_SETTINGS_RESPONSES]: {
		partitions: 3,
		retentionHours: 24, // 1 день
		description: "Ответы от Settings сервиса",
	},
	[KafkaTopic.DASHBOARD_SETTINGS_DLQ]: {
		partitions: 1,
		retentionHours: 720, // 30 дней
		description: "Dead Letter Queue для Settings",
	},
	[KafkaTopic.CHAT_SERVICE_COMMANDS]: {
		partitions: 3,
		retentionHours: 168, // 7 дней
		description: "Команды для Chat сервиса",
	},
	[KafkaTopic.CHAT_SERVICE_RESPONSES]: {
		partitions: 3,
		retentionHours: 24, // 1 день
		description: "Ответы от Chat сервиса",
	},
	[KafkaTopic.CHAT_SERVICE_STREAMING]: {
		partitions: 3,
		retentionHours: 1, // 1 час (короткое время для streaming chunks)
		description: "Streaming chunks от Chat сервиса (опционально)",
	},
	[KafkaTopic.CHAT_SERVICE_DLQ]: {
		partitions: 1,
		retentionHours: 720, // 30 дней
		description: "Dead Letter Queue для Chat",
	},
	[KafkaTopic.MCP_TOOLS_COMMANDS]: {
		partitions: 3,
		retentionHours: 168, // 7 дней
		description: "Команды для MCP тулзов",
	},
	[KafkaTopic.MCP_TOOLS_RESPONSES]: {
		partitions: 3,
		retentionHours: 24, // 1 день
		description: "Ответы от MCP тулзов",
	},
	[KafkaTopic.MCP_TOOLS_DLQ]: {
		partitions: 1,
		retentionHours: 720, // 30 дней
		description: "Dead Letter Queue для MCP тулзов",
	},
	[KafkaTopic.SYSTEM_ERRORS]: {
		partitions: 1,
		retentionHours: 168, // 7 дней
		description: "Системные ошибки для мониторинга",
	},
};
