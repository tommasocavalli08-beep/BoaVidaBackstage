import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {setTestDatabase} from '../lib/database';
import {GET,POST,PATCH,DELETE} from '../app/api/boa/[...path]/route';

process.env.NODE_ENV='test';
process.env.BOAVIDA_ADMIN_PASSWORD='Test-administrator-only-123!';
process.env.BOAVIDA_PR_PASSWORD='Test-initial-pr-only-123!';
const pg=new PGlite();
const normalize=(r:any)=>({rows:r.rows.map((row:any)=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v]))),rowCount:r.affectedRows??r.rows.length});
setTestDatabase({query:async q=>normalize(await pg.query(q.text,q.params)),transaction:qs=>pg.transaction(async tx=>{const results=[];for(const q of qs)results.push(normalize(await tx.query(q.text,q.params)));return results;})});
const methods={GET,POST,PATCH,DELETE};
async function call(path:string,method:keyof typeof methods='GET',body?:unknown,session='',expected=200){
 const request=new Request('https://boavida.test/api/boa/'+path,{method,headers:{...(body?{'Content-Type':'application/json','Origin':'https://boavida.test'}:{}),...(session?{Cookie:session}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const r=await methods[method](request);const data=await r.json();
 assert.equal(r.status,expected,JSON.stringify({method,path,data}));
 return {data,session:r.headers.get('Set-Cookie')?.split(';')[0]||''};
}

test('PR privacy, availability and capacity checks on real PostgreSQL',async t=>{
 try{
 await call('state','GET',undefined,'',401);
 await call('login','POST',{username:'pr.boavida',password:'incorrect'},'',401);
 const owner=(await call('login','POST',{username:'tommaso',password:process.env.BOAVIDA_ADMIN_PASSWORD})).session;
 const initial=(await call('login','POST',{username:'pr.boavida',password:process.env.BOAVIDA_PR_PASSWORD})).session;
 assert.equal((await call('state','GET',undefined,initial)).data.user.role,'pr');
 const alice={username:'pr.alice',name:'Alice Test',password:'Test-only-Alice-123!',role:'pr'};
 const bob={username:'pr.bob',name:'Bob Test',password:'Test-only-Bob-123!',role:'pr'};
 const aid=(await call('users','POST',alice,owner)).data.id;
 const bid=(await call('users','POST',bob,owner)).data.id;
 const event={title:'Test riservatezza',location:'Test',starts_at:'2026-10-02T19:00:00.000Z',closes_at:null,open:true,list_price:1500,table_price:2500,list_cap:3,table_cap:12,max_tables:3,default_table_cap:4,note:''};
 const eid=(await call('events','POST',event,owner)).data.id;
 const a=(await call('login','POST',alice)).session;const b=(await call('login','POST',bob)).session;
 const state=(session:string)=>call('state?event='+eid,'GET',undefined,session).then(r=>r.data);
 const as=await state(a),bs=await state(b);const al=as.lists[0],bl=bs.lists[0];
 const at=(await call('lists','POST',{event_id:eid,name:'Tavolo Alice',capacity:4,owner_id:bid},a)).data.id;
 const bt=(await call('lists','POST',{event_id:eid,name:'Tavolo Bob riservato',capacity:4},b)).data.id;
 const bg=(await call('guests','POST',{list_id:bl.id,first_name:'Ospite',last_name:'Riservato'},b)).data;
 await t.test('only own records, with aggregate table counts',async()=>{
  const s=await state(a);
  assert(s.lists.every((l:any)=>l.owner_id===aid));assert(s.guests.every((g:any)=>g.owner_id===aid));
  assert.equal(s.users.length,1);assert.equal(s.users[0].id,aid);
  assert.equal(s.lists.find((l:any)=>l.id===at).owner_id,aid);
  assert.deepEqual(s.table_availability,{booked:2,available:1,max:3,seats_available:4});
  const payload=JSON.stringify(s);assert(!payload.includes(bt));assert(!payload.includes(bl.token));assert(!payload.includes('Bob Test'));assert(!payload.includes('Riservato'));
 });
 await t.test('server rejects every attempted cross-PR edit',async()=>{
  await call('guests','POST',{list_id:bl.id,first_name:'No',last_name:'Accesso'},a,403);
  await call('lists/'+bt,'PATCH',{name:'No accesso'},a,403);
  await call('lists/'+bt,'DELETE',{},a,403);
  await call('guests/'+bg.id,'PATCH',{first_name:'No',last_name:'Accesso'},a,403);
  await call('guests/'+bg.id,'DELETE',{},a,403);
  await call('users','POST',{username:'no',name:'No',password:'test123',role:'admin'},a,403);
  await call('events/'+eid,'PATCH',event,a,403);
 });
 let ag:any;
 await t.test('guest receives a named confirmation without a code',async()=>{
  const invitation=(await call('invite/'+al.token)).data;
  assert.equal(invitation.list.owner_name,'Alice Test');assert(!('guests' in invitation));
  const request={first_name:'Giulia',last_name:'Bianchi',confirmed:true,request_id:crypto.randomUUID()};
  ag=(await call('invite/'+al.token,'POST',request)).data;
  assert.equal(ag.first_name,'Giulia');assert(!('code' in ag));
  assert.equal((await call('invite/'+al.token,'POST',request)).data.id,ag.id);
  await call('invite/'+al.token,'POST',{...request,request_id:crypto.randomUUID()},'',409);
 });
 await t.test('simultaneous invitations cannot exceed total capacity',async()=>{
  const results=await Promise.all([1,2,3,4].map(async n=>{
   const r=await POST(new Request('https://boavida.test/api/boa/invite/'+al.token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({first_name:'Parallel'+n,last_name:'Test',confirmed:true,request_id:crypto.randomUUID()})}));return r.status;
  }));assert.equal(results.filter(s=>s===200).length,1);assert.equal(results.filter(s=>s===409).length,3);
 });
 await t.test('simultaneous table bookings respect the shared limit',async()=>{
  const results=await Promise.all([1,2].map(async n=>{
   const r=await POST(new Request('https://boavida.test/api/boa/lists',{method:'POST',headers:{'Content-Type':'application/json',Cookie:a},body:JSON.stringify({event_id:eid,name:'Ultimo tavolo '+n,capacity:4})}));return r.status;
  }));assert.deepEqual(results.sort(),[200,409]);
  assert.equal((await state(b)).table_availability.available,0);
 });
 await t.test('own guest edits and organizer check-in remain usable',async()=>{
  await call('guests/'+ag.id,'PATCH',{first_name:'Giulia',last_name:'Rossi',list_id:at},a);
  await call('guests/'+ag.id,'PATCH',{checkin:true},a,403);
  await call('guests/'+ag.id,'PATCH',{checkin:true,paid:true},owner);
  const updated=(await state(a)).guests.find((g:any)=>g.id===ag.id);
  assert.equal(updated.last_name,'Rossi');assert.equal(updated.kind,'tavolo');assert(updated.checked_at);assert.equal(updated.price,2500);
 });
 await t.test('changed password and disabled account cannot use bootstrap again',async()=>{
  await call('password','POST',{current:process.env.BOAVIDA_PR_PASSWORD,password:'Changed-test-password-123!'},initial);
  await call('login','POST',{username:'pr.boavida',password:process.env.BOAVIDA_PR_PASSWORD},'',401);
  await call('users/'+aid,'PATCH',{active:false},owner);
  await call('state','GET',undefined,a,401);await call('login','POST',alice,'',401);
 });
 }finally{await pg.close();}
});
