# Changelog

Все значимые изменения в этом проекте будут документироваться в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
и этот проект придерживается [Semantic Versioning](https://semver.org/lang/ru/).

## [1.1.0] - 2025-01-27

### Добавлено
- Добавлен метод `forRoot()` в `KafkaConsumerModule` для регистрации модуля с прямыми опциями
- Реализована ленивая инициализация handler'а в `onModuleInit()` для корректной работы с `forwardRef`
- Handler теперь получает зависимости корректно, так как `ModuleRef.get()` вызывается после инициализации всех модулей

### Исправлено
- Исправлена проблема с пустыми зависимостями в handler при использовании `forRootAsync` с `forwardRef`

## [1.0.3] - 2025-01-27

### Исправлено
- Исправлена инжекция LoggerService в KafkaConsumerService - теперь LoggerService инжектируется через конструктор вместо создания через `new Logger()`
- KafkaConsumerService теперь использует единообразный подход к инжекции зависимостей, как и KafkaProducerService и KafkaClientService

## [1.0.2] - 2025-01-27

### Исправлено
- Исправлена инжекция зависимостей в messageHandler через использование ModuleRef вместо прямого создания экземпляра через `new`
- Теперь messageHandler корректно получает зависимости из DI контейнера NestJS (LoggerService, KafkaConsumerService и т.д.)

### Добавлено
- Добавлена зависимость `@nestjs/core` в dependencies и peerDependencies

## [1.0.1] - 2025-11-23

### Изменено
- Обновлена документация в README и llms.txt
- Улучшены примеры использования модулей

## [1.0.0] - 2025-11-19

### Добавлено
- Базовая функциональность Kafka клиента для NestJS
- Поддержка паттерна Fire-and-Forget для отправки сообщений без ожидания ответа
- Поддержка паттерна Request-Reply для отправки запросов с ожиданием ответа через correlation ID
- Retry механизм с автоматическими повторными попытками и exponential backoff
- Dead Letter Queue (DLQ) для обработки сообщений, которые не удалось обработать
- NestJS модули: KafkaClientModule, KafkaProducerModule, KafkaConsumerModule
- Низкоуровневый API через KafkaCore для сложных сценариев
- Graceful shutdown для корректного отключения при остановке приложения
- 100% покрытие тестами
- Полная типизация TypeScript
- Поддержка кастомных обработчиков retry и DLQ
- Конфигурируемые опции для всех модулей

### Документация
- Подробный README с примерами использования
- llms.txt для контекста ИИ агентов
- Инструкции по развертыванию в Docker
- Руководство по внесению вклада (CONTRIBUTING.md)
