import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";

import { CreateOrderDto } from "../dtos/create-order-dto";
import type { Order } from "../entities/order-entity";
import { OrderService } from "../services/order-service";

@Controller("orders")
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateOrderDto): { item: Order } {
    return { item: this.orderService.create(dto) };
  }

  @Get()
  findAll(): { items: Order[] } {
    return { items: this.orderService.findAll() };
  }

  @Get(":id")
  findOne(@Param("id") id: string): { item: Order } {
    return { item: this.orderService.findOne(id) };
  }
}
