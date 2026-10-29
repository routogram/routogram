import { GraphQLError } from "graphql";
import { createSchema, createYoga } from "graphql-yoga";

import { builderOptions, orders, pcBuilds, products, userProfile } from "@/lib/mock-data";

export const runtime = "nodejs";

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Spec {
      label: String!
      value: String!
    }

    type PcBuild {
      id: ID!
      slug: String!
      name: String!
      tagline: String!
      description: String!
      image: String!
      price: Float!
      oldPrice: Float
      badge: String!
      rating: Float!
      reviews: Int!
      specs: [Spec!]!
      components: [String!]!
    }

    type Product {
      id: ID!
      slug: String!
      name: String!
      category: String!
      image: String!
      price: Float!
      oldPrice: Float
      stock: Int!
      rating: Float!
      description: String!
      specs: [Spec!]!
    }

    type BuilderOption {
      id: ID!
      category: String!
      name: String!
      price: Float!
    }

    type Order {
      id: ID!
      customer: String!
      email: String!
      total: Float!
      status: String!
      createdAt: String!
      items: Int!
    }

    type ConsoleMetrics {
      revenue: Float!
      orders: Int!
      lowStock: Int!
      averageOrder: Float!
      recentOrders: [Order!]!
      lowStockProducts: [Product!]!
    }

    type User {
      id: ID!
      name: String!
      email: String!
      role: String!
      avatar: String!
    }

    type AuthPayload {
      token: String!
      user: User!
    }

    type Query {
      featuredPcs: [PcBuild!]!
      build(slug: String!): PcBuild
      product(slug: String!): Product
      products(category: String): [Product!]!
      builderOptions: [BuilderOption!]!
      consoleMetrics: ConsoleMetrics!
      me: User!
    }

    type Mutation {
      login(email: String!, password: String!): AuthPayload!
    }
  `,
  resolvers: {
    Query: {
      featuredPcs: () => pcBuilds.slice(0, 3),
      build: (_parent: unknown, args: { slug: string }) =>
        pcBuilds.find((build) => build.slug === args.slug) ?? null,
      product: (_parent: unknown, args: { slug: string }) =>
        products.find((product) => product.slug === args.slug) ?? null,
      products: (_parent: unknown, args: { category?: string }) =>
        args.category ? products.filter((product) => product.category === args.category) : products,
      builderOptions: () => [
        ...builderOptions.cpu,
        ...builderOptions.gpu,
        ...builderOptions.memory,
      ],
      consoleMetrics: () => {
        const revenue = orders
          .filter((order) => order.status !== "refunded")
          .reduce((total, order) => total + order.total, 0);
        const lowStockProducts = products.filter((product) => product.stock <= 5);
        return {
          revenue,
          orders: orders.length,
          lowStock: lowStockProducts.length,
          averageOrder: Math.round(revenue / Math.max(orders.length, 1)),
          recentOrders: orders.slice(0, 5),
          lowStockProducts,
        };
      },
      me: () => userProfile,
    },
    Mutation: {
      login: (_parent: unknown, args: { email: string; password: string }) => {
        if (!args.email.includes("@")) {
          throw new GraphQLError("A valid email is required.");
        }
        if (args.password.trim().length < 4) {
          throw new GraphQLError("Password must be at least 4 characters.");
        }
        return {
          token: `demo-token-${Buffer.from(args.email).toString("base64url")}`,
          user: {
            ...userProfile,
            email: args.email,
          },
        };
      },
    },
  },
});

const { handleRequest } = createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
});

export function GET(request: Request) {
  return handleRequest(request, {});
}

export function POST(request: Request) {
  return handleRequest(request, {});
}
