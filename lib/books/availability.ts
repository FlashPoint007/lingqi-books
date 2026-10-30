import type {SourceFailure} from './source-errors';
export type Observation={ok:boolean;message:string;checkedAt:string}&Partial<SourceFailure>;
const observations=new Map<string,Observation>();
export function observe(source:string,ok:boolean,message:string,details:Partial<SourceFailure>={}){observations.set(source,{ok,...details,message,checkedAt:new Date().toISOString()});}
export function observed(source:string){return observations.get(source);}
export {sourceFailure} from './source-errors';
