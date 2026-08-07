import { json, requireMethod, setSession, validPassword } from './_lib.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!process.env.DATABASE_URL || !process.env.APP_PASSWORD || !process.env.SESSION_SECRET) return json(res, 503, { error: 'Servidor ainda não configurado. Consulte o README.' });
  if (!validPassword(req.body?.password)) return json(res, 401, { error: 'Senha incorreta.' });
  setSession(res);
  json(res, 200, { ok: true });
}
