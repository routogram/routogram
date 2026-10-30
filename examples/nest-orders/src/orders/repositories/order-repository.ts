import { Injectable } from "@nestjs/common";

import type { Order, Product } from "../entities/order-entity";

const INITIAL_PRODUCTS: Product[] = [
  { id: "gpu-5090", name: "RTX 5090 Founders Edition", price: 1999 },
  { id: "cpu-9950x3d", name: "Ryzen 9 9950X3D", price: 699 },
  { id: "ram-64gb", name: "64GB DDR5-6400 Kit", price: 249 },
];

@Injectable()
export class OrderRepository {
  private readonly orders = new Map<string, Order>();
  private readonly products = new Map<string, Product>(
    INITIAL_PRODUCTS.map((product) => [product.id, { ...product }]),
  );

  findProduct(productId: string): Product | undefined {
    return this.products.get(productId);
  }

  save(order: Order): Order {
    this.orders.set(order.id, order);
    return order;
  }

  findById(id: string): Order | undefined {
    return this.orders.get(id);
  }

  findAll(): Order[] {
    return [...this.orders.values()].sort((left, right) =>
      right.created_at.localeCompare(left.created_at),
    );
  }
}
