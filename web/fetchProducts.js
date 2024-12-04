import { GraphqlQueryError } from "@shopify/shopify-api";
import shopify from "./shopify.js";

// 修改后的 GraphQL 查询语句，不传递任何查询条件
const ProductQuery = `
  query GetProducts {
    products(first: 10) {
      edges {
        node {
          id
          title
        }
      }
    }
  }
`;

export const fetchProducts = async (session, query = "") => {
  const client = new shopify.api.clients.Graphql({ session });


  try {
    // 直接请求查询所有产品，不传递任何查询条件
    const response = await client.request(ProductQuery);

    // 检查 response 是否存在以及是否有 products.edges
    if (!response || !response.products || !response.products.edges) {
      throw new Error("Invalid response format from Shopify.");
    }

    // 映射产品数据
    const products = response.products.edges.map(({ node }) => ({
      id: node.id,
      title: node.title,
    }));

    return products;
  } catch (error) {
    if (error instanceof GraphqlQueryError) {
      console.error("GraphQL query error:", error.message);
    } else {
      console.error("Error fetching products:", error);
    }
    throw new Error("Failed to fetch products from Shopify");
  }
};
