export type Observation={ok:boolean;message:string;checkedAt:string};
const observations=new Map<string,Observation>();
export function observe(source:string,ok:boolean,message:string){observations.set(source,{ok,message,checkedAt:new Date().toISOString()});}
export function observed(source:string){return observations.get(source);}
export function publicError(e:unknown){return e instanceof Error&&e.name!=='ZodError'?e.message:'来源返回的数据无效';}
