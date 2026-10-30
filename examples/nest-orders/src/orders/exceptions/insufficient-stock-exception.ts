import { BadRequestException } from "@nestjs/common";

export class InsufficientStockException extends BadRequestException {
  constructor(productId: string, requested: number, available: number) {
    super({
      statusCode: 400,
      error: "Insufficient Stock",
      message: `Product ${productId} has only ${available} unit(s) available, but ${requested} were requested.`,
      product_id: productId,
      requested,
      available,
    });
  }
}
