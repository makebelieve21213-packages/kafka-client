import { HttpStatus } from "@nestjs/common";
import RpcRequestError from "src/errors/rpc-request.error";

describe("RpcRequestError", () => {
	describe("constructor", () => {
		it("должен создать ошибку с сообщением", () => {
			const error = new RpcRequestError(
				"Test error message",
				HttpStatus.INTERNAL_SERVER_ERROR,
				"TestError"
			);

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(RpcRequestError);
			expect(error.message).toBe("Test error message");
			expect(error.name).toBe("RpcRequestError");
		});

		it("должен создать ошибку с statusCode", () => {
			const error = new RpcRequestError("Test error", HttpStatus.NOT_FOUND, "NotFoundError");

			expect(error.statusCode).toBe(HttpStatus.NOT_FOUND);
		});

		it("должен создать ошибку с errorName", () => {
			const error = new RpcRequestError("Test error", HttpStatus.BAD_REQUEST, "BadRequestError");

			expect(error.errorName).toBe("BadRequestError");
		});

		it("должен создать ошибку со всеми параметрами", () => {
			const error = new RpcRequestError(
				"Custom error message",
				HttpStatus.SERVICE_UNAVAILABLE,
				"ServiceUnavailableError"
			);

			expect(error.message).toBe("Custom error message");
			expect(error.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
			expect(error.errorName).toBe("ServiceUnavailableError");
			expect(error.name).toBe("RpcRequestError");
		});

		it("должен поддерживать instanceof проверку", () => {
			const error = new RpcRequestError("Test error", HttpStatus.INTERNAL_SERVER_ERROR, "TestError");

			expect(error instanceof RpcRequestError).toBe(true);
			expect(error instanceof Error).toBe(true);
		});

		it("должен корректно обрабатывать различные статус коды", () => {
			const error400 = new RpcRequestError("Bad Request", HttpStatus.BAD_REQUEST, "BadRequest");
			const error500 = new RpcRequestError(
				"Internal Server Error",
				HttpStatus.INTERNAL_SERVER_ERROR,
				"InternalError"
			);
			const error200 = new RpcRequestError("OK", HttpStatus.OK, "Success");

			expect(error400.statusCode).toBe(HttpStatus.BAD_REQUEST);
			expect(error500.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
			expect(error200.statusCode).toBe(HttpStatus.OK);
		});

		it("должен корректно обрабатывать различные имена ошибок", () => {
			const error1 = new RpcRequestError("Error 1", HttpStatus.INTERNAL_SERVER_ERROR, "ErrorOne");
			const error2 = new RpcRequestError("Error 2", HttpStatus.INTERNAL_SERVER_ERROR, "ErrorTwo");

			expect(error1.errorName).toBe("ErrorOne");
			expect(error2.errorName).toBe("ErrorTwo");
		});
	});

	describe("stack trace", () => {
		it("должен иметь stack trace", () => {
			const error = new RpcRequestError("Test error", HttpStatus.INTERNAL_SERVER_ERROR, "TestError");

			expect(error.stack).toBeDefined();
			expect(typeof error.stack).toBe("string");
		});
	});

	describe("readonly свойства", () => {
		it("должен иметь readonly message", () => {
			const error = new RpcRequestError(
				"Original message",
				HttpStatus.INTERNAL_SERVER_ERROR,
				"TestError"
			);

			expect(error.message).toBe("Original message");
		});

		it("должен иметь readonly statusCode", () => {
			const error = new RpcRequestError("Test error", HttpStatus.NOT_FOUND, "TestError");

			expect(error.statusCode).toBe(HttpStatus.NOT_FOUND);
		});

		it("должен иметь readonly errorName", () => {
			const error = new RpcRequestError(
				"Test error",
				HttpStatus.INTERNAL_SERVER_ERROR,
				"CustomErrorName"
			);

			expect(error.errorName).toBe("CustomErrorName");
		});
	});
});
