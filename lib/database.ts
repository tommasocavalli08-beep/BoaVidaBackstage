import {neon} from '@neondatabase/serverless';
import {schemaStatements} from '../db/schema';

type Query = {text:string; params:unknown[]};
type Result = {rows:Record<string,any>[]; rowCount:number};
export type DatabaseDriver = {
  query: (query:Query)=>Promise<Result>;
  transaction: (queries:Query[])=>Promise<Result[]>;
};
const writeLock:Query={text:'SELECT pg_advisory_xact_lock(728410231)',params:[]};
let driver:DatabaseDriver|undefined;
let initialized:Promise<void>|undefined;

function connection():DatabaseDriver {
  if(driver)return driver;
  const url=process.env.DATABASE_URL||process.env.POSTGRES_URL;
  if(!url)throw new Error('DATABASE_NOT_CONFIGURED');
  const sql=neon(url,{fullResults:true});
  const normalize=(r:any):Result=>({
    rows:r.rows.map((row:Record<string,any>)=>Object.fromEntries(Object.entries(row).map(([key,value])=>{
      const field=r.fields.find((f:any)=>f.name===key);
      return [key,field?.dataTypeID===20&&value!==null&&Number.isSafeInteger(Number(value))?Number(value):value];
    }))),
    rowCount:r.rowCount??r.rows.length,
  });
  driver={
    query:async q=>normalize(await sql.query(q.text,q.params)),
    transaction:async queries=>(await sql.transaction(
      queries.map(q=>sql.query(q.text,q.params)),{isolationLevel:'ReadCommitted'}
    )).map(normalize),
  };
  return driver;
}

export async function initializeDatabase(){
  initialized??=connection().transaction([writeLock,...schemaStatements.map(text=>({text,params:[]}))])
    .then(()=>{}).catch(error=>{initialized=undefined;throw error;});
  await initialized;
}

function query(sql:string,params:unknown[]):Query{
  let position=0;
  const ignore=/^INSERT OR IGNORE /i.test(sql);
  const text=sql.replace(/^INSERT OR IGNORE /i,'INSERT ').replace(/\?/g,()=>`$${++position}`)
    +(ignore?' ON CONFLICT DO NOTHING':'');
  return {text,params};
}

async function execute(queries:Query[],write=false){
  await initializeDatabase();
  try {
    // READ COMMITTED plus one transaction lock makes count-and-write capacity
    // checks atomic even when several Vercel instances receive invitations.
    return write?(await connection().transaction([writeLock,...queries])).slice(1)
      :await Promise.all(queries.map(q=>connection().query(q)));
  }catch(error:any){
    if(error.code==='23505')throw new Error('UNIQUE constraint failed',{cause:error});
    throw error;
  }
}

class Statement {
  constructor(readonly text:string,readonly params:unknown[]=[]){ }
  bind(...params:unknown[]){return new Statement(this.text,params);}
  async all(){return {results:(await execute([query(this.text,this.params)]))[0].rows};}
  async first(){return (await this.all()).results[0]??null;}
  async run(){const result=(await execute([query(this.text,this.params)],true))[0];return {meta:{changes:result.rowCount}};}
}
const database={
  prepare:(text:string)=>new Statement(text),
  batch:async(statements:Statement[])=>(await execute(statements.map(s=>query(s.text,s.params)),true))
    .map(r=>({results:r.rows,meta:{changes:r.rowCount}})),
};
export const db=()=>database;

// Tests use a real local PostgreSQL engine, with the same SQL and permission checks.
// This is not an HTTP endpoint and is unavailable in a production process.
export function setTestDatabase(value:DatabaseDriver){
  if(process.env.NODE_ENV!=='test')throw new Error('Test database is disabled outside tests.');
  driver=value;initialized=undefined;
}
