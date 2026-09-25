import { db,uid,now,rows,one,run,AppError,must,clean,int,namekey,hash,verify,user,admin,ownList,log,rate,cookie,bootstrap,ensureEvent,defaultList,addGuest } from '@/lib/server';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const json=(data:any,status=200,headers:any={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
async function handle(req:Request) {
 try {
 const url=new URL(req.url), path=url.pathname.replace('/api/boa/','').split('/'), method=req.method;
 const mutating=method!=='GET';
 if(mutating) { const origin=req.headers.get('origin'); must(!origin||origin===url.origin,'Origine richiesta non valida.',403); must(req.headers.get('content-type')?.includes('application/json'),'Formato non valido.',415); }
 const text=mutating?await req.text():''; must(text.length<=15000,'Richiesta troppo grande.',413); const b=text?JSON.parse(text):{};
 if(path[0]==='login'&&method==='POST') {
 const username=clean(b.username,40).toLowerCase(),password=clean(b.password,128);
 await rate('login:'+username+':'+(req.headers.get('cf-connecting-ip')||'shared'),20);
 let u=await one('SELECT * FROM users WHERE username=?',username);
 if(!u){await bootstrap(username,password);u=await one('SELECT * FROM users WHERE username=?',username);}
 must(u&&u.active&&await verify(password,u.password),'Username o password non corretti.',401);
 await ensureEvent(); const token=uid()+uid();
 await db().batch([db().prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()),db().prepare('INSERT INTO sessions (token,user_id,expires) VALUES (?,?,?)').bind(token,u.id,Date.now()+604800000)]);
 return json({ok:true},200,{'Set-Cookie':cookie(token,req)});
 }
 if(path[0]==='invite') {
 const l=await one('SELECT l.*,u.name AS owner_name,u.active AS owner_active FROM lists l JOIN users u ON u.id=l.owner_id WHERE l.token=?',path[1]); must(l,'Questo invito non è valido o è stato sostituito. Chiedi un nuovo link al PR.',404);
 const e=await one('SELECT * FROM events WHERE id=?',l.event_id);
 if(method==='GET') {
 const used=await one('SELECT COUNT(*) AS n FROM guests WHERE list_id=?',l.id);
 const total=await one('SELECT COUNT(*) AS n FROM guests g JOIN lists l ON g.list_id=l.id WHERE g.event_id=? AND l.kind=?',e.id,l.kind);
 const remaining=Math.max(0,Math.min(l.capacity-used.n,(l.kind==='pista'?e.list_cap:e.table_cap)-total.n));
 return json({list:{name:l.name,kind:l.kind,owner_name:l.owner_name},event:{title:e.title,location:e.location,starts_at:e.starts_at,note:e.note},price:l.price??(l.kind==='pista'?e.list_price:e.table_price),remaining,open:!!(e.open&&l.open&&l.owner_active&&(!e.closes_at||e.closes_at>now())&&remaining>0)});
 }
 if(method==='POST'){await rate('join:'+(req.headers.get('cf-connecting-ip')||l.token),60);return json(await addGuest(l,b,null,true));}
 }
 const u=await user(req);must(u,'Accedi per continuare.',401);
 if(path[0]==='auth'&&method==='GET')return json({user:u});
 if(path[0]==='logout'&&method==='POST'){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)bv_session=([^;]+)/)?.[1];if(token)await run('DELETE FROM sessions WHERE token=?',token);return json({ok:true},200,{'Set-Cookie':cookie('',req,true)});}
 if(path[0]==='password'&&method==='POST') {
 const me=await one('SELECT password FROM users WHERE id=?',u.id);must(await verify(clean(b.current,128),me.password),'La password attuale non è corretta.');const p=clean(b.password,128);must(p.length>=6,'Usa almeno 6 caratteri.');await db().batch([db().prepare('UPDATE users SET password=? WHERE id=?').bind(await hash(p),u.id),db().prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id)]);return json({ok:true},200,{'Set-Cookie':cookie('',req,true)});
 }
 if(path[0]==='state'&&method==='GET') {
 await ensureEvent();const events=await rows('SELECT * FROM events ORDER BY starts_at DESC');const e=events.find(e=>e.id===url.searchParams.get('event'))||events[0];
 const prs=await rows("SELECT u.id,u.name FROM users u WHERE u.active=1 AND u.role='pr' AND NOT EXISTS (SELECT 1 FROM lists l WHERE l.event_id=? AND l.owner_id=u.id AND l.kind='pista')"+(u.role==='admin'?'':' AND u.id=?'),e.id,...(u.role==='admin'?[]:[u.id]));
 // Idempotent provisioning: one dance-floor list per PR per event.
 for(const p of prs)await defaultList(e.id,p.id,p.name,e.list_cap);
 const scope=u.role==='admin'?'':' AND l.owner_id=?';const args=u.role==='admin'?[e.id]:[e.id,u.id];
 const lists=await rows(`SELECT l.*,u.name AS owner_name,u.active AS owner_active,(SELECT COUNT(*) FROM guests WHERE list_id=l.id) AS count FROM lists l JOIN users u ON u.id=l.owner_id WHERE l.event_id=?${scope} ORDER BY l.kind,l.created_at`,...args);
 const guests=await rows(`SELECT g.*,l.name AS list_name,l.kind,l.owner_id,u.name AS owner_name,COALESCE(l.price,CASE WHEN l.kind='pista' THEN e.list_price ELSE e.table_price END) AS price FROM guests g JOIN lists l ON l.id=g.list_id JOIN events e ON e.id=g.event_id JOIN users u ON u.id=l.owner_id WHERE g.event_id=?${scope} ORDER BY LOWER(g.last_name),LOWER(g.first_name)`,...args);
 const users=u.role==='admin'?await rows('SELECT id,name,username,role,active,created_at FROM users ORDER BY name'):[u];
 const activity=await rows(`SELECT a.*,u.name AS actor_name FROM activity a LEFT JOIN users u ON u.id=a.actor_id WHERE a.event_id=?${u.role==='admin'?'':' AND a.owner_id=?'} ORDER BY a.created_at DESC LIMIT 40`,...args);
 const occupied=await one("SELECT COUNT(*) AS n,COALESCE(SUM(capacity),0) AS seats FROM lists WHERE event_id=? AND kind='tavolo'",e.id);
 const table_availability={booked:Number(occupied.n),available:Math.max(0,e.max_tables-Number(occupied.n)),max:e.max_tables,seats_available:Math.max(0,e.table_cap-Number(occupied.seats))};
 return json({user:u,events,event:e,lists,guests,users,activity,table_availability,updated_at:now()});
 }
 if(path[0]==='events'&&['POST','PATCH'].includes(method)) {
 admin(u);const title=clean(b.title,100),location=clean(b.location,150);const starts=new Date(b.starts_at);must(!isNaN(starts.getTime()),'Inserisci la data della serata.');const closes=b.closes_at?new Date(b.closes_at):null;must(!closes||!isNaN(closes.getTime()),'Data di chiusura non valida.');
 const vals=[title,location,starts.toISOString(),closes?.toISOString()??null,b.open?1:0,int(b.list_price),int(b.table_price),int(b.list_cap,0,20000),int(b.table_cap,0,20000),int(b.max_tables,0,1000),int(b.default_table_cap,1,1000),String(b.note||'').slice(0,1000)];
 let id=path[1];if(method==='POST'){id=uid();await run('INSERT INTO events (title,location,starts_at,closes_at,open,list_price,table_price,list_cap,table_cap,max_tables,default_table_cap,note,id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',...vals,id,now());}else{
 must(await one('SELECT id FROM events WHERE id=?',id),'Evento non trovato.',404);
 const counts=await rows('SELECT l.kind,COUNT(g.id) AS n FROM lists l LEFT JOIN guests g ON g.list_id=l.id WHERE l.event_id=? GROUP BY l.kind',id);const reserved=await one("SELECT COUNT(*) AS n,COALESCE(SUM(capacity),0) AS seats FROM lists WHERE event_id=? AND kind='tavolo'",id);
 must(vals[7]>= (counts.find(c=>c.kind==='pista')?.n||0)&&vals[8]>=reserved.seats&&vals[9]>=reserved.n,'La capienza non può essere inferiore alle iscrizioni e ai posti già assegnati ai tavoli.');
 await run('UPDATE events SET title=?,location=?,starts_at=?,closes_at=?,open=?,list_price=?,table_price=?,list_cap=?,table_cap=?,max_tables=?,default_table_cap=?,note=? WHERE id=?',...vals,id);
 }await log(id,u.id,null,method==='POST'?'Evento creato':'Impostazioni evento aggiornate');return json({id});
 }
 if(path[0]==='users'&&method==='POST') {
 admin(u);const username=clean(b.username,40).toLowerCase();must(/^[a-z0-9._-]+$/.test(username),'Lo username può contenere lettere, numeri, punti, trattini.');const name=clean(b.name);const pass=clean(b.password,128);must(pass.length>=6,'Usa una password di almeno 6 caratteri.');const role=b.role==='admin'?'admin':'pr';const id=uid();
 try{await run('INSERT INTO users (id,username,name,password,role,active,created_at) VALUES (?,?,?,?,?,1,?)',id,username,name,await hash(pass),role,now());}catch(e:any){if(/UNIQUE/.test(e.message))throw new AppError('Questo username esiste già.');throw e;}
 if(role==='pr'){const events=await rows('SELECT id,list_cap FROM events');for(const e of events)await defaultList(e.id,id,name,e.list_cap);}return json({id});
 }
 if(path[0]==='users'&&method==='PATCH') {
 admin(u);const target=await one('SELECT * FROM users WHERE id=?',path[1]);must(target,'Profilo non trovato.',404);must(!(target.id===u.id&&b.active===false),'Non puoi disattivare il tuo accesso.');
 const name=clean(b.name??target.name);await run('UPDATE users SET name=?,active=? WHERE id=?',name,b.active===undefined?target.active:(b.active?1:0),target.id);
 if(b.password){const p=clean(b.password,128);must(p.length>=6,'Usa almeno 6 caratteri.');await run('UPDATE users SET password=? WHERE id=?',await hash(p),target.id);}
 if(b.active===false||b.password)await run('DELETE FROM sessions WHERE user_id=?',target.id);return json({ok:true});
 }
 if(path[0]==='lists'&&method==='POST') {
 const e=await one('SELECT * FROM events WHERE id=?',b.event_id);must(e,'Evento non trovato.',404);const owner=u.role==='admin'?clean(b.owner_id):u.id;const p=await one('SELECT id,active FROM users WHERE id=?',owner);must(p?.active,'Seleziona un profilo attivo.');const name=clean(b.name);const cap=int(b.capacity,1,1000);const price=u.role==='admin'&&b.price!==null&&b.price!==undefined?int(b.price):null;const id=uid();
 const result=await run(`INSERT INTO lists (id,event_id,owner_id,kind,name,capacity,price,token,created_at) SELECT ?,?,?,'tavolo',?,?,?,?,? FROM events e WHERE e.id=? AND (SELECT COUNT(*) FROM lists WHERE event_id=e.id AND kind='tavolo')<e.max_tables AND (SELECT COALESCE(SUM(capacity),0) FROM lists WHERE event_id=e.id AND kind='tavolo')+?<=e.table_cap`,id,e.id,owner,name,cap,price,uid().replaceAll('-',''),now(),e.id,cap);
 must(result.meta.changes===1,'Limite di tavoli o posti assegnabili raggiunto.',409);await log(e.id,u.id,owner,`Tavolo ${name} creato`);return json({id});
 }
 if(path[0]==='lists'&&method==='PATCH') {
 const l=await ownList(path[1],u);if(b.rotate){const token=uid().replaceAll('-','');await run('UPDATE lists SET token=? WHERE id=?',token,l.id);await log(l.event_id,u.id,l.owner_id,`Link di ${l.name} rigenerato`);return json({ok:true});}
 const cap=int(b.capacity??l.capacity,1,20000);const count=await one('SELECT COUNT(*) AS n FROM guests WHERE list_id=?',l.id);must(cap>=count.n,'La capienza non può essere inferiore agli iscritti.');
 if(l.kind==='pista'&&u.role!=='admin')must(cap===l.capacity,'Solo gli organizzatori possono cambiare la quota della lista.',403);
 const name=clean(b.name??l.name);const price=u.role==='admin'&&b.price!==undefined?(b.price===null?null:int(b.price)):l.price;
 const result=await run(`UPDATE lists SET name=?,capacity=?,price=?,open=?,note=? WHERE id=? AND (kind='pista' OR (SELECT COALESCE(SUM(capacity),0) FROM lists other WHERE other.event_id=lists.event_id AND other.kind='tavolo' AND other.id<>lists.id)+?<=(SELECT table_cap FROM events WHERE id=lists.event_id))`,name,cap,price,b.open===undefined?l.open:(b.open?1:0),String(b.note??l.note).slice(0,500),l.id,cap);must(result.meta.changes===1,'Posti tavolo disponibili insufficienti.',409);await log(l.event_id,u.id,l.owner_id,`${name} aggiornato`);return json({ok:true});
 }
 if(path[0]==='lists'&&method==='DELETE') {
 const l=await ownList(path[1],u);must(l.kind==='tavolo','La lista pista principale non può essere eliminata.');await db().batch([db().prepare('DELETE FROM guests WHERE list_id=?').bind(l.id),db().prepare('DELETE FROM lists WHERE id=?').bind(l.id)]);await log(l.event_id,u.id,l.owner_id,`Tavolo ${l.name} eliminato con i suoi iscritti`);return json({ok:true});
 }
 if(path[0]==='guests'&&method==='POST') {const l=await ownList(b.list_id,u);return json(await addGuest(l,b,u));}
 if(path[0]==='guests'&&['PATCH','DELETE'].includes(method)) {
 const g=await one('SELECT * FROM guests WHERE id=?',path[1]);must(g,'Ospite non trovato.',404);const l=await ownList(g.list_id,u);
 if(method==='DELETE'){await run('DELETE FROM guests WHERE id=?',g.id);await log(g.event_id,u.id,l.owner_id,`${g.first_name} ${g.last_name} rimosso da ${l.name}`);return json({ok:true});}
 if(b.checkin!==undefined||b.paid!==undefined){admin(u);const checked=b.checkin===undefined?g.checked_at:(b.checkin?g.checked_at||now():null);const paid=b.paid===undefined?g.paid:(b.paid?1:0);await run('UPDATE guests SET checked_at=?,paid=? WHERE id=?',checked,paid,g.id);await log(g.event_id,u.id,l.owner_id,`${g.first_name} ${g.last_name}: ${b.checkin!==undefined?(checked?'ingresso registrato':'ingresso annullato'):(paid?'pagamento registrato':'pagamento annullato')}`);return json({ok:true});}
 const first=clean(b.first_name),last=clean(b.last_name);const dest=b.list_id&&b.list_id!==l.id?await ownList(b.list_id,u):l;must(dest.event_id===g.event_id,'Non puoi spostare un ospite in un altro evento.');
 const key=(first===g.first_name&&last===g.last_name)?g.name_key:namekey(first,last)+(b.homonym?'|'+g.id:'');
 try{const result=await run(`UPDATE guests SET first_name=?,last_name=?,name_key=?,list_id=? WHERE id=? AND (SELECT COUNT(*) FROM guests WHERE list_id=? AND id<>?)<(SELECT capacity FROM lists WHERE id=?) AND (SELECT COUNT(*) FROM guests gg JOIN lists ll ON ll.id=gg.list_id WHERE gg.event_id=? AND ll.kind=? AND gg.id<>?)<(SELECT CASE WHEN ?='pista' THEN list_cap ELSE table_cap END FROM events WHERE id=?)`,first,last,key,dest.id,g.id,dest.id,g.id,dest.id,g.event_id,dest.kind,g.id,dest.kind,g.event_id);must(result.meta.changes===1,'La lista di destinazione è piena.',409);}catch(e:any){if(/UNIQUE/.test(e.message))throw new AppError('Nome già presente. Verifica l’eventuale omonimia.',409);throw e;}
 await log(g.event_id,u.id,dest.owner_id,`${first} ${last}: dati aggiornati${dest.id!==l.id?`, spostato in ${dest.name}`:''}`);return json({ok:true});
 }
 throw new AppError('Operazione non trovata.',404);
 }catch(e:any){if(!(e instanceof AppError))console.error('BoaVida API:',e);return json({error:e instanceof AppError?e.message: (e.message==='DATABASE_NOT_CONFIGURED'?'Il database non è ancora collegato. L’organizzatore deve completare la configurazione del sito.':e instanceof SyntaxError?'Dati non validi.':'Operazione non riuscita. I dati inseriti restano disponibili: riprova.')},e instanceof AppError?e.status:500);}
}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};
