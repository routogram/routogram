import type { ConsoleMetrics } from "@/lib/apis/models/console.model";
import type {
  BuilderOption,
  HomePageData,
  PcBuild,
  Product,
  ProductPageData,
} from "@/lib/apis/models/product.model";
import type { AuthPayload } from "@/lib/apis/models/user.model";
import { requestGraphQL } from "./client";
import {
  GET_BUILDER_OPTIONS,
  GET_CONSOLE_METRICS,
  GET_FEATURED_PCS,
  GET_PRODUCT_DETAIL,
  GET_PRODUCTS,
  MUTATION_LOGIN,
} from "./queries";

export { requestGraphQL } from "./client";

type FeaturedPcsData = { featuredPcs: PcBuild[] };
type ProductsData = { products: Product[] };
type ProductDetailData = {
  build: PcBuild | null;
  product: Product | null;
  products: Product[];
};
type ConsoleMetricsData = { consoleMetrics: ConsoleMetrics };
type BuilderOptionsData = { builderOptions: BuilderOption[] };
type LoginData = { login: AuthPayload };

export async function getFeaturedPcs(): Promise<PcBuild[]> {
  const data = await requestGraphQL<FeaturedPcsData>(GET_FEATURED_PCS);
  return data.featuredPcs;
}

export async function getHomePageData(): Promise<HomePageData> {
  const [featuredBuilds, builderOptions] = await Promise.all([
    getFeaturedPcs(),
    getBuilderOptions(),
  ]);
  return { featuredBuilds, builderOptions };
}

export async function getBuilderOptions(): Promise<BuilderOption[]> {
  const data = await requestGraphQL<BuilderOptionsData>(GET_BUILDER_OPTIONS);
  return data.builderOptions;
}

export async function getProducts(): Promise<Product[]> {
  const data = await requestGraphQL<ProductsData>(GET_PRODUCTS);
  return data.products;
}

export async function getProductDetail(slug: string): Promise<ProductPageData> {
  const data = await requestGraphQL<ProductDetailData>(GET_PRODUCT_DETAIL, { slug });
  const item = data.build
    ? {
        id: data.build.id,
        slug: data.build.slug,
        name: data.build.name,
        category: "PC Build",
        image: data.build.image,
        price: data.build.price,
        oldPrice: data.build.oldPrice,
        stock: 1,
        rating: data.build.rating,
        description: data.build.description,
        specs: data.build.specs,
      }
    : data.product
      ? { ...data.product }
      : null;

  if (!item) {
    throw new Error(`Product not found: ${slug}`);
  }

  return {
    item,
    related: data.products.filter((candidate) => candidate.slug !== slug).slice(0, 3),
  };
}

export async function getConsoleMetrics(): Promise<ConsoleMetrics> {
  const data = await requestGraphQL<ConsoleMetricsData>(GET_CONSOLE_METRICS);
  return data.consoleMetrics;
}

export async function login(email: string, password: string): Promise<AuthPayload> {
  const data = await requestGraphQL<LoginData>(MUTATION_LOGIN, { email, password });
  return data.login;
}
