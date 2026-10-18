import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { PaymentCheckoutCreateSchema } from '@/shared/schemas';
import { createSafepayPaymentSession } from '@/server/integrations/safepay';
import { handleApiError } from '@/shared/errors';
export async function POST(req:NextRequest){
 try{const session=await requireAuth(req);requirePermission(session,'crm.create');const input=PaymentCheckoutCreateSchema.parse(await req.json());const payment=await createSafepayPaymentSession({workspaceId:session.workspaceId,opportunityId:input.opportunityId,amount:input.amount,currency:input.currency,requestedByUserId:session.userId,description:input.description});return NextResponse.json({success:true,payment,checkoutUrl:payment.checkoutUrl})}catch(err){return handleApiError(err)}
}
