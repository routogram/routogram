export type ProductSpec = {
  label: string;
  value: string;
};

export type PcBuild = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  image: string;
  price: number;
  oldPrice?: number;
  badge: string;
  rating: number;
  reviews: number;
  specs: ProductSpec[];
  components: string[];
};

export type ProductCategory = "CPU" | "GPU" | "Memory" | "Storage" | "Cooling" | "Case";

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  image: string;
  price: number;
  oldPrice?: number;
  stock: number;
  rating: number;
  description: string;
  specs: ProductSpec[];
};

export type BuilderOption = {
  id: string;
  category: "CPU" | "GPU" | "Memory";
  name: string;
  price: number;
};

export type ProductDetailItem = {
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
  specs: ProductSpec[];
};

export type ProductPageData = {
  item: ProductDetailItem;
  related: Product[];
};

export type HomePageData = {
  featuredBuilds: PcBuild[];
  builderOptions: BuilderOption[];
};
