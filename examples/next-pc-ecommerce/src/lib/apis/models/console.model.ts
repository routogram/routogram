import type { Product } from "./product.model";

export type OrderStatus = "paid" | "processing" | "shipped" | "refunded";

export type Order = {
  id: string;
  customer: string;
  email: string;
  total: number;
  status: OrderStatus;
  createdAt: string;
  items: number;
};

export type ConsoleMetrics = {
  revenue: number;
  orders: number;
  lowStock: number;
  averageOrder: number;
  recentOrders: Order[];
  lowStockProducts: Product[];
};
