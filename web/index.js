// @ts-check
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import orderCreator from "./order-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";


const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// Set up Shopify authentication and webhook handling
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);

// If you are adding routes outside of the /api path, remember to
// also add a proxy rule for them in web/frontend/vite.config.js

app.use("/api/*", shopify.validateAuthenticatedSession());

app.use(express.json());

app.get("/api/products/count", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  const countData = await client.request(`
    query shopifyProductCount {
      productsCount {
        count
      }
    }
  `);

  res.status(200).send({ count: countData.data.productsCount.count });
});

app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});


app.get("/api/orders/count", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  const countData = await client.request(`
    query shopifyOrderCount {
      ordersCount {
              count
            }
      }
  `);
  res.status(200).send({ count: countData.data.ordersCount.count });
});



app.get('/api/store/themes/main', async (req, res) => {
  try {
    const { shop, accessToken } = req.query; // 假设您通过 query 参数传递 shop 和 accessToken

    // 初始化 Shopify 客户端
    const client = new shopify.api.clients.Graphql({
      session: res.locals.shopify.session,
    });

    // Check if App Blocks are supported
    const APP_BLOCK_TEMPLATES = ['product'];

    // 获取商店的主题列表
    const { body: { themes } } = await clients.rest.get({ path: 'themes' });

    // 找到发布的主题
    const publishedTheme = themes.find((theme) => theme.role === 'main');

    // 获取发布主题中的资产
    const { body: { assets } } = await clients.rest.get({
      path: `themes/${publishedTheme.id}/assets`,
    });

    // 检查模板 JSON 文件是否存在
    const templateJSONFiles = assets.filter((file) => {
      return APP_BLOCK_TEMPLATES.some((template) => file.key === `templates/${template}.json`);
    });

    // 获取模板 JSON 文件的内容
    const templateJSONAssetContents = await Promise.all(
      templateJSONFiles.map(async (file) => {
        const { body: { asset } } = await clients.rest.get({
          path: `themes/${publishedTheme.id}/assets`,
          query: { 'asset[key]': file.key },
        });
        return asset;
      })
    );

    // 查找模板 JSON 中的 main section
    const templateMainSections = templateJSONAssetContents
      .map((asset) => {
        const json = JSON.parse(asset.value);
        const main = json.sections.main && json.sections.main.type;
        return assets.find((file) => file.key === `sections/${main}.liquid`);
      })
      .filter((value) => value);


    // 获取各个 section 内容，并检查是否包含 app block
    const sectionsWithAppBlock = (
      await Promise.all(
        templateMainSections.map(async (file) => {
          let acceptsAppBlock = false;
          const { body: { asset } } = await clients.rest.get({
            path: `themes/${publishedTheme.id}/assets`,
            query: { 'asset[key]': file.key },
          });

          const match = asset.value.match(
            /\{\%\s+schema\s+\%\}([\s\S]*?)\{\%\s+endschema\s+\%\}/m
          );
          const schema = JSON.parse(match[1]);

          if (schema && schema.blocks) {
            acceptsAppBlock = schema.blocks.some((b) => b.type === '@app');
          }

          return acceptsAppBlock ? file : null;
        })
      )
    ).filter((value) => value);



    const GET_FIRST_PUBLISHED_PRODUCT_QUERY = gql`
      query GetFirstPublishedProduct {
        products(first: 1, query: "published_status:published") {
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



    // 获取一个发布的产品
    const product = await client
        .query({ query: GET_FIRST_PUBLISHED_PRODUCT_QUERY })
        .then((response) => {
          return getNodesFromConnections(response.data.products)?.[0];
        });



    const editorUrl = `https://${shop}/admin/themes/${publishedTheme.id}/editor?previewPath=${encodeURIComponent(
      `/products/${product?.handle}`
    )}`;

    // 检查主题是否支持 app blocks
    const supportsSe = templateJSONFiles.length > 0;
    const supportsAppBlocks = supportsSe && sectionsWithAppBlock.length > 0;

    // 返回响应
    res.status(200).json({
      theme: publishedTheme,
      supportsSe,
      supportsAppBlocks,
      containsAverageRatingAppBlock: containsAppBlock(
        templateJSONAssetContents[0]?.value,
        'average-rating',
        process.env.THEME_APP_EXTENSION_UUID
      ),
      containsProductReviewsAppBlock: containsAppBlock(
        templateJSONAssetContents[0]?.value,
        'product-reviews',
        process.env.THEME_APP_EXTENSION_UUID
      ),
      editorUrl,
    });
  } catch (error) {
    console.error('Error fetching theme data:', error);
    res.status(500).json({ error: 'Failed to fetch theme data' });
  }
});




app.post("/api/orders", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await orderCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process orders/create: ${e.message}`);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});



app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(
      readFileSync(join(STATIC_PATH, "index.html"))
        .toString()
        .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
    );
});

app.listen(PORT);
