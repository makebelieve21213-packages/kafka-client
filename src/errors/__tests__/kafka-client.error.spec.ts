import KafkaClientError from "src/errors/kafka-client.error";

describe("KafkaClientError", () => {
	describe("constructor", () => {
		it("должен создать ошибку с сообщением", () => {
			const error = new KafkaClientError("Test error message");

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(KafkaClientError);
			expect(error.message).toBe("Test error message");
			expect(error.name).toBe("KafkaClientError");
		});

		it("должен создать ошибку с кодом", () => {
			const error = new KafkaClientError("Test error", "TEST_ERROR_CODE");

			expect(error.code).toBe("TEST_ERROR_CODE");
		});

		it("должен создать ошибку с деталями", () => {
			const details = { field: "value", count: 42 };
			const error = new KafkaClientError("Test error", "TEST_ERROR_CODE", details);

			expect(error.details).toEqual(details);
		});

		it("должен поддерживать instanceof проверку", () => {
			const error = new KafkaClientError("Test error");

			expect(error instanceof KafkaClientError).toBe(true);
			expect(error instanceof Error).toBe(true);
		});
	});

	describe("isKafkaClientError", () => {
		it("должен вернуть true для экземпляра KafkaClientError", () => {
			const error = new KafkaClientError("Test error");

			expect(KafkaClientError.isKafkaClientError(error)).toBe(true);
		});

		it("должен вернуть false для обычного Error", () => {
			const error = new Error("Test error");

			expect(KafkaClientError.isKafkaClientError(error)).toBe(false);
		});

		it("должен вернуть false для не-Error значений", () => {
			expect(KafkaClientError.isKafkaClientError("string")).toBe(false);
			expect(KafkaClientError.isKafkaClientError(null)).toBe(false);
			expect(KafkaClientError.isKafkaClientError(undefined)).toBe(false);
			expect(KafkaClientError.isKafkaClientError(123)).toBe(false);
			expect(KafkaClientError.isKafkaClientError({})).toBe(false);
		});
	});

	describe("fromError", () => {
		it("должен вернуть тот же экземпляр если передан KafkaClientError", () => {
			const originalError = new KafkaClientError("Original error", "ORIGINAL_CODE");
			const convertedError = KafkaClientError.fromError(originalError);

			expect(convertedError).toBe(originalError);
		});

		it("должен преобразовать обычный Error в KafkaClientError", () => {
			const originalError = new Error("Original error message");
			const convertedError = KafkaClientError.fromError(originalError);

			expect(convertedError).toBeInstanceOf(KafkaClientError);
			expect(convertedError.message).toBe("Original error message");
			expect(convertedError.details).toBeDefined();
			expect(convertedError.details?.originalError).toBe("Error");
			expect(convertedError.details?.stack).toBe(originalError.stack);
		});

		it("должен преобразовать строку в KafkaClientError", () => {
			const convertedError = KafkaClientError.fromError("String error");

			expect(convertedError).toBeInstanceOf(KafkaClientError);
			expect(convertedError.message).toBe("String error");
			expect(convertedError.details).toBeDefined();
			expect(convertedError.details?.originalError).toBe("String error");
		});

		it("должен использовать defaultMessage для неизвестных типов", () => {
			const convertedError = KafkaClientError.fromError(123, "Default message");

			expect(convertedError).toBeInstanceOf(KafkaClientError);
			expect(convertedError.message).toBe("Default message");
			expect(convertedError.details).toBeDefined();
			expect(convertedError.details?.originalError).toBe(123);
		});

		it("должен использовать стандартное сообщение по умолчанию", () => {
			const convertedError = KafkaClientError.fromError(null);

			expect(convertedError).toBeInstanceOf(KafkaClientError);
			expect(convertedError.message).toBe("Unknown error occurred");
			expect(convertedError.details?.originalError).toBe(null);
		});
	});

	describe("stack trace", () => {
		it("должен иметь stack trace", () => {
			const error = new KafkaClientError("Test error");

			expect(error.stack).toBeDefined();
			expect(typeof error.stack).toBe("string");
		});
	});
});
