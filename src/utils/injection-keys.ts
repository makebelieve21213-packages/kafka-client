// Токены для NestJS Dependency Injection
export const KAFKA_CLIENT_OPTIONS = Symbol("KAFKA_CLIENT_OPTIONS");
export const KAFKA_CONSUMER_OPTIONS = Symbol("KAFKA_CONSUMER_OPTIONS");
export const KAFKA_PRODUCER_OPTIONS = Symbol("KAFKA_PRODUCER_OPTIONS");

// Токены для messageHandler в Kafka Consumer модуле
export const KAFKA_MESSAGE_HANDLER_CLASS_TOKEN = Symbol("KAFKA_MESSAGE_HANDLER_CLASS");
export const KAFKA_MESSAGE_HANDLER_INSTANCE_TOKEN = Symbol("KAFKA_MESSAGE_HANDLER_INSTANCE");
