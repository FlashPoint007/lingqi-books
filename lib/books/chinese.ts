import {Converter} from 'opencc-js/t2cn';
import {normalizeTitle} from './model';
const simplify=Converter({from:'tw',to:'cn'});
export function chineseKey(text:string){return normalizeTitle(simplify(text.normalize('NFKC')));}
/** Treat a parenthesized Chinese alternative as a title, but keep volume and
 * edition suffixes attached so that separate editions are not conflated. */
export function titleKeys(text:string){
 const keys=new Set([chineseKey(text)]);
 const parts=[...text.matchAll(/[（(]([^（）()]+)[）)]/g)];
 if(parts.length===1){const alt=parts[0][1];if(/[\p{Script=Han}]/u.test(alt)&&!/(?:第?.*[卷巻册冊部]|web|文庫版|文库版|版$|番外|外傳|外传)/i.test(alt)){keys.add(chineseKey(alt));keys.add(chineseKey(text.replace(parts[0][0],'')));}}
 return [...keys].filter(Boolean);
}
