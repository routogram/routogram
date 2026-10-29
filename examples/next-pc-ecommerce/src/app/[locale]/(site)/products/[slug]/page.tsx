import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getProductDetailView } from "../../_handlers";
import { ProductDetail } from "./_components/product-detail/server";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const product = await getProductDetailView(slug);
    return { title: product.name, description: product.description };
  } catch {
    return { title: "Product not found" };
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  try {
    const product = await getProductDetailView(slug);
    return <ProductDetail product={product} />;
  } catch {
    notFound();
  }
}
