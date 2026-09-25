export async function api(path:string,method='GET',body?:any):Promise<any> {
 const response=await fetch('/api/boa/'+path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
 const raw=await response.text();let data:any;try{data=JSON.parse(raw);}catch{throw new Error('Il server non ha risposto correttamente. Ricarica la pagina e riprova.');}if(!response.ok){const e:any=new Error(data.error||'Connessione non disponibile.');e.status=response.status;throw e;}return data;
}
export const euro=(cents:number)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:cents%100?2:0}).format((cents||0)/100);
export const date=(s:string,full=false)=>s?new Intl.DateTimeFormat('it-IT',{day:'numeric',month:full?'long':'short',...(full?{year:'numeric' as const}:{}),timeZone:'Europe/Rome'}).format(new Date(s)):'';
export const time=(s:string)=>s?new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'}).format(new Date(s)):'';
export const sortNames=(a:any,b:any)=>a.last_name.localeCompare(b.last_name,'it',{sensitivity:'base'})||a.first_name.localeCompare(b.first_name,'it',{sensitivity:'base'});
export function downloadCSV(guests:any[],title:string){
 const cell=(v:any)=>{let s=String(v??'');if(/^[\s]*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const data=[['Cognome','Nome','Lista / Tavolo','Tipo','PR','Ingresso EUR','Entrato','Pagato'],...[...guests].sort(sortNames).map(g=>[g.last_name,g.first_name,g.list_name,g.kind,g.owner_name,(g.price/100).toFixed(2).replace('.',','),g.checked_at?'Sì':'No',g.paid?'Sì':'No'])];
 const url=URL.createObjectURL(new Blob(['\uFEFF'+data.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='BoaVida-'+title.replace(/[^a-z0-9]/gi,'-')+'-A-Z.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}

export function requestKey(){if(typeof crypto!=="undefined"&&crypto.getRandomValues)return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,"0")).join("");return Date.now().toString(36)+Math.random().toString(36).slice(2);}
