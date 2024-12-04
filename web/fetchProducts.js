import { GraphqlQueryError } from "@shopify/shopify-api";
import shopify from "./shopify.js";

export const fetchProducts = async (session, afterCursor = null) => {
  const client = new shopify.api.clients.Graphql({ session });

  // GraphQL 查询语句，支持分页
  const query = `
    query GetProducts($first: Int) {
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  `;

  try {
    // 执行 GraphQL 查询
    const response = await client.query({
      data: {
        query,
        variables: {
          first: 10
        },
      },
    });

    // 检查响应格式
    if (!response || !response.body || !response.body.data) {
      throw new Error("Invalid response format from Shopify.");
    }

    const productsData = response.body.data.products;

    // 提取产品信息
    const products = productsData.edges.map(({ node }) => ({
      id: node.id,
      title: node.title,
      handle: node.handle,
    }));
    return products;
  } catch (error) {
    if (error instanceof GraphqlQueryError) {
      console.error("GraphQL query error:", error.response.errors);
    } else {
      console.error("Error fetching products:", error);
    }
    throw new Error("Failed to fetch products from Shopify");
  }
};
