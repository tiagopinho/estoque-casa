import { Pool } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const COOKIE = 'estoque_session';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
}

export function requireMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  json(res, 405, { error: 'Método não permitido.' });
  return false;
}

function signature(value) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update(value).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function authenticated(req) {
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) return false;
  const raw = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [expires, sentSignature] = decodeURIComponent(raw.slice(COOKIE.length + 1)).split('.');
  return Number(expires) > Date.now() && safeEqual(sentSignature, signature(expires));
}

export function requireAuth(req, res) {
  if (authenticated(req)) return true;
  json(res, 401, { error: 'Sessão expirada. Entre novamente.' });
  return false;
}

export function validPassword(password) {
  return !!process.env.APP_PASSWORD && safeEqual(password, process.env.APP_PASSWORD);
}

export function setSession(res) {
  const expires = String(Date.now() + 30 * 24 * 60 * 60 * 1000);
  res.setHeader('Set-Cookie', `${COOKIE}=${expires}.${signature(expires)}; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Strict`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`);
}

export async function withClient(fn) {
  const client = await pool.connect();
  try { return await fn(client); } finally { client.release(); }
}

export async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS products (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS history (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS shopping_items (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS processed_operations (
      id text PRIMARY KEY,
      processed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint text PRIMARY KEY,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export function cleanProduct(value) {
  const p = value && typeof value === 'object' ? value : {};
  const text = key => String(p[key] || '').slice(0, key === 'photo' ? 2_500_000 : 500);
  const expirations = Array.isArray(p.expirations) ? p.expirations.slice(0, 1000).map(e => ({
    id: String(e.id || crypto.randomUUID()),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(e.date)) ? String(e.date) : '',
    consumed: !!e.consumed,
    consumedAt: e.consumedAt ? String(e.consumedAt) : null
  })).filter(e => e.date) : [];
  return {
    id: String(p.id || crypto.randomUUID()), name: text('name'), category: text('category'), brand: text('brand'),
    quantity: Math.max(0, Number(p.quantity) || 0), unit: text('unit'), location: text('location'),
    barcode: text('barcode'), notes: text('notes'), photo: text('photo'), expirations, favorite: !!p.favorite,
    createdAt: String(p.createdAt || new Date().toISOString()), updatedAt: new Date().toISOString()
  };
}

export function cleanHistory(value) {
  const h = value && typeof value === 'object' ? value : {};
  return { id: String(h.id || crypto.randomUUID()), date: String(h.date || new Date().toISOString()), productName: String(h.productName || '').slice(0, 500), quantity: Math.max(0, Number(h.quantity) || 0), type: String(h.type || '').slice(0, 50) };
}

export function cleanShopping(value) {
  const i = value && typeof value === 'object' ? value : {};
  return { id: String(i.id || crypto.randomUUID()), productName: String(i.productName || '').slice(0, 500), quantity: Math.max(1, Number(i.quantity) || 1), purchased: !!i.purchased, removed: !!i.removed, createdAt: String(i.createdAt || new Date().toISOString()) };
}
