/** Retry our gateways with a new URL; remounting an <img> with the same src can
 * reuse a failed browser request. Leave signed external URLs unchanged. */
export function imageRetryUrl(src:string,attempt:number){
 if(!attempt||!/^\/api\/(reader-image|content-image)\?/.test(src))return src;
 const u=new URL(src,'https://image.invalid');u.searchParams.set('_retry',String(attempt));return u.pathname+u.search+u.hash;
}
