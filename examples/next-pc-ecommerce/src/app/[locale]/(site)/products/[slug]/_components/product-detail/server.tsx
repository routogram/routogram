import { getLocale } from "next-intl/server";

import type { ProductDetailView } from "../../../../_handlers";
import { ProductDetailTemplate } from "./template";

export async function ProductDetail({ product }: { product: ProductDetailView }) {
  const locale = await getLocale();
  return <ProductDetailTemplate product={product} locale={locale} />;
}
