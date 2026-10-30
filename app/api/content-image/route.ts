import {bridgeConfigured} from '../../../lib/books/bridge';
import {imageResponse} from '../../../lib/books/network';
export async function GET(req:Request){
 const p=new URL(req.url).searchParams;const id=p.get('id')||'',workId=p.get('workId')||'',index=Number(p.get('index'));
 if(!bridgeConfigured()||!id||!workId||id.length>2000||workId.length>1500||!p.has('index')||!Number.isInteger(index)||index<0||index>=500)return new Response('Invalid image',{status:400});
 try{const base=new URL(process.env.CONTENT_BRIDGE_URL!);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw new Error();const u=new URL(base.href.replace(/\/$/,'')+'/v1/image');u.search=new URLSearchParams({id,workId,index:String(index)}).toString();const r=await fetch(u,{headers:{Authorization:`Bearer ${process.env.CONTENT_BRIDGE_TOKEN}`},redirect:'manual',signal:AbortSignal.timeout(15000)});return imageResponse(r);}catch{return new Response('Image unavailable',{status:502});}
}
