export class ErrorHttp extends Error {
  constructor(status, message, codigo = null) {
    super(message);
    this.status = status;
    this.codigo = codigo;
  }
}