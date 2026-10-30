export type OrderStatus = "pending" | "processing" | "completed" | "cancelled";

export type OrderItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export type Order = {
  id: string;
  customer_id: string;
  items: OrderItem[];
  total_amount: number;
  status: OrderStatus;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  price: number;
};
