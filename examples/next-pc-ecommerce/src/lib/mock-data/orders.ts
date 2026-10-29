import type { Order } from "@/lib/apis/models/console.model";

export const orders: Order[] = [
  {
    id: "PF-10482",
    customer: "Mina Tran",
    email: "mina@example.com",
    total: 1849,
    status: "paid",
    createdAt: "2026-10-27",
    items: 1,
  },
  {
    id: "PF-10481",
    customer: "Alex Morgan",
    email: "alex@example.com",
    total: 748,
    status: "processing",
    createdAt: "2026-10-27",
    items: 3,
  },
  {
    id: "PF-10480",
    customer: "Kenji Sato",
    email: "kenji@example.com",
    total: 3299,
    status: "shipped",
    createdAt: "2026-10-26",
    items: 1,
  },
  {
    id: "PF-10479",
    customer: "Sara Levi",
    email: "sara@example.com",
    total: 268,
    status: "paid",
    createdAt: "2026-10-26",
    items: 2,
  },
  {
    id: "PF-10478",
    customer: "Noah Williams",
    email: "noah@example.com",
    total: 1199,
    status: "refunded",
    createdAt: "2026-10-25",
    items: 1,
  },
];
