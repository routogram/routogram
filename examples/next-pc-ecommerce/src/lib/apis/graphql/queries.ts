export const GET_FEATURED_PCS = `
  query GetFeaturedPcs {
    featuredPcs {
      id
      slug
      name
      tagline
      description
      image
      price
      oldPrice
      badge
      rating
      reviews
      specs { label value }
      components
    }
  }
`;

export const GET_PRODUCT_DETAIL = `
  query GetProductDetail($slug: String!) {
    build(slug: $slug) {
      id
      slug
      name
      tagline
      description
      image
      price
      oldPrice
      badge
      rating
      reviews
      specs { label value }
      components
    }
    product(slug: $slug) {
      id
      slug
      name
      category
      image
      price
      oldPrice
      stock
      rating
      description
      specs { label value }
    }
    products {
      id
      slug
      name
      category
      image
      price
      oldPrice
      stock
      rating
      description
      specs { label value }
    }
  }
`;

export const GET_CONSOLE_METRICS = `
  query GetConsoleMetrics {
    consoleMetrics {
      revenue
      orders
      lowStock
      averageOrder
      recentOrders { id customer email total status createdAt items }
      lowStockProducts { id slug name category stock price image }
    }
  }
`;

export const GET_BUILDER_OPTIONS = `
  query GetBuilderOptions {
    builderOptions { id category name price }
  }
`;

export const MUTATION_LOGIN = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user { id name email role avatar }
    }
  }
`;

export const GET_PRODUCTS = `
  query GetProducts {
    products {
      id
      slug
      name
      category
      image
      price
      oldPrice
      stock
      rating
      description
      specs { label value }
    }
  }
`;
