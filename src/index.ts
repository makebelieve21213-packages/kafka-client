export { default as KafkaClientModule } from "src/main/client/kafka-client.module";
export type {
	KafkaClientModuleOptions,
	KafkaClientModuleAsyncOptions,
} from "src/types/module-options.interface";

export { default as KafkaProducerModule } from "src/main/producer/kafka-producer.module";
export type {
	KafkaProducerModuleOptions,
	KafkaProducerModuleAsyncOptions,
} from "src/types/kafka-producer-module.interface";
export { default as KafkaProducerService } from "src/main/producer/kafka-producer.service";

export { default as KafkaConsumerModule } from "src/main/consumer/kafka-consumer.module";
export type {
	KafkaConsumerModuleOptions,
	KafkaMessageHandler,
} from "src/types/kafka-consumer-module.interface";
export { default as KafkaConsumerService } from "src/main/consumer/kafka-consumer.service";

export { KafkaTopic, KAFKA_TOPIC_CONFIG } from "src/types/kafka-topics";
export type { TopicConfig } from "src/types/kafka-topics";

export { default as RpcRequestError } from "src/errors/rpc-request.error";
export { default as KafkaClientError } from "src/errors/kafka-client.error";
