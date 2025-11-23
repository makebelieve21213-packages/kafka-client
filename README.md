# @packages/kafka-client

Полнофункциональный Kafka клиент для NestJS с поддержкой паттернов Fire-and-Forget, Request-Reply, Retry механизмом и Dead Letter Queue (DLQ).

## 📋 Содержание

- [Возможности](#-возможности)
- [Требования](#-требования)
- [Установка](#-установка)
- [Развертывание в Docker](#-развертывание-в-docker)
- [Структура пакета](#-структура-пакета)
- [Быстрый старт](#-быстрый-старт)
- [Использование модулей и сервисов](#-использование-модулей-и-сервисов)
- [API Reference](#-api-reference)
- [Типы и интерфейсы](#-типы-и-интерфейсы)
- [Troubleshooting](#-troubleshooting)
- [Тестирование](#-тестирование)

## 🚀 Возможности

- ✅ **Fire-and-Forget паттерн** - отправка сообщений без ожидания ответа
- ✅ **Request-Reply паттерн** - отправка запросов с ожиданием ответа через correlation ID
- ✅ **Retry механизм** - автоматические повторные попытки с exponential backoff
- ✅ **Dead Letter Queue (DLQ)** - обработка сообщений, которые не удалось обработать
- ✅ **NestJS модули** - готовые глобальные модули для простой интеграции
- ✅ **Низкоуровневый API** - прямой доступ к KafkaCore для сложных сценариев
- ✅ **100% покрытие тестами** - надежность и качество кода
- ✅ **TypeScript типизация** - полная типобезопасность
- ✅ **Graceful shutdown** - корректное отключение при остановке приложения

## 📋 Требования

- **Node.js**: >= 22.11.0
- **pnpm**: >= 10.18.0
- **NestJS**: >= 11.0.0
- **Kafka**: >= 2.0.0 (через kafkajs)

## 📦 Установка

```bash
pnpm install @packages/kafka-client
```

### Зависимости

Пакет требует следующие peer dependencies:

```json
{
  "@nestjs/common": "^11.0.0",
  "@nestjs/microservices": "^11.0.0",
  "kafkajs": "^2.0.0",
  "reflect-metadata": "^0.1.13 || ^0.2.0",
  "rxjs": "^7.0.0"
}
```

## 🐳 Развертывание в Docker

### Dockerfile

Пакет включает готовый Dockerfile для сборки образа:

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:22-alpine AS production
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate && \
    pnpm install --frozen-lockfile --prod
COPY --from=base /app/dist ./dist
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs
CMD ["node", "dist/index.js"]
```

### Сборка образа

```bash
docker build -t kafka-client:latest .
```

### Использование в docker-compose.yml

```yaml
version: '3.8'

services:
  kafka:
    image: confluentinc/cp-kafka:latest
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    ports:
      - "9092:9092"

  api-service:
    build: .
    environment:
      KAFKA_BROKERS: kafka:9092
      KAFKA_CLIENT_ID: api-service
    depends_on:
      - kafka
```

## 📁 Структура пакета

```
src/
├── core/                          # Низкоуровневый API
│   ├── kafka.core.ts              # Основной класс KafkaCore
│   ├── patterns/                  # Паттерны отправки сообщений
│   │   ├── fire-and-forget.pattern.ts    # Fire-and-Forget паттерн
│   │   └── request-reply.pattern.ts      # Request-Reply паттерн
│   └── retry/                     # Retry и DLQ механизмы
│       ├── retry-handler.ts       # Обработка retry
│       └── dlq-handler.ts         # Обработка DLQ
│
├── main/                          # NestJS модули (РЕКОМЕНДУЕТСЯ)
│   ├── client/                    # Базовый модуль подключения
│   │   ├── kafka-client.module.ts # KafkaClientModule
│   │   └── kafka-client.service.ts # KafkaClientService
│   ├── producer/                  # Producer модуль
│   │   ├── kafka-producer.module.ts # KafkaProducerModule
│   │   └── kafka-producer.service.ts # KafkaProducerService
│   └── consumer/                  # Consumer модуль
│       ├── kafka-consumer.module.ts # KafkaConsumerModule
│       └── kafka-consumer.service.ts # KafkaConsumerService
│
├── types/                         # TypeScript типы и интерфейсы
│   ├── kafka-topics.ts           # Enum топиков и конфигурация
│   ├── kafka-message.ts          # Типы сообщений
│   ├── module-options.interface.ts # Опции модулей
│   ├── kafka-core.options.interface.ts # Опции KafkaCore
│   ├── request-reply-options.interface.ts # Опции Request-Reply
│   ├── retry-handler.interface.ts # Опции Retry
│   └── dlq-handler.interface.ts  # Опции DLQ
│
├── errors/                        # Кастомные ошибки
│   ├── kafka-client.error.ts      # KafkaClientError
│   └── rpc-request.error.ts      # RpcRequestError
│
├── utils/                         # Утилиты
│   └── injection-keys.ts         # Ключи для DI
│
└── index.ts                       # Точка входа (экспорты)
```

## 🏗️ Архитектура

Пакет предоставляет **два способа использования**:

### 1. NestJS модули (РЕКОМЕНДУЕТСЯ)

Готовые глобальные модули `KafkaClientModule`, `KafkaProducerModule` и `KafkaConsumerModule` для простой интеграции в NestJS приложения.

**Преимущества:**
- Не нужно дублировать код в каждом сервисе
- Автоматическая инициализация и подключение
- Встроенная интеграция с NestJS DI
- Graceful shutdown
- Единое подключение к Kafka для всего приложения

### 2. Низкоуровневый API

Прямое использование `KafkaCore` для полного контроля над подключением и процессами.

## 🔧 Быстрый старт (NestJS модули)

### Шаг 1: Настройка KafkaClientModule (базовый модуль)

**ВАЖНО:** `KafkaClientModule` должен быть импортирован **ПЕРЕД** `KafkaProducerModule` и `KafkaConsumerModule`.

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaClientModule, KafkaTopic } from '@packages/kafka-client';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [kafkaConfig], // Ваша конфигурация Kafka
    }),
    // Базовый модуль для подключения к Kafka
    KafkaClientModule.forRootAsync<[KafkaConfiguration]>({
      useFactory: (config: KafkaConfiguration) => ({
        brokers: config.brokers,
        clientId: config.clientId,
        responseTopics: [KafkaTopic.DASHBOARD_BYBIT_RESPONSES], // Для Request-Reply
        defaultTimeout: 30000, // Таймаут по умолчанию
        connectionTimeout: 10000, // Таймаут подключения (опционально)
        requestTimeout: 30000, // Таймаут запроса (опционально)
        retry: { // Настройки retry для подключения (опционально)
          retries: 8,
          initialRetryTime: 300,
          maxRetryTime: 30000,
        },
      }),
      inject: [kafkaConfig.KEY],
    }),
  ],
})
export class AppModule {}
```

### Шаг 2: Producer (отправка команд)

**Для api-service** (отправляет команды и ждет ответы):

```typescript
// app.module.ts
import { KafkaProducerModule } from '@packages/kafka-client';

@Module({
  imports: [
    KafkaClientModule.forRootAsync(...), // Из шага 1
    KafkaProducerModule.forRoot(), // Producer модуль
  ],
})
export class AppModule {}
```

```typescript
// bybit.service.ts
import { Injectable } from '@nestjs/common';
import { KafkaProducerService, KafkaTopic, BybitCommandType } from '@packages/kafka-client';

@Injectable()
export class BybitService {
  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  async connect(dto: ConnectDto) {
    // Request-Reply: отправка команды и ожидание ответа
    const response = await this.kafkaProducer.sendCommand(
      KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
      KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
      {
        id: randomUUID(),
        type: BybitCommandType.CONNECT,
        userId: dto.userId,
        payload: {
          apiKey: dto.apiKey,
          apiSecret: dto.apiSecret,
        },
        timestamp: Date.now(),
      },
      30000, // timeout в миллисекундах (опционально)
      { 'user-id': dto.userId } // дополнительные заголовки (опционально)
    );

    return response;
  }

  async sendNotification() {
    // Fire-and-Forget: отправка без ожидания ответа
    await this.kafkaProducer.sendFireAndForget(
      KafkaTopic.DASHBOARD_ALERTS_EVENTS,
      {
        userId: '123',
        alert: { ... },
        timestamp: new Date().toISOString(),
      }
    );
  }
}
```

### Шаг 3: Consumer (обработка команд)

**Для dashboard-service** (принимает команды и отправляет ответы):

```typescript
// app.module.ts
import { KafkaConsumerModule, KafkaTopic } from '@packages/kafka-client';
import { BybitModule } from './bybit/bybit.module';
import { BybitHandlerService } from './bybit-message.handler';

@Module({
  imports: [
    KafkaClientModule.forRootAsync(...), // Из шага 1
    BybitModule, // Модуль с зависимостями handler'а
    KafkaConsumerModule.forRoot({
      topics: [KafkaTopic.DASHBOARD_BYBIT_COMMANDS],
      groupId: 'dashboard-service-bybit-consumer',
      messageHandler: BybitHandlerService,
      imports: [BybitModule], // Дополнительные модули для DI
    }),
  ],
})
export class AppModule {}
```

```typescript
// bybit-message.handler.ts
import { Injectable } from '@nestjs/common';
import { KafkaMessageHandler, BybitCommandType } from '@packages/kafka-client';
import { BybitService } from './bybit.service';
import type { BybitCommand } from '@packages/kafka-client';
import { RpcException } from '@nestjs/microservices';
import { HttpStatus } from '@packages/types';

@Injectable()
export class BybitHandlerService implements KafkaMessageHandler {
  constructor(private readonly bybitService: BybitService) {}

  async handleMessage(
    topic: string, 
    message: unknown, 
    headers?: Record<string, string>
  ): Promise<unknown> {
    const command = message as BybitCommand;

    // Используйте headers для логирования или трейсинга
    const correlationId = headers?.['correlation-id'];
    if (correlationId) {
      this.logger.log(`Processing command with correlation-id: ${correlationId}`);
    }

    switch (command.type) {
      case BybitCommandType.CONNECT:
        return await this.bybitService.connect({
          userId: command.userId,
          apiKey: command.payload.apiKey,
          apiSecret: command.payload.apiSecret,
        });

      case BybitCommandType.GET_BALANCE:
        return await this.bybitService.getBalance(command.payload.accountType);

      default:
        throw new RpcException({
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Unknown command type: ${command.type}`,
          error: 'ValidationError',
        });
    }
  }
}
```

**Готово!** Модуль автоматически:
- Подключится к Kafka при старте
- Начнет слушать топики
- Обработает сообщения через handler
- Отправит ответы обратно (для Request-Reply)
- Отключится при shutdown

## 📚 Использование модулей и сервисов

### KafkaClientModule

**Назначение:** Единое подключение к Kafka для всего приложения.

**Методы инициализации:**

#### `forRoot(options)`

```typescript
KafkaClientModule.forRoot({
  brokers: ['localhost:9093'],
  clientId: 'api-service',
  responseTopics?: [KafkaTopic.DASHBOARD_BYBIT_RESPONSES], // Для Request-Reply
  defaultTimeout?: 30000, // Таймаут по умолчанию (мс)
  connectionTimeout?: 10000, // Таймаут подключения (мс)
  requestTimeout?: 30000, // Таймаут запроса (мс)
  retry?: { // Настройки retry для подключения
    retries?: 8,
    initialRetryTime?: 300,
    maxRetryTime?: 30000,
  },
})
```

#### `forRootAsync(options)`

```typescript
KafkaClientModule.forRootAsync<[KafkaConfiguration]>({
  useFactory: (config: KafkaConfiguration) => ({
    brokers: config.brokers,
    clientId: config.clientId,
    responseTopics: config.responseTopics,
    defaultTimeout: config.defaultTimeout,
    connectionTimeout: config.connectionTimeout,
    requestTimeout: config.requestTimeout,
    retry: config.retry,
  }),
  inject: [kafkaConfig.KEY],
  imports: [ConfigModule],
})
```

**Экспортирует:** `KafkaClientService` (для внутреннего использования)

**ВАЖНО:** Этот модуль должен быть импортирован **ПЕРЕД** `KafkaProducerModule` и `KafkaConsumerModule`.

### KafkaProducerModule

**Назначение:** Модуль для отправки сообщений (Fire-and-Forget и Request-Reply).

**ВАЖНО:** Требует импорта `KafkaClientModule.forRoot()` перед собой.

#### `forRoot()`

```typescript
KafkaProducerModule.forRoot()
```

**Экспортирует:** `KafkaProducerService`

### KafkaProducerService

**Методы:**

#### `sendCommand<TRequest, TResponse>(commandTopic, responseTopic, message, timeout?, additionalHeaders?)`

Request-Reply паттерн - отправка команды с ожиданием ответа.

**Параметры:**
- `commandTopic: KafkaTopic` - топик для отправки команды
- `responseTopic: KafkaTopic` - топик для получения ответа
- `message: TRequest` - сообщение для отправки
- `timeout?: number` - таймаут ожидания ответа в миллисекундах (опционально, по умолчанию 30000)
- `additionalHeaders?: Record<string, string>` - дополнительные заголовки для сообщения (опционально)

**Возвращает:** `Promise<TResponse>`

**Пример:**
```typescript
const response = await kafkaProducer.sendCommand(
  KafkaTopic.DASHBOARD_BYBIT_COMMANDS,
  KafkaTopic.DASHBOARD_BYBIT_RESPONSES,
  command,
  30000, // timeout
  { 'user-id': '123' } // дополнительные заголовки
);
```

#### `sendFireAndForget<T>(topic, message)`

Fire-and-Forget паттерн - отправка сообщения без ожидания ответа.

**Параметры:**
- `topic: KafkaTopic` - топик для отправки
- `message: T` - сообщение для отправки

**Возвращает:** `Promise<void>`

**Пример:**
```typescript
await kafkaProducer.sendFireAndForget(
  KafkaTopic.DASHBOARD_ALERTS_EVENTS,
  { userId: '123', alert: { ... } }
);
```

#### `isConnected()`

Проверка статуса подключения к Kafka.

**Возвращает:** `boolean`

**Пример:**
```typescript
const isConnected = kafkaProducer.isConnected();
console.log(`Kafka connected: ${isConnected}`);
```

### KafkaConsumerModule

**Назначение:** Модуль для получения и обработки сообщений.

**ВАЖНО:** Требует импорта `KafkaClientModule.forRoot()` перед собой.

#### `forRoot(options)`

```typescript
KafkaConsumerModule.forRoot({
  topics: [KafkaTopic.DASHBOARD_BYBIT_COMMANDS],
  groupId: 'dashboard-service-bybit-consumer',
  messageHandler: BybitHandlerService,
  imports?: [BybitModule], // Дополнительные модули для DI
})
```

**Параметры:**
- `topics: KafkaTopic[]` - массив топиков для подписки
- `groupId: string` - уникальный ID consumer group
- `messageHandler: KafkaMessageHandler` - класс handler'а, реализующий интерфейс `KafkaMessageHandler`
- `imports?: Module[]` - дополнительные модули для DI зависимостей handler'а

**Экспортирует:** `KafkaConsumerService`, `messageHandler` (ваш handler)

### KafkaMessageHandler (интерфейс)

Ваш handler должен реализовать этот интерфейс:

```typescript
interface KafkaMessageHandler {
  handleMessage(
    topic: string, 
    message: unknown, 
    headers?: Record<string, string>
  ): Promise<unknown>;
}
```

**Параметры:**
- `topic: string` - название топика, из которого пришло сообщение
- `message: unknown` - распарсенное сообщение (JSON объект)
- `headers?: Record<string, string>` - заголовки сообщения (опционально)

**Возвращаемое значение:**
- Если возвращаете объект → отправится как ответ (Request-Reply)
- Если возвращаете `undefined` → ответ не отправляется (Fire-and-Forget)
- Если выбрасываете `RpcException` → отправится ответ с ошибкой

**Пример использования headers:**
```typescript
async handleMessage(topic: string, message: unknown, headers?: Record<string, string>): Promise<unknown> {
  const correlationId = headers?.['correlation-id'];
  const replyTo = headers?.['reply-to'];
  const userId = headers?.['user-id'];
  
  // Используйте headers для логирования, трейсинга и т.д.
  if (correlationId) {
    this.logger.log(`Processing request with correlation-id: ${correlationId}`);
  }
  
  // ... обработка сообщения
}
```

**Обработка ошибок:**
```typescript
import { RpcException } from '@nestjs/microservices';
import { HttpStatus } from '@packages/types';

throw new RpcException({
  statusCode: HttpStatus.BAD_REQUEST,
  message: 'Invalid API key',
  error: 'ValidationError',
});
```

## 🔧 Настройка переменных окружения

**Для обоих сервисов добавьте в `.env`:**

```env
KAFKA_BROKERS=localhost:9093
KAFKA_CLIENT_ID=api-service  # или dashboard-service
```

**Валидация в `envs-validate.ts`:**

```typescript
const ENVS_VALIDATE = [
  // ...
  "KAFKA_BROKERS",
  "KAFKA_CLIENT_ID",
];
```

## 🎯 Типы топиков

```typescript
enum KafkaTopic {
  // Bybit Dashboard топики
  DASHBOARD_BYBIT_COMMANDS = 'dashboard-bybit-commands',
  DASHBOARD_BYBIT_RESPONSES = 'dashboard-bybit-responses',
  DASHBOARD_BYBIT_DLQ = 'dashboard-bybit-dlq',

  // Alerts топики
  DASHBOARD_ALERTS_COMMANDS = 'dashboard-alerts-commands',
  DASHBOARD_ALERTS_RESPONSES = 'dashboard-alerts-responses',
  DASHBOARD_ALERTS_EVENTS = 'dashboard-alerts-events',
  DASHBOARD_ALERTS_DLQ = 'dashboard-alerts-dlq',

  // Settings топики
  DASHBOARD_SETTINGS_COMMANDS = 'dashboard-settings-commands',
  DASHBOARD_SETTINGS_RESPONSES = 'dashboard-settings-responses',
  DASHBOARD_SETTINGS_DLQ = 'dashboard-settings-dlq',

  // Chat топики
  CHAT_SERVICE_COMMANDS = 'chat-service-commands',
  CHAT_SERVICE_RESPONSES = 'chat-service-responses',
  CHAT_SERVICE_STREAMING = 'chat-service-streaming',
  CHAT_SERVICE_DLQ = 'chat-service-dlq',

  // MCP топики
  MCP_TOOLS_COMMANDS = 'mcp-tools-commands',
  MCP_TOOLS_RESPONSES = 'mcp-tools-responses',
  MCP_TOOLS_DLQ = 'mcp-tools-dlq',

  // Системные топики
  SYSTEM_ERRORS = 'system-errors',
}
```

### Конфигурация топиков

Каждый топик имеет конфигурацию с настройками партиций и retention:

```typescript
const KAFKA_TOPIC_CONFIG: Record<KafkaTopic, TopicConfig> = {
  [KafkaTopic.DASHBOARD_BYBIT_COMMANDS]: {
    partitions: 3,
    retentionHours: 168, // 7 дней
    description: "Команды для Bybit дашборда",
  },
  // ... другие топики
};
```

## 🧪 Как работает Request-Reply

1. **api-service** → отправляет команду с `correlation-id` в `dashboard-bybit-commands`
2. **dashboard-service** → получает команду, обрабатывает через `handleMessage()`
3. **dashboard-service** → отправляет ответ с тем же `correlation-id` в `dashboard-bybit-responses`
4. **api-service** → получает ответ и возвращает через Promise

**Автоматически:**
- Генерация `correlation-id`
- Добавление headers (`correlation-id`, `reply-to`, `message-type`, `timestamp`, а также дополнительные заголовки из `additionalHeaders`)
- Преобразование заголовков Kafka в `Record<string, string>` для передачи в handler
- Timeout обработка
- Отправка ответа с правильным `correlation-id`
- Обработка ошибок через `RpcException` с извлечением `statusCode`

## 📖 Низкоуровневый API (для reference)

Если нужен прямой доступ к `KafkaCore`:

```typescript
import { KafkaCore } from '@packages/kafka-client';
import { LoggerService } from '@makebelieve21213-packages/logger';

const kafkaCore = new KafkaCore(
  {
    kafka: {
      clientId: 'api-service',
      brokers: ['kafka:9092'],
    },
    requestReply: {
      defaultTimeout: 30000,
      groupId: 'api-service-consumer',
    },
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      useExponentialBackoff: true,
    },
    dlq: {
      onMessage: async (payload) => {
        console.error('DLQ:', payload);
      },
      groupId: 'api-service-dlq-consumer',
    },
  },
  logger
);

await kafkaCore.connect();

// Fire-and-Forget
await kafkaCore.fireAndForget.send(KafkaTopic.DASHBOARD_BYBIT_COMMANDS, message);

// Request-Reply
kafkaCore.initRequestReply([KafkaTopic.DASHBOARD_BYBIT_RESPONSES]);
await kafkaCore.requestReply!.startListening();
const response = await kafkaCore.requestReply!.send(
  commandTopic, 
  responseTopic, 
  message,
  30000, // timeout (опционально)
  { 'user-id': '123' } // дополнительные заголовки (опционально)
);
```

## 🧪 Тестирование

Пакет имеет **100% покрытие тестами**.

```bash
# Запустить тесты
pnpm test

# Запустить тесты с покрытием
pnpm test:coverage

# Watch режим
pnpm test:watch
```

## 🚨 Troubleshooting

### Request timeout

**Проблема:** `Request timeout after 30000ms`

**Решение:**
1. Увеличить timeout: `sendCommand(commandTopic, responseTopic, message, 60000)`
2. Проверить, что dashboard-service запущен и слушает топик
3. Проверить, что dashboard-service отправляет ответ с правильным correlation-id
4. Проверить логи consumer'а

### Сообщения не обрабатываются

**Проблема:** Сообщения отправляются, но не обрабатываются

**Решение:**
1. Проверить, что `KafkaClientModule.forRoot()` импортирован перед `KafkaConsumerModule.forRoot()`
2. Проверить, что consumer подписан на правильный топик
3. Проверить, что топик создан в Kafka
4. Проверить логи consumer'а
5. Проверить, что `groupId` уникален

### Request-Reply не инициализирован

**Проблема:** `Kafka Request-Reply not initialized`

**Решение:**
1. Убедиться, что `responseTopics` указаны в `KafkaClientModule.forRoot()`
2. Проверить, что `KafkaClientModule.forRoot()` вызван перед `KafkaProducerModule.forRoot()`

### Handler не получает зависимости

**Проблема:** `Error: Nest can't resolve dependencies`

**Решение:**
1. Добавить необходимые модули в `imports` опции `KafkaConsumerModule.forRoot()`
2. Убедиться, что handler'ы являются `@Injectable()` сервисами

### Проблемы с подключением в Docker

**Проблема:** Не удается подключиться к Kafka из Docker контейнера

**Решение:**
1. Убедиться, что `KAFKA_BROKERS` указывает на правильный адрес (например, `kafka:9092` внутри Docker сети)
2. Увеличить `connectionTimeout` и `requestTimeout` в опциях модуля
3. Проверить настройки retry для подключения
4. Убедиться, что Kafka доступен из контейнера

## 📊 Мониторинг

### Проверка статуса подключения

```typescript
const isConnected = kafkaProducer.isConnected();
console.log(`Kafka connected: ${isConnected}`);
```

### Логирование

Все операции логируются через `LoggerService` из `@makebelieve21213-packages/logger`:
- Отправка команд
- Получение ответов
- Ошибки обработки
- Timeout события

## 🔧 Конфигурация Retry

```typescript
{
  maxRetries: 3,                // Максимум попыток
  baseDelay: 1000,              // Базовая задержка (мс)
  useExponentialBackoff: true   // Exponential backoff
}
```

**Exponential backoff:** `delay = baseDelay * 2^(retryCount - 1)`

Пример:
- 1-я попытка: 1000ms
- 2-я попытка: 2000ms
- 3-я попытка: 4000ms

## 🔧 Конфигурация DLQ

```typescript
{
  onMessage: async (payload) => {
    console.error('DLQ Message:', {
      originalTopic: payload.originalTopic,
      error: payload.error,
      failedAt: new Date(payload.failedAt),
    });
  },
  groupId: 'service-dlq-consumer'
}
```

## 📄 Лицензия

UNLICENSED (private package)

## 👥 Автор

Skryabin Aleksey
