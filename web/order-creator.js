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
  mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
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
      const order = createRandomOrder();
      await client.request(CREATE_ORDER_MUTATION, {
        variables: {
          order,
          options: {
            // 可选参数，例如设置订单的付款状态、发货状态等
          },
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
      priceSet: {
        amount: item.price.toString(),
        currencyCode: "USD", // 你可以根据需要调整货币类型
      },
    })),
    shippingAddress: {
      firstName: "John",
      lastName: "Doe",
      address1: "123 Main St",
      city: "Anytown",
      province: "Ontario",
      country: "Canada",
      zip: "12345",
    },
    email: "johndoe@example.com",
    financialStatus: "AUTHORIZED", // 订单的付款状态
  };
}
