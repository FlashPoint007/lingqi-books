import {bridgeConfigured,bridgeSources,bridgeSearch,bridgeChapters,bridgeContent} from '../../../lib/books/bridge';
import {searchBangumi,searchManga,mangaDetail,chapters,pages,narou,upstream,bangumiWork} from '../../../lib/books/sources';
export async function GET(req:Request){
 const p=new URL(req.url).searchParams;const action=p.get('action')||'search',source=p.get('source')||'bangumi',id=p.get('id')||'';const q=(p.get('q')||'').trim();const page=Number(p.get('page')||1),kind=p.get('kind')==='manga'?'manga':'novel',sort=p.get('sort')||'popular';
 if(q.length>100||!Number.isInteger(page)||page<1||page>100)return Response.json({error:'搜索参数无效'},{status:400});
 try{
 if(action==='bridge-status'){if(!bridgeConfigured())return Response.json({connected:false,sources:[],message:'尚未配置内容服务'});try{return Response.json({connected:true,sources:await bridgeSources()});}catch{return Response.json({connected:false,sources:[],message:'内容服务连接失败'});}}
 if(action==='status')return Response.json({sources:[{id:'bangumi',name:'Bangumi',state:'enabled',description:'作品资料、评分与匹配候选'},{id:'mangadex',name:'MangaDex',state:'enabled',description:'全年龄日漫，简体 / 繁体中文章节；不保证每部都有可读章节'},{id:'narou',name:'小説家になろう',state:process.env.NAROU_ENABLED==='true'?'enabled':'pending',description:'日文作品发现；完成平台注册与条件核对后启用'},{id:'extensions',name:'Suwayomi 漫画扩展',state:'pending',description:'已提供服务适配与受控图片读取；等待自托管实例，尚未实源验证'},{id:'lnreader',name:'LNReader 小说扩展',state:'pending',description:'已提供可信 ESM 插件宿主；原始插件需适配构建后逐源测试'},{id:'bridge',name:'在线小说与扩展内容',state:bridgeConfigured()?'configured':'pending',description:bridgeConfigured()?'已配置连接；请查看下方实际可用来源':'在线目录、正文与漫画扩展桥接已就绪，等待服务地址和密钥'}]});
 if(action==='search'){
 const names=source==='all'?(kind==='manga'?['bangumi','mangadex',...(bridgeConfigured()?['bridge']:[])]:['bangumi',...(bridgeConfigured()?['bridge']:[]),...(process.env.NAROU_ENABLED==='true'?['narou']:[])]):[source];
 if(names.some(n=>!['bangumi','mangadex','narou','bridge'].includes(n)))return Response.json({error:'不支持的来源'},{status:400});
 const r=await Promise.all(names.map(async n=>{try{const data=n==='bridge'?await bridgeSearch(q,page,kind):n==='bangumi'?await searchBangumi(q,kind,page,sort,p.get('tag')||''):n==='mangadex'?await searchManga(q,page,sort):await narou(q,page);return {...data,status:{source:n,ok:true,message:'已更新'}};}catch(e){return {items:[],total:0,status:{source:n,ok:false,message:e instanceof Error?e.message:'来源连接失败'}};}}));
 return Response.json({items:r.flatMap(x=>x.items),total:r.reduce((s,x)=>s+x.total,0),statuses:r.map(x=>x.status)},{headers:{'Cache-Control':'private, max-age=60'}});
 }
 if(source==='bridge'){if(!id||id.length>2000)return Response.json({error:'作品或章节 ID 无效'},{status:400});if(action==='chapters')return Response.json(await bridgeChapters(id,page));if(action==='content')return Response.json(await bridgeContent(id,p.get('workId')||''));}
 if(source==='mangadex'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return Response.json({error:'作品或章节 ID 无效'},{status:400});
 if(action==='detail'&&source==='mangadex')return Response.json(await mangaDetail(id));
 if(action==='detail'&&source==='bangumi'&&/^\d{1,10}$/.test(id)){const d=await upstream(`https://api.bgm.tv/v0/subjects/${id}`);if(d.nsfw||d.type!==1)throw new Error('不支持的作品');return Response.json(bangumiWork(d));}
 if(source==='mangadex'&&action==='chapters')return Response.json(await chapters(id,page));
 if(source==='mangadex'&&action==='pages')return Response.json(await pages(id));
 return Response.json({error:'不支持的操作'},{status:400});
 }catch(e){return Response.json({error:e instanceof Error&&e.name!=='ZodError'?e.message:'来源返回的数据格式无效'},{status:502});}
}
