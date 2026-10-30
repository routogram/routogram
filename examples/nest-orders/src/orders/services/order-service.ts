import { randomUUID } from "node:crypto";

import { Injectable, NotFoundException } from "@nestjs/common";

import type { CreateOrderDto } from "../dtos/create-order-dto";
import type { Order, OrderItem } from "../entities/order-entity";
import { InsufficientStockException } from "../exceptions/insufficient-stock-exception";
import { OrderRepository } from "../repositories/order-repository";

@Injectable()
export class OrderService {
  constructor(private readonly orderRepository: OrderRepository) {}

  create(dto: CreateOrderDto): Order {
    const quantities = new Map<string, number>();
    for (const item of dto.items) {
      quantities.set(item.product_id, (quantities.get(item.product_id) ?? 0) + item.quantity);
    }

    for (const [productId, quantity] of quantities) {
      const product = this.orderRepository.findProduct(productId);
      if (!product) {
        throw new NotFoundException(`Product ${productId} was not found.`);
      }
      if (quantity > 50) {
        throw new InsufficientStockException(productId, quantity, 50);
      }
    }

    const items: OrderItem[] = [...quantities].map(([productId, quantity]) => {
      const product = this.orderRepository.findProduct(productId);
      if (!product) {
        throw new NotFoundException(`Product ${productId} was not found.`);
      }
      return {
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: product.price,
        subtotal: product.price * quantity,
      };
    });

    const totalAmount = items.reduce((total, item) => total + item.subtotal, 0);
    const order: Order = {
      id: randomUUID(),
      customer_id: dto.customer_id,
      items,
      total_amount: totalAmount,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    return this.orderRepository.save(order);
  }

  findAll(): Order[] {
    return this.orderRepository.findAll();
  }

  findOne(id: string): Order {
    const order = this.orderRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order ${id} was not found.`);
    }
    return order;
  }
}
