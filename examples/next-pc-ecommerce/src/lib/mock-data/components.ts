import type { Product } from "@/lib/apis/models/product.model";

export const products: Product[] = [
  {
    id: "cpu-7800x3d",
    slug: "rtx-4070-super",
    name: "NVIDIA RTX 4070 Super",
    category: "GPU",
    image:
      "https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=900&q=85",
    price: 599,
    oldPrice: 649,
    stock: 14,
    rating: 4.9,
    description: "A quiet 1440p graphics card with excellent ray-tracing headroom.",
    specs: [
      { label: "Memory", value: "12GB GDDR6X" },
      { label: "TDP", value: "220W" },
      { label: "Ports", value: "3× DP 1.4a, 1× HDMI 2.1" },
    ],
  },
  {
    id: "cpu-9700x",
    slug: "ryzen-7-9700x",
    name: "AMD Ryzen 7 9700X",
    category: "CPU",
    image:
      "https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?auto=format&fit=crop&w=900&q=85",
    price: 329,
    stock: 22,
    rating: 4.8,
    description: "Efficient 8-core gaming processor on the AM5 platform.",
    specs: [
      { label: "Cores", value: "8C / 16T" },
      { label: "Boost", value: "5.5GHz" },
      { label: "Socket", value: "AM5" },
    ],
  },
  {
    id: "mem-fury-32",
    slug: "fury-ddr5-32gb",
    name: "Kingston Fury 32GB DDR5-6000",
    category: "Memory",
    image:
      "https://images.unsplash.com/photo-1562976540-1502c2145186?auto=format&fit=crop&w=900&q=85",
    price: 119,
    stock: 7,
    rating: 4.7,
    description: "Low-profile DDR5 kit with EXPO profiles for AM5 builds.",
    specs: [
      { label: "Capacity", value: "2 × 16GB" },
      { label: "Speed", value: "6000 MT/s" },
      { label: "Profile", value: "EXPO / XMP" },
    ],
  },
  {
    id: "ssd-sn850x",
    slug: "wd-black-sn850x-2tb",
    name: "WD Black SN850X 2TB",
    category: "Storage",
    image:
      "https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=900&q=85",
    price: 149,
    stock: 3,
    rating: 4.9,
    description: "Fast Gen4 storage for games and large project files.",
    specs: [
      { label: "Capacity", value: "2TB" },
      { label: "Interface", value: "PCIe Gen4 x4" },
      { label: "Read", value: "7,300 MB/s" },
    ],
  },
  {
    id: "cool-kraken",
    slug: "kraken-elite-360",
    name: "NZXT Kraken Elite 360",
    category: "Cooling",
    image:
      "https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?auto=format&fit=crop&w=900&q=85",
    price: 249,
    stock: 5,
    rating: 4.6,
    description: "360mm liquid cooler with an LCD display and quiet fans.",
    specs: [
      { label: "Radiator", value: "360mm" },
      { label: "Display", value: "2.72-inch LCD" },
      { label: "Socket", value: "AM5 / LGA1700" },
    ],
  },
  {
    id: "case-north",
    slug: "fractal-north-xl",
    name: "Fractal North XL",
    category: "Case",
    image:
      "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=900&q=85",
    price: 159,
    stock: 1,
    rating: 4.8,
    description: "A warm wood-accented chassis with excellent airflow.",
    specs: [
      { label: "Form factor", value: "E-ATX" },
      { label: "Fans", value: "3 × 140mm included" },
      { label: "Material", value: "Steel / walnut" },
    ],
  },
  {
    id: "cpu-7600",
    slug: "ryzen-5-7600",
    name: "AMD Ryzen 5 7600",
    category: "CPU",
    image:
      "https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?auto=format&fit=crop&w=900&q=85",
    price: 199,
    stock: 18,
    rating: 4.7,
    description: "Six cores, low power, and a bundled quiet cooler.",
    specs: [
      { label: "Cores", value: "6C / 12T" },
      { label: "Boost", value: "5.1GHz" },
      { label: "Socket", value: "AM5" },
    ],
  },
  {
    id: "gpu-4070",
    slug: "rtx-4070",
    name: "NVIDIA RTX 4070",
    category: "GPU",
    image:
      "https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=900&q=85",
    price: 499,
    stock: 0,
    rating: 4.8,
    description: "Efficient 1440p performance with a compact two-slot design.",
    specs: [
      { label: "Memory", value: "12GB GDDR6X" },
      { label: "TDP", value: "200W" },
      { label: "Ports", value: "3× DP 1.4a" },
    ],
  },
];

export const builderOptions = {
  cpu: products
    .filter((product) => product.category === "CPU")
    .map((product) => ({
      id: product.id,
      category: "CPU" as const,
      name: product.name,
      price: product.price,
    })),
  gpu: products
    .filter((product) => product.category === "GPU")
    .map((product) => ({
      id: product.id,
      category: "GPU" as const,
      name: product.name,
      price: product.price,
    })),
  memory: products
    .filter((product) => product.category === "Memory")
    .map((product) => ({
      id: product.id,
      category: "Memory" as const,
      name: product.name,
      price: product.price,
    })),
};
