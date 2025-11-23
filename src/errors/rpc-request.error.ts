/**
 * Ошибка RPC запроса с сохранением statusCode
 * Используется для передачи RPC ошибок с HTTP статусами
 */
export default class RpcRequestError extends Error {
	constructor(
		readonly message: string,
		readonly statusCode: number,
		readonly errorName: string
	) {
		super(message);
		this.name = "RpcRequestError";
	}
}
