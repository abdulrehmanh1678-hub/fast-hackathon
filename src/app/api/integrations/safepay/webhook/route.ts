import { NextRequest, NextResponse } from 'next/server';
import { getSafepayConfig, handleSafepayWebhook, verifySafepayWebhook } from '@/server/integrations/safepay';
import { createErrorResponse } from '@/shared/errors';
export async function POST(req:NextRequest){
 try{
  const config=await getSafepayConfig();if(!config.webhookSecret)return createErrorResponse('SAFEPAY_WEBHOOK_NOT_CONFIGURED','SafePay webhook signing secret is not configured.',503);
  const rawBody=await req.text();const signature=req.headers.get('x-sfpy-signature')||'';
  if(!verifySafepayWebhook(rawBody,signature,config.webhookSecret))return createErrorResponse('INVALID_SIGNATURE','SafePay webhook signature verification failed.',400);
  let event:any;try{event=JSON.parse(rawBody)}catch{return createErrorResponse('INVALID_WEBHOOK','SafePay webhook body was not valid JSON.',400)}
  const result=await handleSafepayWebhook(event);return NextResponse.json({received:true,duplicate:result.duplicate,status:result.payment?.status});
 }catch(err){console.error('SafePay webhook error:',err);return createErrorResponse('SAFEPAY_WEBHOOK_ERROR',err instanceof Error?err.message:'SafePay webhook failed.',500)}
}
