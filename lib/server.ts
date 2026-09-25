import {db} from './database';
export {db} from './database';
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const rows = async (sql:string,...args:any[]) => (await db().prepare(sql).bind(...args).all()).results as any[];
export const one = async (sql:string,...args:any[]) => await db().prepare(sql).bind(...args).first() as any;
export const run = async (sql:string,...args:any[]) => await db().prepare(sql).bind(...args).run();
export class AppError extends Error { constructor(message:string,public status=400) { super(message); } }
export const must = (ok:any,msg:string,status=400) => { if(!ok) throw new AppError(msg,status); };
export const clean = (value:any,max=80) => { must(typeof value==='string','Compila i campi richiesti.'); const s=value.trim().replace(/\s+/g,' '); must(s.length>0&&s.length<=max,`Inserisci da 1 a ${max} caratteri.`); return s; };
export const int = (v:any,min=0,max=1000000) => { const n=Number(v); must(Number.isInteger(n)&&n>=min&&n<=max,`Inserisci un numero intero tra ${min} e ${max}.`); return n; };
export const namekey = (a:string,b:string) => `${a}|${b}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}|]/gu,'');
const hex = (bytes:ArrayBuffer|Uint8Array) => Array.from(new Uint8Array(bytes as ArrayBuffer)).map(b=>b.toString(16).padStart(2,'0')).join('');
export async function hash(password:string,salt=hex(crypto.getRandomValues(new Uint8Array(16)))) { const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']); const out=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256); return salt+':'+hex(out); }
export async function verify(password:string,stored:string) { const actual=await hash(password,stored.split(':')[0]); let mismatch=actual.length^stored.length; for(let i=0;i<actual.length;i++) mismatch|=actual.charCodeAt(i)^stored.charCodeAt(i); return mismatch===0; }
export async function user(req:Request) { const token=req.headers.get('cookie')?.match(/(?:^|;\s*)bv_session=([^;]+)/)?.[1]; if(!token)return null; return one('SELECT u.id,u.username,u.name,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1',token,Date.now()); }
export const admin = (u:any) => must(u?.role==='admin','Accesso riservato agli organizzatori.',403);
export async function ownList(id:string,u:any) { const l=await one('SELECT * FROM lists WHERE id=?',id); must(l,'Lista non trovata.',404); must(u.role==='admin'||l.owner_id===u.id,'Non puoi gestire questa lista.',403); return l; }
export async function log(event:string,actor:string|null,owner:string|null,message:string) { await run('INSERT INTO activity (id,event_id,actor_id,owner_id,message,created_at) VALUES (?,?,?,?,?,?)',uid(),event,actor,owner,message,now()); }
export async function rate(key:string,limit:number,window=600000) { const t=Date.now(); await run('INSERT INTO attempts (key,count,until) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN attempts.until<? THEN 1 ELSE attempts.count+1 END,until=CASE WHEN attempts.until<? THEN excluded.until ELSE attempts.until END',key,t+window,t,t); const r=await one('SELECT count FROM attempts WHERE key=?',key); must(r.count<=limit,'Troppi tentativi. Attendi qualche minuto e riprova.',429); }
export function cookie(token:string,req:Request,remove=false) { return `bv_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${remove?0:604800}${new URL(req.url).protocol==='https:'?'; Secure':''}`; }
export async function bootstrap(username:string,password:string) {
 const initial = username === (process.env.BOAVIDA_ADMIN_USERNAME||'tommaso')
  ? {id:'owner',name:'Tommaso',role:'admin',hash:process.env.BOAVIDA_ADMIN_HASH,plain:process.env.BOAVIDA_ADMIN_PASSWORD}
  : username === (process.env.BOAVIDA_PR_USERNAME||'pr.boavida')
   ? {id:'initial-pr',name:'PR BoaVida',role:'pr',hash:process.env.BOAVIDA_PR_HASH,plain:process.env.BOAVIDA_PR_PASSWORD}
   : null;
 if(!initial) return;
 const stored=initial.hash||(initial.plain?await hash(initial.plain):null);
 if(!stored || !(await verify(password,stored))) return;
 await run('INSERT OR IGNORE INTO users (id,username,name,password,role,active,created_at) VALUES (?,?,?,?,?,1,?)',initial.id,username,initial.name,stored,initial.role,now());
}
export async function ensureEvent() { await run('INSERT OR IGNORE INTO events (id,title,location,starts_at,created_at) VALUES (?,?,?,?,?)','opening','BoaVida · Opening Night',"Sabbie Mobili · Chignolo d’Isola",'2026-10-02T19:00:00.000Z',now()); }
export const defaultList = async (event:string,owner:string,name:string,cap:number) => run("INSERT INTO lists (id,event_id,owner_id,kind,name,capacity,token,created_at) SELECT ?,?,?,'pista',?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM lists WHERE event_id=? AND owner_id=? AND kind='pista')",uid(),event,owner,`Lista ${name}`,cap,uid().replaceAll('-',''),now(),event,owner);
export async function addGuest(list:any,input:any,u:any,publicJoin=false) {
 const first=clean(input.first_name),last=clean(input.last_name); const id=uid(); const key=namekey(first,last)+(u&&input.homonym?`|${id}`:'');
 const reqId=input.request_id?clean(input.request_id,100):uid();
 const prev=await one('SELECT id,list_id,first_name,last_name FROM guests WHERE request_id=?',reqId); if(prev&&prev.list_id===list.id)return {...prev,repeated:true};
 const event=await one('SELECT * FROM events WHERE id=?',list.event_id); must(event,'Evento non trovato.',404);
 if(publicJoin) { must(input.confirmed===true,'Conferma di aver scelto la lista corretta.'); must(!input.website,'Richiesta non valida.'); }
 try {
 const result=await run(`INSERT INTO guests (id,event_id,list_id,first_name,last_name,name_key,request_id,created_at)
 SELECT ?,?,?,?,?,?,?,? FROM lists l JOIN events e ON e.id=l.event_id JOIN users u ON u.id=l.owner_id
 WHERE l.id=? AND (?=0 OR (e.open=1 AND l.open=1 AND u.active=1 AND (e.closes_at IS NULL OR e.closes_at>?)))
 AND (SELECT COUNT(*) FROM guests WHERE list_id=l.id)<l.capacity
 AND (SELECT COUNT(*) FROM guests g JOIN lists gl ON gl.id=g.list_id WHERE g.event_id=e.id AND gl.kind=l.kind)<CASE WHEN l.kind='pista' THEN e.list_cap ELSE e.table_cap END`,id,list.event_id,list.id,first,last,key,reqId,now(),list.id,publicJoin?1:0,now());
 must(result.meta.changes===1,'Iscrizioni chiuse o posti esauriti. Contatta il tuo PR.',409);
 } catch(e:any) { if(/UNIQUE/.test(e.message)) throw new AppError('Questo nome è già presente nelle liste dell’evento. In caso di omonimia, contatta il PR.',409); throw e; }
 await log(list.event_id,u?.id??null,list.owner_id,`${first} ${last} aggiunto a ${list.name}`);
 return one('SELECT id,first_name,last_name FROM guests WHERE id=?',id);
}
