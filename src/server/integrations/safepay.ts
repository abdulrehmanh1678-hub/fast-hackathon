import crypto from 'crypto';
import { prisma } from '@/server/db';
import { AppError } from '@/shared/errors';
import { decryptSecret } from '@/server/crypto/encryption';
import { logIntegrationEvent } from '@/server/integrations/events-logger';

type SafepayConfig = { secretKey:string; publicKey:string; webhookSecret:string; environment:'sandbox'|'production' };
const env = () => process.env.SAFEPAY_ENV === 'production' ? 'production' as const : 'sandbox' as const;
const host = (environment:SafepayConfig['environment']) => environment === 'production' ? 'https://api.getsafepay.com' : 'https://sandbox.api.getsafepay.com';

export async function getSafepayConfig(workspaceId?:string):Promise<SafepayConfig>{
 if(workspaceId){
  const integration=await prisma.integration.findUnique({where:{workspaceId_provider:{workspaceId,provider:'SAFEPAY'}}});
  if(integration?.credentialsEncrypted){
   try{const value=JSON.parse(decryptSecret(integration.credentialsEncrypted));if(value.secretKey&&value.publicKey&&value.webhookSecret)return{secretKey:value.secretKey,publicKey:value.publicKey,webhookSecret:value.webhookSecret,environment:value.environment==='production'?'production':'sandbox'}}catch{}
  }
 }
 return{secretKey:process.env.SAFEPAY_SECRET_KEY||'',publicKey:process.env.SAFEPAY_PUBLIC_API_KEY||'',webhookSecret:process.env.SAFEPAY_WEBHOOK_SECRET||'',environment:env()};
}
function requireConfig(config:SafepayConfig){if(!config.secretKey||!config.publicKey)throw new AppError('SAFEPAY_NOT_CONFIGURED','SafePay is not configured. Add the server secret and public API key in the SafePay integration settings.',503)}
async function safepayRequest<T>(config:SafepayConfig,path:string,body?:unknown):Promise<T>{
 const response=await fetch(`${host(config.environment)}${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-SFPY-MERCHANT-SECRET':config.secretKey},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new AppError('SAFEPAY_REQUEST_FAILED',data?.status?.errors?.[0]?.message||data?.message||`SafePay request failed (${response.status}).`,502);
 return data as T;
}
function checkoutHost(environment:SafepayConfig['environment']){return environment==='production'?'https://getsafepay.com':'https://sandbox.api.getsafepay.com'}
function checkoutUrl(config:SafepayConfig,tracker:string,tbt:string,baseUrl:string){
 const url=new URL('/checkout/pay',checkoutHost(config.environment));url.searchParams.set('tracker',tracker);url.searchParams.set('source','hosted');url.searchParams.set('environment',config.environment);url.searchParams.set('tbt',tbt);url.searchParams.set('redirect_url',`${baseUrl}/payments/return`);url.searchParams.set('cancel_url',`${baseUrl}/payments/cancel`);return url.toString();
}

export async function createSafepayPaymentSession(params:{workspaceId:string;opportunityId:string;amount:number;currency:string;requestedByUserId:string;description?:string}){
 const {workspaceId,opportunityId,amount,currency,requestedByUserId,description}=params;
 const opportunity=await prisma.opportunity.findFirst({where:{id:opportunityId,workspaceId},include:{contact:true}});
 if(!opportunity)throw new AppError('NOT_FOUND','Opportunity not found in workspace',404);
 const config=await getSafepayConfig(workspaceId);requireConfig(config);
 const code=currency.toUpperCase();if(!['PKR','USD'].includes(code))throw new AppError('UNSUPPORTED_CURRENCY','SafePay checkout currently supports PKR and USD for this integration.',400);
 const payment=await prisma.payment.create({data:{workspaceId,opportunityId:opportunity.id,contactId:opportunity.contactId,requestedByUserId,amount,currency:code.toLowerCase(),status:'PENDING',metadata:{title:opportunity.title,description,provider:'SAFEPAY'}}});
 try{
  const trackerResponse=await safepayRequest<any>(config,'/order/payments/v3/',{merchant_api_key:config.publicKey,intent:'CYBERSOURCE',mode:'payment',entry_mode:'raw',currency:code,amount:Math.round(amount*100),include_fees:false});
  const tracker=trackerResponse?.data?.tracker?.token;if(!tracker)throw new Error('SafePay did not return a payment tracker.');
  const tokenResponse=await safepayRequest<any>(config,'/client/passport/v1/token',{});const tbt=tokenResponse?.data;
  if(typeof tbt!=='string'||!tbt)throw new Error('SafePay did not return a checkout authorization token.');
  const url=checkoutUrl(config,tracker,tbt,process.env.PUBLIC_BASE_URL||'http://localhost:3000');
  const updated=await prisma.payment.update({where:{id:payment.id},data:{providerCheckoutSessionId:tracker,checkoutUrl:url}});
  await logIntegrationEvent({workspaceId,provider:'SAFEPAY',eventType:'CHECKOUT_SESSION_CREATED',providerEventId:tracker,result:'SUCCESS',reference:payment.id,requestPayload:{opportunityId,amount,currency:code},responsePayload:{tracker,checkoutUrl:url}});
  return updated;
 }catch(error){
  await prisma.payment.update({where:{id:payment.id},data:{status:'FAILED'}}).catch(()=>undefined);
  await logIntegrationEvent({workspaceId,provider:'SAFEPAY',eventType:'CHECKOUT_SESSION_FAILED',result:'FAILED',reference:payment.id,requestPayload:{opportunityId,amount,currency:code},errorMessage:error instanceof Error?error.message:'SafePay checkout setup failed'});
  throw error instanceof AppError?error:new AppError('SAFEPAY_CHECKOUT_FAILED','Could not start SafePay checkout. Check the SafePay credentials and try again.',502);
 }
}

export function verifySafepayWebhook(rawBody:string,signature:string,secret:string){
 if(!signature||!secret)return false;
 const expected=crypto.createHmac('sha512',secret).update(rawBody).digest('hex');
 const provided=signature.replace(/^sha512=/i,'').trim();
 const a=Buffer.from(expected,'hex'),b=Buffer.from(provided,'hex');
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
export async function handleSafepayWebhook(event:any){
 const eventId=String(event?.token||event?.id||'');const tracker=String(event?.data?.tracker||event?.tracker||'');
 if(!eventId||!tracker)throw new AppError('INVALID_WEBHOOK','SafePay webhook is missing its event or tracker ID.',400);
 const prior=await prisma.integrationEvent.findUnique({where:{providerEventId:eventId}});if(prior)return{duplicate:true,payment:null};
 const payment=await prisma.payment.findFirst({where:{providerCheckoutSessionId:tracker}});
 if(!payment)throw new AppError('PAYMENT_NOT_FOUND','No payment matches this SafePay tracker.',404);
 const type=String(event.type||event.event_type||'');let status=payment.status;
 if(type==='payment.succeeded'&&event.data?.success!==false){status='PAID'}else if(type==='payment.failed'){status='FAILED'}else if(type==='payment.refunded'){status='REFUNDED'}
 let updated=payment;
 if(status!==payment.status||!payment.providerEventId){updated=await prisma.payment.update({where:{id:payment.id},data:{status,providerEventId:eventId,providerPaymentIntentId:event.data?.transaction_id||event.data?.authorization||undefined}})}
 await logIntegrationEvent({workspaceId:payment.workspaceId,provider:'SAFEPAY',eventType:type||'UNKNOWN_EVENT',providerEventId:eventId,result:'SUCCESS',reference:payment.id,requestPayload:{tracker,type},responsePayload:{status}});
 if(status!==payment.status){await prisma.activity.create({data:{workspaceId:payment.workspaceId,opportunityId:payment.opportunityId,contactId:payment.contactId,type:'PAYMENT',description:`Payment ${status.toLowerCase()} via SafePay (${tracker})`,metadata:{amount:payment.amount,currency:payment.currency,tracker,eventType:type}}})}
 return{duplicate:false,payment:updated};
}
