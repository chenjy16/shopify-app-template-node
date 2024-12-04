import { GraphqlQueryError } from "@shopify/shopify-api";
import shopify from "./shopify.js";

// GraphQL 查询语句
const ProductQuery = `
  query GetProducts($query: String!) {
    products(first: 10, query: $query) {
      edges {
        node {
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
    }
  }
`;

export const fetchProducts = async (session, query = "") => {
  const client = new shopify.api.clients.Graphql({ session });

  try {
    const response = await client.request(ProductQuery, { query });
    const products = response.products.edges.map(({ node }) => ({
      id: node.id,
      title: node.title,
      description: node.description,
      featuredImage: node.featuredImage,
      variants: node.variants.edges.map((edge) => edge.node),
    }));

    return products;
  } catch (error) {
    console.error("Error fetching products:", error);
    throw new Error("Failed to fetch products from Shopify");
  }
};
