import GuestInvite from './guest-invite';
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <GuestInvite token={token}/>;}
