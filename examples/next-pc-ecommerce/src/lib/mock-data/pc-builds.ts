import type { PcBuild } from "@/lib/apis/models/product.model";

export const pcBuilds: PcBuild[] = [
  {
    id: "build-aurora",
    slug: "aurora-rtx-4070",
    name: "Aurora RTX 4070",
    tagline: "Quiet 1440p performance",
    description:
      "A balanced air-cooled build for high-refresh 1440p gaming, streaming, and everyday creative work.",
    image:
      "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=1200&q=85",
    price: 1849,
    oldPrice: 1999,
    badge: "Best seller",
    rating: 4.9,
    reviews: 128,
    specs: [
      { label: "CPU", value: "Ryzen 7 7800X3D" },
      { label: "GPU", value: "RTX 4070 12GB" },
      { label: "Memory", value: "32GB DDR5-6000" },
      { label: "Storage", value: "2TB NVMe Gen4" },
    ],
    components: ["Ryzen 7 7800X3D", "RTX 4070 12GB", "32GB DDR5-6000", "2TB NVMe Gen4"],
  },
  {
    id: "build-cryo",
    slug: "cryo-liquid-4080",
    name: "Cryo Liquid 4080",
    tagline: "Water-cooled 4K flagship",
    description:
      "A custom-loop showcase build with a 360mm radiator, glass chassis, and quiet 4K performance.",
    image:
      "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?auto=format&fit=crop&w=1200&q=85",
    price: 3299,
    oldPrice: 3599,
    badge: "Water cooled",
    rating: 4.8,
    reviews: 64,
    specs: [
      { label: "CPU", value: "Intel Core i9-14900K" },
      { label: "GPU", value: "RTX 4080 Super 16GB" },
      { label: "Cooling", value: "360mm custom loop" },
      { label: "Storage", value: "4TB NVMe Gen4" },
    ],
    components: ["Core i9-14900K", "RTX 4080 Super", "360mm custom loop", "64GB DDR5"],
  },
  {
    id: "build-nano",
    slug: "nano-itx-4060",
    name: "Nano ITX 4060",
    tagline: "Small footprint, big frames",
    description:
      "A compact ITX build that fits on a desk without giving up modern 1080p performance.",
    image:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=85",
    price: 1199,
    badge: "Compact",
    rating: 4.7,
    reviews: 91,
    specs: [
      { label: "CPU", value: "Ryzen 5 7600" },
      { label: "GPU", value: "RTX 4060 8GB" },
      { label: "Memory", value: "16GB DDR5-5600" },
      { label: "Case", value: "9L mesh ITX" },
    ],
    components: ["Ryzen 5 7600", "RTX 4060 8GB", "16GB DDR5-5600", "9L mesh ITX"],
  },
  {
    id: "build-titan",
    slug: "titan-workstation",
    name: "Titan Workstation",
    tagline: "Render, compile, repeat",
    description:
      "A workstation-grade machine for 3D rendering, video editing, and large local builds.",
    image:
      "https://images.unsplash.com/photo-1555617981-dac3880eac6e?auto=format&fit=crop&w=1200&q=85",
    price: 4499,
    badge: "Creator",
    rating: 5,
    reviews: 42,
    specs: [
      { label: "CPU", value: "Threadripper 7970X" },
      { label: "GPU", value: "RTX 4090 24GB" },
      { label: "Memory", value: "128GB DDR5 ECC" },
      { label: "Storage", value: "8TB NVMe Gen5" },
    ],
    components: ["Threadripper 7970X", "RTX 4090 24GB", "128GB DDR5 ECC", "8TB NVMe Gen5"],
  },
  {
    id: "build-starter",
    slug: "starter-1080p",
    name: "Starter 1080p",
    tagline: "The right first gaming PC",
    description: "A carefully balanced entry build with room to upgrade the GPU later.",
    image:
      "https://images.unsplash.com/photo-1547082299-de196ea013d6?auto=format&fit=crop&w=1200&q=85",
    price: 849,
    badge: "Value",
    rating: 4.6,
    reviews: 203,
    specs: [
      { label: "CPU", value: "Ryzen 5 5600" },
      { label: "GPU", value: "RTX 3060 12GB" },
      { label: "Memory", value: "16GB DDR4-3600" },
      { label: "Storage", value: "1TB NVMe Gen3" },
    ],
    components: ["Ryzen 5 5600", "RTX 3060 12GB", "16GB DDR4-3600", "1TB NVMe Gen3"],
  },
  {
    id: "build-velocity",
    slug: "velocity-1440p",
    name: "Velocity 1440p",
    tagline: "High refresh, low noise",
    description: "A 1440p esports build tuned for high frame rates and near-silent operation.",
    image:
      "https://images.unsplash.com/photo-1616588589676-62b3bd4ff6d2?auto=format&fit=crop&w=1200&q=85",
    price: 2299,
    oldPrice: 2449,
    badge: "Esports",
    rating: 4.8,
    reviews: 76,
    specs: [
      { label: "CPU", value: "Ryzen 7 9700X" },
      { label: "GPU", value: "RTX 4070 Ti Super" },
      { label: "Memory", value: "32GB DDR5-6400" },
      { label: "Cooling", value: "280mm AIO" },
    ],
    components: ["Ryzen 7 9700X", "RTX 4070 Ti Super", "32GB DDR5-6400", "280mm AIO"],
  },
];
