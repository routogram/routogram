import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CircleDollarSign,
  ReceiptText,
  ShoppingCart,
} from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { CONSTANTS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getConsoleDashboardView } from "../_handlers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Dashboard" };

const ICONS = {
  revenue: CircleDollarSign,
  orders: ShoppingCart,
  lowStock: AlertTriangle,
  averageOrder: ReceiptText,
} as const;

export default async function ConsoleDashboardPage() {
  const [data, locale, t] = await Promise.all([
    getConsoleDashboardView(),
    getLocale(),
    getTranslations("console"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">
            {t("title")}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
            {t("title")}
          </h1>
          <p className="mt-1 text-xs text-slate-500">{t("subtitle")}</p>
        </div>
        <Link
          href={CONSTANTS.ROUTES.consoleProducts}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-3.5 py-2 text-xs font-medium text-slate-950 transition hover:bg-sky-300"
        >
          <Boxes className="size-3.5" />
          {t("nav.products")}
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => {
          const Icon = ICONS[metric.key];
          return (
            <Card key={metric.key} className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  {t(`metrics.${metric.key}`)}
                </p>
                <Icon className="size-4 text-sky-300" />
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-100">
                {metric.format === "currency"
                  ? formatCurrency(metric.value, locale)
                  : new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(metric.value)}
              </p>
              <p className="mt-2 flex items-center gap-1 text-[10px] text-emerald-300">
                <ArrowUpRight className="size-3" />
                {metric.key === "lowStock" ? "Needs attention" : "Healthy"}
              </p>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <Card>
          <CardHeader className="flex items-center justify-between border-b border-(--border) pb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("recentOrders")}
            </h2>
            <Link
              href={CONSTANTS.ROUTES.consoleProducts}
              className="text-[10px] text-sky-300 hover:text-sky-200"
            >
              View catalog →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-[10px] text-slate-400">
                      {order.id}
                    </TableCell>
                    <TableCell>
                      <p className="text-[11px] text-slate-200">{order.customer}</p>
                      <p className="text-[9px] text-slate-600">{order.email}</p>
                    </TableCell>
                    <TableCell className="text-[10px] text-slate-500">
                      {formatDate(order.createdAt, locale)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          order.status === "paid"
                            ? "success"
                            : order.status === "refunded"
                              ? "danger"
                              : "outline"
                        }
                      >
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-[11px] text-slate-200">
                      {formatCurrency(order.total, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-(--border) pb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("inventory")}
            </h2>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {data.lowStockProducts.map((product) => (
              <div key={product.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-slate-200">{product.name}</p>
                  <p className="text-[9px] uppercase tracking-wider text-slate-600">
                    {product.category}
                  </p>
                </div>
                <Badge variant={product.stock === 0 ? "danger" : "warning"}>
                  {product.stock === 0 ? "Out" : `${product.stock} left`}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
