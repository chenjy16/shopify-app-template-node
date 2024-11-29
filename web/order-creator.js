import { GraphqlQueryError } from "@shopify/shopify-api";
import shopify from "./shopify.js";

const DEFAULT_ORDERS_COUNT = 5;

// 示例订单行项目
const LINE_ITEMS = [
  { title: "T-shirt", quantity: 2, price: 20 },
  { title: "Jeans", quantity: 1, price: 40 },
  { title: "Shoes", quantity: 1, price: 60 },
  { title: "Hat", quantity: 3, price: 15 },
  { title: "Socks", quantity: 5, price: 5 },
];

const CREATE_ORDER_MUTATION = `
  mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
          }
        }
      }
`;

export default async function orderCreator(
  session,
  count = DEFAULT_ORDERS_COUNT
) {
  const client = new shopify.api.clients.Graphql({ session });

  try {
    for (let i = 0; i < count; i++) {
      const input = createRandomOrder();
      await client.request(CREATE_ORDER_MUTATION, {
        variables: {
          input,
        },
      });
    }
  } catch (error) {
    if (error instanceof GraphqlQueryError) {
      throw new Error(
        `${error.message}\n${JSON.stringify(error.response, null, 2)}`
      );
    } else {
      throw error;
    }
  }
}

// 生成一个随机订单
function createRandomOrder() {
  return {
    lineItems: LINE_ITEMS.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      originalUnitPrice: 14.99,
      appliedDiscount: {
        description: "wholesale",
        value: 5.0,
        amount: 3.74,
        valueType: "PERCENTAGE",
        title: "Fancy",
      },
      weight: {
        value: 1,
        unit: "KILOGRAMS",
      },
    })),
    appliedDiscount: {
      description: "damaged",
      value: 5.0,
      amount: 5.0,
      valueType: "FIXED_AMOUNT",
      title: "Custom"
    },
  };
}