import type { Product, ProductListResponse, ProductQuery } from "../types/api.ts";
import { request } from "./client.ts";
import { productListSchema, productSchema } from "./schemas.ts";

type CallOptions = { signal?: AbortSignal };

/** GET /api/products. Defaults are omitted from the URL to keep it short and cacheable. */
export function getProducts(
  query: ProductQuery = {},
  { signal }: CallOptions = {},
): Promise<ProductListResponse> {
  return request("/products", {
    query: {
      search: query.search?.trim(),
      category: query.category,
      sort: query.sort === "relevance" ? undefined : query.sort,
      inStock: query.inStock ? true : undefined,
      page: query.page === 1 ? undefined : query.page,
      pageSize: query.pageSize,
    },
    schema: productListSchema,
    ...(signal ? { signal } : {}),
  });
}

/** GET /api/products/:id. A 404 becomes ApiRequestError { kind: "http", status: 404 }. */
export function getProduct(id: string, { signal }: CallOptions = {}): Promise<Product> {
  return request(`/products/${encodeURIComponent(id)}`, {
    schema: productSchema,
    ...(signal ? { signal } : {}),
  });
}
