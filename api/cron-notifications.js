import webpush from 'web-push';
import { ensureSchema, json, withClient } from './_lib.js';

const dayNumber=value=>Math.floor(Date.parse(`${value}T00:00:00Z`)/86400000);

export default async function handler(req,res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return json(res,401,{error:'Não autorizado.'});
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return json(res,503,{error:'VAPID não configurado.'});
  try {
    webpush.setVapidDetails('mailto:admin@estoque-casa.local',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
    const result=await withClient(async client=>{await ensureSchema(client);const [products,subscriptions]=await Promise.all([client.query('SELECT data FROM products'),client.query('SELECT endpoint,data FROM push_subscriptions')]);return{products:products.rows.map(r=>r.data),subscriptions:subscriptions.rows};});
    const today=dayNumber(new Date().toISOString().slice(0,10));
    const alerts=result.products.flatMap(p=>(p.expirations||[]).filter(e=>!e.consumed&&e.date).map(e=>({name:p.name,days:dayNumber(e.date)-today}))).filter(a=>a.days<=15).sort((a,b)=>a.days-b.days);
    if(!alerts.length) return json(res,200,{sent:0,alerts:0});
    const first=alerts[0],body=first.days<0?`${first.name} está vencido.`:first.days===0?`${first.name} vence hoje.`:`${first.name} vence em ${first.days} dia(s).`;
    let sent=0;
    await Promise.all(result.subscriptions.map(async row=>{try{await webpush.sendNotification(row.data,JSON.stringify({title:'Estoque Casa',body,url:'/'}));sent++;}catch(error){if(error.statusCode===404||error.statusCode===410)await withClient(client=>client.query('DELETE FROM push_subscriptions WHERE endpoint=$1',[row.endpoint]));else console.error(error);}}));
    json(res,200,{sent,alerts:alerts.length});
  } catch(error) { console.error(error);json(res,500,{error:'Falha no envio das notificações.'}); }
}
