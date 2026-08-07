import { clearSession, json, requireMethod } from './_lib.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  clearSession(res);
  json(res, 200, { ok: true });
}
