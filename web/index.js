// @ts-check
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import orderCreator from "./order-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";
import {containsAppBlock} from "./frontend/utils/utilities.js";
import fetchProductById from "./fetchProductById.js";
import {fetchProducts} from "./fetchProducts.js";

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


app.post("/api/product/:productId", async (req, res) => {
  const { productId } = req.params; // 从 URL 参数中获取产品 ID
  const session = req.session; // 假设 session 存储了 Shopify session 信息

  try {
    // 调用 fetchProductById 函数获取产品信息
    const product = await fetchProductById(productId, session);

    // 返回成功的响应
    res.status(200).json({ success: true, product });
  } catch (error) {
    // 返回错误响应
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/productlist", async (req, res) => {
  const { query = "" } = req.body;
  const session = req.session; // 获取 session 对象

  try {
    // 调用 fetchProducts 函数获取产品数据ß
    const products = await fetchProducts(session, query);

    // 返回成功的响应
    res.status(200).json({ success: true, products });
  } catch (error) {
    // 返回错误响应
    res.status(500).json({ success: false, error: error.message });
  }
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
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  const APP_BLOCK_TEMPLATES = ["product"];  // 可以根据需求修改这些模板

  try {
    // 1. Fetch themes using GraphQL Admin API
    const themesQuery = `
      query {
        themes(first: 10) {
          edges {
            node {
              id
              name
              role
            }
          }
        }
      }
    `;
    const themesResponse = await client.query({ data: themesQuery });
    const themes = themesResponse.body.data.themes.edges.map(edge => edge.node);
    const publishedTheme = themes.find(theme => theme.role === "MAIN");

    if (!publishedTheme) {
      console.error("No published theme found.");
    }

    // 2. Fetch assets for the published theme (assets query)
    const assetsQuery = `
      query {
        theme(id: "${publishedTheme.id}") {
          files(filenames: ["assets/index.js"], first: 1) {
            nodes {
              body {
                ... on OnlineStoreThemeFileBodyText {
                  content
                }
              }
            }
          }
        }
      }
    `;
    const assetsResponse = await client.query({ data: assetsQuery });
    const assets = assetsResponse.body.data.theme.files.nodes;

    // 3. Fetch template JSON files and filter for app block templates
    const templateJSONFiles = assets.filter(file =>
      APP_BLOCK_TEMPLATES.some(template => file.body.content.includes(`${template}.json`))
    );

    // 4. Fetch template JSON asset contents (if necessary)
    const templateJSONAssetContents = await Promise.all(
      templateJSONFiles.map(async file => {
        const assetQuery = `
          query {
            theme(id: "${publishedTheme.id}") {
              asset(key: "${file.body.content}") {
                key
                value
              }
            }
          }
        `;
        const assetResponse = await client.query({ data: assetQuery });
        return assetResponse.body.data.theme.asset;
      })
    );

    // 5. Get the main sections of the template
    const templateMainSections = templateJSONAssetContents
      .map(asset => {
        const json = JSON.parse(asset.value);
        const main = json.sections.main && json.sections.main.type;
        return assets.find(file => file.body.content.includes(`sections/${main}.liquid`));
      })
      .filter(value => value);



    // 6. Check for App Blocks in the sections
    const sectionsWithAppBlock = (
      await Promise.all(
        templateMainSections.map(async file => {
          let acceptsAppBlock = false;
          const sectionQuery = `
            query {
              theme(id: "${publishedTheme.id}") {
                asset(key: "${file.body.content}") {
                  value
                }
              }
            }
          `;
          const sectionResponse = await client.query({ data: sectionQuery });
          const sectionAsset = sectionResponse.body.data.theme.asset;
          const match = sectionAsset.value.match(/\{\%\s+schema\s+\%\}([\s\S]*?)\{\%\s+endschema\s+\%\}/m);
          const schema = match && JSON.parse(match[1]);

          if (schema && schema.blocks) {
            acceptsAppBlock = schema.blocks.some(b => b.type === "@app");
          }

          return acceptsAppBlock ? file : null;
        })
      )
    ).filter(value => value);


    // 7. Fetch the first published product (for editor URL)
    const GET_FIRST_PUBLISHED_PRODUCT_QUERY = `
      query {
        products(first: 1, query: "product_publication_status:published") {
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
    const productResponse = await client.query({ data: GET_FIRST_PUBLISHED_PRODUCT_QUERY });

    const product = productResponse?.body?.data?.products?.edges?.[0]?.node || null;
    if (!product) {
      console.log("No product found.");
      return res.status(404).send({ error: "No product found." });
    }

    const editorUrl = `https://${res.locals.shopify.session.shop}/admin/themes/${publishedTheme.id}/editor?previewPath=${encodeURIComponent(`/products/${product.handle}`)}`;

    // 8. Determine support for App Blocks and Sections Everywhere
    const supportsSe = templateJSONFiles.length > 0;
    const supportsAppBlocks = supportsSe && sectionsWithAppBlock.length > 0;

    // 9. Return the response
    res.status(200).send({
      theme: publishedTheme,
      supportsSe,
      supportsAppBlocks,
      containsAverageRatingAppBlock: containsAppBlock(
        templateJSONAssetContents[0]?.value,
        "average-rating",
        process.env.THEME_APP_EXTENSION_UUID
      ),
      containsProductReviewsAppBlock: containsAppBlock(
        templateJSONAssetContents[0]?.value,
        "product-reviews",
        process.env.THEME_APP_EXTENSION_UUID
      ),
      editorUrl
    });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).send({ error: "Internal server error" });
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
