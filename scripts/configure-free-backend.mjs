import fs from 'node:fs/promises';
const supplied=process.argv[2];
let url;
try{url=new URL(supplied);}catch{throw Error('Supply your public https://NAME.SUBDOMAIN.workers.dev URL.');}
if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev')||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/')throw Error('Use only the root HTTPS workers.dev URL printed by Wrangler.');
const result=await fetch(new URL('/health',url),{signal:AbortSignal.timeout(15000)});
if(!result.ok)throw Error('The Worker is not reachable yet. Deploy it first.');
const data=await result.json();
if(data.service!=='Lantern Rush Free H2H'||data.backend!=='workers-free')throw Error('This address is not the Lantern Rush free backend.');
await fs.writeFile(new URL('../src/live-config.js',import.meta.url),`// Public URL only. Secrets belong in Cloudflare Worker settings.\nexport const FREE_BACKEND_URL = ${JSON.stringify(url.origin)};\n`);
console.log('Saved the public backend URL. Publish the updated site, then follow the rules/activation steps in LIVE-H2H-SETUP.md.');
