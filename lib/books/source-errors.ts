export type FailureCode = 'verification_required' | 'login_required' | 'access_denied' | 'rate_limited' | 'domain_changed' | 'not_found' | 'upstream_unavailable' | 'connection_failed' | 'service_not_configured' | 'service_auth_failed' | 'parse_changed' | 'query_required' | 'invalid_response';
export type SourceFailure = {code:FailureCode;message:string;hint:string;retryable:boolean;httpStatus?:number};
export class SourceError extends Error {
 constructor(public code:FailureCode,message:string,public hint:string,public retryable=false,public httpStatus?:number){super(message);this.name='SourceError';}
}
export function sourceFailure(error:unknown):SourceFailure {
 if(error instanceof SourceError)return {code:error.code,message:error.message,hint:error.hint,retryable:error.retryable,...(error.httpStatus?{httpStatus:error.httpStatus}:{})};
 const message=error instanceof Error&&error.name!=='ZodError'?error.message:'来源返回的数据无效';
 if(/尚未连接|尚未配置|尚未启用|等待.*配置/.test(message))return {code:'service_not_configured',message,hint:'需要先在网站后台完成对应来源的启用或服务连接配置。',retryable:false};
 if(/服务鉴权失败/.test(message))return {code:'service_auth_failed',message,hint:'请检查服务端的访问密钥与来源权限。',retryable:false};
 if(/人机验证/.test(message))return {code:'verification_required',message,hint:'当前请求被来源的安全验证阻挡；反复点击重试不能完成验证。',retryable:false};
 if(/需要登录|需登录|登录服务|账户.*权限/.test(message))return {code:'login_required',message,hint:'需要连接具有该作品阅读权限的已登录内容服务。',retryable:false};
 if(/兼容.*服务|字体混淆|隐藏章节/.test(message))return {code:'parse_changed',message,hint:'需要配置与该来源匹配的解析服务，再读取目录和图文正文。',retryable:false};
 if(/过于频繁|请求较多/.test(message))return {code:'rate_limited',message,hint:'请稍后重试，避免连续刷新。',retryable:true};
 const status=message.match(/暂不可用（(\d{3})）/)?.[1];if(status){const httpStatus=Number(status);return {code:httpStatus===403?'access_denied':httpStatus===404?'not_found':'upstream_unavailable',message,hint:httpStatus>=500?'来源服务返回错误，可以稍后重试。':'需要检查来源权限或作品地址。',retryable:httpStatus>=500,httpStatus};}
 if(/连接(?:暂时)?失败|暂时?不可用|连接超时/.test(message))return {code:'connection_failed',message,hint:'服务可能暂时无法响应，可以稍后重试。',retryable:true};
 return {code:'invalid_response',message,hint:'请在内容来源中检测连接；如果持续失败，需要更新此来源的适配。',retryable:false};
}
