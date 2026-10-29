import {searchBangumi,searchManga,mangaDetail,chapters,pages,narou,upstream,bangumiWork} from '../../../lib/books/sources';
export async function GET(req:Request){
 const p=new URL(req.url).searchParams;const action=p.get('action')||'search',source=p.get('source')||'bangumi',id=p.get('id')||'';const q=(p.get('q')||'').trim();const page=Number(p.get('page')||1),kind=p.get('kind')==='manga'?'manga':'novel',sort=p.get('sort')||'popular';
 if(q.length>100||!Number.isInteger(page)||page<1||page>100)return Response.json({error:'搜索参数无效'},{status:400});
 try{
 if(action==='status')return Response.json({sources:[{id:'bangumi',name:'Bangumi',state:'enabled',description:'作品资料、评分与匹配候选'},{id:'mangadex',name:'MangaDex',state:'enabled',description:'全年龄日漫，简体 / 繁体中文章节；不保证每部都有可读章节'},{id:'narou',name:'小説家になろう',state:process.env.NAROU_ENABLED==='true'?'enabled':'pending',description:'日文作品发现；完成平台注册与条件核对后启用'},{id:'extensions',name:'Maki / Suwayomi',state:'pending',description:'需要独立扩展运行服务；当前未连接、未完成端到端验证'},{id:'lnreader',name:'LNReader 插件',state:'pending',description:'需要独立小说解析服务；当前未连接、未完成端到端验证'},{id:'licensed',name:'中文授权内容源',state:'pending',description:'逐一核验授权、搜索、目录与正文后上线'}]});
 if(action==='search'){
 const names=source==='all'?(kind==='manga'?['bangumi','mangadex']:['bangumi',...(process.env.NAROU_ENABLED==='true'?['narou']:[])]):[source];
 if(names.some(n=>!['bangumi','mangadex','narou'].includes(n)))return Response.json({error:'不支持的来源'},{status:400});
 const r=await Promise.all(names.map(async n=>{try{const data=n==='bangumi'?await searchBangumi(q,kind,page,sort,p.get('tag')||''):n==='mangadex'?await searchManga(q,page,sort):await narou(q,page);return {...data,status:{source:n,ok:true,message:'已更新'}};}catch(e){return {items:[],total:0,status:{source:n,ok:false,message:e instanceof Error?e.message:'来源连接失败'}};}}));
 return Response.json({items:r.flatMap(x=>x.items),total:r.reduce((s,x)=>s+x.total,0),statuses:r.map(x=>x.status)},{headers:{'Cache-Control':'private, max-age=60'}});
 }
 if(source==='mangadex'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return Response.json({error:'作品或章节 ID 无效'},{status:400});
 if(action==='detail'&&source==='mangadex')return Response.json(await mangaDetail(id));
 if(action==='detail'&&source==='bangumi'&&/^\d{1,10}$/.test(id)){const d=await upstream(`https://api.bgm.tv/v0/subjects/${id}`);if(d.nsfw||d.type!==1)throw new Error('不支持的作品');return Response.json(bangumiWork(d));}
 if(source==='mangadex'&&action==='chapters')return Response.json(await chapters(id,page));
 if(source==='mangadex'&&action==='pages')return Response.json(await pages(id));
 return Response.json({error:'不支持的操作'},{status:400});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'来源暂时不可用'},{status:502});}
}
