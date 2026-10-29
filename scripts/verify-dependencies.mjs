import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')),lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const results=await Promise.all(Object.entries(pkg.dependencies).map(async([name,version])=>{
 const response=await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(`Cannot verify official registry metadata: ${name}`);
 const metadata=await response.json();if(metadata.dist.integrity!==lock.packages[`node_modules/${name}`].integrity)throw new Error(`Integrity mismatch: ${name}`);
 return name;
}));console.log(`PASS: ${results.length} direct production dependencies match official npm integrity.`);
let audit;
try{audit=execFileSync(process.execPath,[process.env.NPM_CLI,'audit','--omit=dev','--json','--registry=https://registry.npmjs.org'],{encoding:'utf8',stdio:['pipe','pipe','pipe']});}
catch(e){if(e.stdout)audit=e.stdout.toString();else throw e;}
const report=JSON.parse(audit);console.log(JSON.stringify({vulnerabilities:report.metadata?.vulnerabilities,findings:Object.entries(report.vulnerabilities||{}).map(([name,v])=>({name,severity:v.severity,fixAvailable:v.fixAvailable}))}));
if(report.error)throw new Error('Audit endpoint unavailable');
