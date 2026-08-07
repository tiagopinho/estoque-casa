import { cleanHistory, cleanProduct, cleanShopping, ensureSchema, json, requireAuth, requireMethod, withClient } from './_lib.js';

async function upsertProduct(client, product) {
  const p = cleanProduct(product);
  if (!p.name) throw new Error('O produto precisa ter um nome.');
  await client.query('INSERT INTO products(id,data,updated_at) VALUES($1,$2,now()) ON CONFLICT(id) DO UPDATE SET data=$2,updated_at=now()', [p.id, p]);
}

async function addHistory(client, history) {
  const h = cleanHistory(history);
  await client.query('INSERT INTO history(id,data,created_at) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING', [h.id, h, h.date]);
}

async function upsertShopping(client, item) {
  const i = cleanShopping(item);
  await client.query('INSERT INTO shopping_items(id,data,updated_at) VALUES($1,$2,now()) ON CONFLICT(id) DO UPDATE SET data=$2,updated_at=now()', [i.id, i]);
}

async function apply(client, operation) {
  const { type, payload = {} } = operation;
  if (type === 'saveProduct' || type === 'duplicateProduct') {
    await upsertProduct(client, payload.product);
    if (payload.history) await addHistory(client, payload.history);
  } else if (type === 'consumeProduct') {
    const result = await client.query('SELECT data FROM products WHERE id=$1 FOR UPDATE', [String(payload.product?.id)]);
    if (!result.rowCount) throw new Error('Produto não encontrado.');
    const product = cleanProduct(result.rows[0].data);
    if (product.quantity > 0) {
      product.quantity -= 1;
      const active = product.expirations.filter(e => !e.consumed).sort((a,b) => a.date.localeCompare(b.date));
      if (active[0]) { active[0].consumed = true; active[0].consumedAt = new Date().toISOString(); }
      await upsertProduct(client, product);
      if (payload.history) await addHistory(client, payload.history);
      if (product.quantity === 0) await upsertShopping(client, payload.shoppingItem || { id:`missing-${product.id}`, productName:product.name, quantity:1 });
    }
  } else if (type === 'toggleFavorite') {
    const result = await client.query('SELECT data FROM products WHERE id=$1 FOR UPDATE', [String(payload.product?.id)]);
    if (!result.rowCount) throw new Error('Produto não encontrado.');
    const product = cleanProduct(result.rows[0].data);
    product.favorite = !product.favorite;
    await upsertProduct(client, product);
  } else if (type === 'deleteProduct') {
    await client.query('DELETE FROM products WHERE id=$1', [String(payload.id)]);
  } else if (type === 'saveShopping') {
    await upsertShopping(client, payload.item);
  } else if (type === 'replaceAll') {
    const products = Array.isArray(payload.products) ? payload.products.slice(0, 10000) : [];
    const history = Array.isArray(payload.history) ? payload.history.slice(0, 50000) : [];
    const shopping = Array.isArray(payload.shoppingList) ? payload.shoppingList.slice(0, 10000) : [];
    await client.query('TRUNCATE products, history, shopping_items');
    for (const product of products) await upsertProduct(client, product);
    for (const entry of history) await addHistory(client, entry);
    for (const item of shopping) await upsertShopping(client, item);
  } else {
    throw new Error('Operação desconhecida.');
  }
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST') || !requireAuth(req, res)) return;
  const operation = req.body;
  if (!operation?.id || !operation?.type) return json(res, 400, { error: 'Operação inválida.' });
  try {
    const duplicate = await withClient(async client => {
      await ensureSchema(client);
      await client.query('BEGIN');
      try {
        const inserted = await client.query('INSERT INTO processed_operations(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id', [String(operation.id)]);
        if (!inserted.rowCount) { await client.query('ROLLBACK'); return true; }
        await apply(client, operation);
        await client.query('COMMIT');
        return false;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
    json(res, 200, { ok: true, duplicate });
  } catch (error) {
    console.error(error);
    const expected = ['O produto precisa ter um nome.', 'Produto não encontrado.', 'Operação desconhecida.'].includes(error.message);
    json(res, expected ? 400 : 500, { error: expected ? error.message : 'Não foi possível salvar a alteração.' });
  }
}
