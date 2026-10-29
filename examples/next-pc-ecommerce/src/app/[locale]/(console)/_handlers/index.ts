import { getConsoleMetrics, getProducts } from "@/lib/apis/graphql";
import type { ConsoleMetrics } from "@/lib/apis/models/console.model";
import type { Product } from "@/lib/apis/models/product.model";

export type DashboardMetricView = {
  key: "revenue" | "orders" | "lowStock" | "averageOrder";
  value: number;
  format: "currency" | "number";
};

export type ConsoleDashboardView = {
  metrics: DashboardMetricView[];
  recentOrders: ConsoleMetrics["recentOrders"];
  lowStockProducts: Product[];
};

export async function getConsoleDashboardView(): Promise<ConsoleDashboardView> {
  const data = await getConsoleMetrics();
  return {
    metrics: [
      { key: "revenue", value: data.revenue, format: "currency" },
      { key: "orders", value: data.orders, format: "number" },
      { key: "lowStock", value: data.lowStock, format: "number" },
      { key: "averageOrder", value: data.averageOrder, format: "currency" },
    ],
    recentOrders: data.recentOrders,
    lowStockProducts: data.lowStockProducts,
  };
}

export async function getProductManagementView(): Promise<Product[]> {
  return getProducts();
}
