import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflight, EXPECTED_ACCOUNT } from '../scripts/cloudflare-preflight.mjs';
const database='619d4116-48f6-47a0-b063-b1686be45c3f';
const text=(value:string)=>({type:'plain_text',text:value});
function worker() { return {subdomain:{enabled:false,previews_enabled:false},routes:[],domains:[],previews_base_config:{env:{
 APP_ACCESS_MODE:text('private-test'),PRIVATE_TEST_USER_IDS:text('user_A'),
 NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:text('pk_test_not_a_secret'),CLERK_SECRET_KEY:{type:'secret_text'},
 DB:{type:'d1',database_id:database},PRIVATE_TEST_DB:{type:'d1',database_id:database},
}}}; }
test('Cloudflare preflight uses GET metadata only and never includes credentials in reports',async()=>{
 const requests:string[]=[];
 const report=await preflight({token:'private-token-value',account:EXPECTED_ACCOUNT},async(url,init)=>{
  assert.equal(init?.method,'GET');requests.push(String(url));
  return Response.json({success:true,result:String(url).includes('/d1/')?{uuid:database,name:'barber-money-tracker-test-db'}:worker()});
 });
 assert.equal(requests.length,2);assert.deepEqual(report.missing,[]);
 assert.ok(!JSON.stringify(report).includes('private-token-value'));
 assert.ok(!requests.some(path=>path.includes('/query')));
 // Cloudflare's legacy binding metadata uses id; Wrangler config uses database_id.
 const legacy=worker();
 const legacyReport=await preflight({token:'private-token-value',account:EXPECTED_ACCOUNT},async(url)=>Response.json({success:true,result:String(url).includes('/d1/')?{uuid:database,name:'barber-money-tracker-test-db'}:{...legacy,previews_base_config:{env:{...legacy.previews_base_config.env,DB:{type:'d1',id:database},PRIVATE_TEST_DB:{type:'d1',id:database}}}}}));
 assert.deepEqual(legacyReport.missing,[]);

});
test('Cloudflare preflight reports missing setup and redacts service error payloads',async()=>{
 const report=await preflight({token:'token',account:EXPECTED_ACCOUNT},async()=>Response.json({success:false,error:'sensitive-value'},{status:403}));
 assert.equal(report.missing.length,2);assert.ok(!JSON.stringify(report).includes('sensitive-value'));
 const unsafe=worker();unsafe.subdomain.enabled=true;unsafe.previews_base_config.env.APP_ACCESS_MODE=text('subscription');
 const invalid=await preflight({token:'token',account:EXPECTED_ACCOUNT},async(url)=>Response.json({success:true,result:String(url).includes('/d1/')?{uuid:database,name:'barber-money-tracker-test-db'}:unsafe}));
 assert.ok(invalid.missing.some((line:string)=>line.includes('URL switches')));
 assert.ok(invalid.missing.some((line:string)=>line.includes('APP_ACCESS_MODE')));
});
