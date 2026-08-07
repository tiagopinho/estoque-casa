import { ensureSchema, json, requireAuth, requireMethod, withClient } from './_lib.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST') || !requireAuth(req, res)) return;
  const subscription=req.body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return json(res,400,{error:'Inscrição de notificação inválida.'});
  try {
    await withClient(async client=>{await ensureSchema(client);await client.query('INSERT INTO push_subscriptions(endpoint,data) VALUES($1,$2) ON CONFLICT(endpoint) DO UPDATE SET data=$2',[String(subscription.endpoint),subscription]);});
    json(res,200,{ok:true});
  } catch(error) { console.error(error);json(res,500,{error:'Não foi possível ativar as notificações.'}); }
}
