import { CONSTANTS } from "@/lib/constants";

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

export class GraphQLRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphQLRequestError";
  }
}

function endpoint(): string {
  if (typeof window !== "undefined") {
    return CONSTANTS.APIS.graphql;
  }
  return process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://127.0.0.1:3000/api/graphql";
}

export async function requestGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const payload = (await response.json()) as GraphQLResponse<T>;
  if (!response.ok || payload.errors?.length) {
    throw new GraphQLRequestError(
      payload.errors?.map((error) => error.message).join(", ") ??
        `GraphQL request failed with ${response.status}`,
    );
  }
  if (!payload.data) {
    throw new GraphQLRequestError("GraphQL response did not contain data.");
  }

  return payload.data;
}
