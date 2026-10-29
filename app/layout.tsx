import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'零柒书境 · 在书页间，遇见另一个世界',description:'中文日轻与漫画的统一发现、书架与阅读空间。',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
