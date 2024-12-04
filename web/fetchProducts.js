import { GraphqlQueryError } from "@shopify/shopify-api";
import shopify from "./shopify.js";

export const fetchProducts = async (session, afterCursor = null) => {
  const client = new shopify.clients.Graphql({ session });

  // GraphQL 查询语句，支持分页
  const query = `
    query GetProducts($first: Int, $after: String) {
      products(first: $first, after: $after) {
        edges {
          node {
            id
            title
            handle
          }
          cursor
        }
        pageInfo {
          hasNextPage
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
          first: 10, // 每次获取 10 个产品
          after: afterCursor, // 分页游标（可以为空）
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

    // 返回产品数据和分页信息
    return {
      products,
      pageInfo: productsData.pageInfo,
      nextCursor: productsData.edges.length > 0 ? productsData.edges[productsData.edges.length - 1].cursor : null,
    };
  } catch (error) {
    if (error instanceof GraphqlQueryError) {
      console.error("GraphQL query error:", error.response.errors);
    } else {
      console.error("Error fetching products:", error);
    }
    throw new Error("Failed to fetch products from Shopify");
  }
};
