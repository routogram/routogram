import { Filter, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { FeatureShell } from "@/components/feature-shell";
import {
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { getProductManagementView } from "../../_handlers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Products" };

export default async function ConsoleProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const [{ q, category }, locale, t, products] = await Promise.all([
    searchParams,
    getLocale(),
    getTranslations("console.products"),
    getProductManagementView(),
  ]);
  const query = q?.trim().toLowerCase() ?? "";
  const filtered = products.filter((product) => {
    const matchesQuery =
      !query ||
      product.name.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query);
    const matchesCategory = !category || category === "all" || product.category === category;
    return matchesQuery && matchesCategory;
  });

  return (
    <FeatureShell
      title={t("title")}
      description={t("subtitle")}
      actions={
        <Button size="sm" className="gap-1.5">
          <Plus className="size-3.5" />
          New product
        </Button>
      }
      filters={
        <form className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-slate-600" />
            <Input
              name="q"
              defaultValue={q}
              placeholder={t("search")}
              className="h-8 w-44 rounded-lg bg-black/20 pl-8 text-[10px]"
            />
          </div>
          <div className="relative">
            <Filter className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-slate-600" />
            <select
              name="category"
              defaultValue={category ?? "all"}
              className="h-8 appearance-none rounded-lg border border-(--border) bg-black/20 pl-8 pr-6 text-[10px] text-slate-300 outline-none"
            >
              <option value="all">{t("all")}</option>
              <option value="CPU">CPU</option>
              <option value="GPU">GPU</option>
              <option value="Memory">Memory</option>
              <option value="Storage">Storage</option>
              <option value="Cooling">Cooling</option>
              <option value="Case">Case</option>
            </select>
          </div>
          <Button type="submit" size="sm" variant="outline">
            {t("filter")}
          </Button>
        </form>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("product")}</TableHead>
            <TableHead>{t("category")}</TableHead>
            <TableHead>{t("stock")}</TableHead>
            <TableHead>{t("price")}</TableHead>
            <TableHead>{t("status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((product) => (
            <TableRow key={product.id}>
              <TableCell>
                <p className="text-[11px] font-medium text-slate-200">{product.name}</p>
                <p className="font-mono text-[9px] text-slate-600">{product.slug}</p>
              </TableCell>
              <TableCell className="text-[10px] text-slate-400">{product.category}</TableCell>
              <TableCell className="text-[10px] text-slate-300">{product.stock}</TableCell>
              <TableCell className="text-[11px] text-slate-200">
                {formatCurrency(product.price, locale)}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    product.stock === 0 ? "danger" : product.stock <= 5 ? "warning" : "success"
                  }
                >
                  {product.stock === 0
                    ? "Out of stock"
                    : product.stock <= 5
                      ? "Low stock"
                      : "Active"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </FeatureShell>
  );
}
