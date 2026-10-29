import { getHomePageData, getProductDetail } from "@/lib/apis/graphql";
import type { BuilderOption, PcBuild, Product } from "@/lib/apis/models/product.model";

export type FeaturedBuildView = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  image: string;
  price: number;
  oldPrice?: number;
  badge: string;
  rating: number;
  reviews: number;
  specs: { label: string; value: string }[];
};

export type HomePageView = {
  builds: FeaturedBuildView[];
  builderOptions: BuilderOption[];
};

export type ProductDetailView = {
  id: string;
  slug: string;
  name: string;
  category: string;
  image: string;
  price: number;
  oldPrice?: number;
  stock: number;
  rating: number;
  description: string;
  specs: { label: string; value: string }[];
  related: Product[];
};

function toFeaturedBuild(build: PcBuild): FeaturedBuildView {
  return {
    id: build.id,
    slug: build.slug,
    name: build.name,
    tagline: build.tagline,
    image: build.image,
    price: build.price,
    oldPrice: build.oldPrice,
    badge: build.badge,
    rating: build.rating,
    reviews: build.reviews,
    specs: build.specs.slice(0, 3),
  };
}

export async function getHomePageView(): Promise<HomePageView> {
  const data = await getHomePageData();
  return {
    builds: data.featuredBuilds.map(toFeaturedBuild),
    builderOptions: data.builderOptions,
  };
}

export async function getProductDetailView(slug: string): Promise<ProductDetailView> {
  const data = await getProductDetail(slug);
  return {
    ...data.item,
    related: data.related,
  };
}
