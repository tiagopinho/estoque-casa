import { ensureSchema, json, requireAuth, requireMethod, withClient } from './_lib.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET') || !requireAuth(req, res)) return;
  try {
    const data = await withClient(async client => {
      await ensureSchema(client);
      const [products, history, shopping] = await Promise.all([
        client.query('SELECT data FROM products ORDER BY updated_at DESC'),
        client.query('SELECT data FROM history ORDER BY created_at DESC LIMIT 5000'),
        client.query('SELECT data FROM shopping_items ORDER BY updated_at DESC')
      ]);
      return { products: products.rows.map(r => r.data), history: history.rows.map(r => r.data), shoppingList: shopping.rows.map(r => r.data) };
    });
    json(res, 200, data);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: 'Não foi possível acessar o banco de dados.' });
  }
}
