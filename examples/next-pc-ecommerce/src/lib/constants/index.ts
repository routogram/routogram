export const CONSTANTS = {
  ROUTES: {
    home: "/",
    builds: "/products",
    login: "/auth/login",
    signUp: "/auth/sign-up",
    console: "/console",
    consoleProducts: "/console/products",
    blackFriday: "/black-friday",
  },
  APIS: {
    graphql: "/api/graphql",
  },
  STORAGE: {
    cart: "pc-forge-cart",
    auth: "pc-forge-session",
  },
} as const;
