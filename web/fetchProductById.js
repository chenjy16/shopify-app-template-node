import { GraphqlQueryError } from "@shopify/shopify-api";
import shopify from "./shopify.js";

// GraphQL 查询语句
const ProductById = `
  query GetProductById($id: ID!) {
    product(id: $id) {
      id
      title
      description
      featuredImage {
        originalSrc
      }
      variants(first: 10) {
        edges {
          node {
            id
            title
            priceV2 {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

/**
 * 通过产品 ID 获取产品信息
 * @param {string} productId - 产品的 ID
 * @param {Object} session - Shopify session 对象
 * @returns {Object} - 返回产品信息
 */
export default async function fetchProductById(productId, session) {
  const client = new shopify.api.clients.Graphql({ session });

  try {
    // 发起 GraphQL 请求并传递 productId
    const response = await client.request(ProductById, { id: productId });

    // 检查是否查询到产品数据
    if (!response.product) {
      throw new Error("Product not found");
    }

    // 返回获取到的产品信息
    return response.product;
  } catch (error) {
    // 捕获 GraphQL 错误或其他请求错误
    if (error instanceof GraphqlQueryError) {
      console.error("GraphQL Query Error: ", error.message);
    } else {
      console.error("Error fetching product: ", error.message);
    }

    throw new Error("Failed to fetch product from Shopify: " + error.message);
  }
}
