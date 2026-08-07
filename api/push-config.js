import { json, requireAuth, requireMethod } from './_lib.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET') || !requireAuth(req, res)) return;
  if (!process.env.VAPID_PUBLIC_KEY) return json(res, 503, { error: 'Notificações automáticas ainda não foram configuradas.' });
  json(res, 200, { publicKey: process.env.VAPID_PUBLIC_KEY });
}
