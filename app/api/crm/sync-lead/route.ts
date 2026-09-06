import { NextRequest, NextResponse } from 'next/server';
import { syncLeadToHubSpot, getPendingRetryRecords, SyncLeadInput } from '@/lib/hubspot';
import {
  getSessionSalesState,
  analyzeAndUpdateSalesState,
  updateSessionSalesState,
  buildStructuredCrmPayload,
  validateFinalSalesState,
  isValidPersonName,
  isValidCompanyName,
  sanitizeJobTitle,
} from '@/lib/sales/tracker';
import { SalesState } from '@/lib/sales/types';

export async function POST(request: NextRequest) {
  try {
    let body: Partial<SyncLeadInput>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { sessionId, companyId = 'default-company', customerData, transcript } = body;

    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      return NextResponse.json(
        { error: 'sessionId is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    console.log('\n[CRM STAGE 2: /api/crm/sync-lead Received Body]');
    console.log(`  name: ${customerData?.name || body.salesState?.customerName || body.salesState?.customer?.fullName || 'undefined'}`);
    console.log(`  email: ${customerData?.email || body.salesState?.email || body.salesState?.customer?.email || 'undefined'}`);
    console.log(`  phone: ${customerData?.phone || body.salesState?.phone || body.salesState?.customer?.phone || 'undefined'}`);
    console.log(`  company: ${customerData?.company || body.salesState?.company || body.salesState?.customer?.company || 'undefined'}`);
    console.log(`  job title: ${customerData?.role || (customerData as Record<string, string>)?.jobTitle || body.salesState?.jobTitle || body.salesState?.role || body.salesState?.customer?.jobTitle || 'undefined'}`);
    console.log(`  need: ${body.salesState?.need || body.salesState?.qualification?.need || 'undefined'}`);
    console.log(`  budget: ${body.salesState?.budget || body.salesState?.qualification?.budget || 'undefined'}`);
    console.log(`  timeline: ${body.salesState?.timeline || body.salesState?.qualification?.timeline || 'undefined'}`);
    console.log(`  company size: ${body.salesState?.companySize || body.salesState?.customer?.companySize || body.salesState?.qualification?.companySize || 'undefined'}`);

    // Retrieve active or final sales state from session tracker if not explicitly passed
    let salesState = body.salesState || getSessionSalesState(sessionId.trim());

    // If transcript is provided, extract all lead state from the full conversation
    if (transcript && Array.isArray(transcript) && transcript.length > 0) {
      salesState = analyzeAndUpdateSalesState(salesState as SalesState, transcript);
      updateSessionSalesState(sessionId.trim(), salesState as SalesState);
    }

    // Merge customerData into salesState if explicitly provided and valid
    if (customerData) {
      const c = salesState.customer || {};
      const validName = isValidPersonName(customerData.name) ? customerData.name : undefined;
      const validComp = isValidCompanyName(customerData.company) ? customerData.company : undefined;
      const validRole = sanitizeJobTitle(customerData.role || (customerData as Record<string, string>).jobTitle);

      salesState = {
        ...salesState,
        customer: {
          ...c,
          fullName: validName || c.fullName,
          firstName: validName ? validName.split(' ')[0] : c.firstName,
          email: customerData.email || c.email,
          phone: customerData.phone || c.phone,
          company: validComp || c.company,
          jobTitle: validRole || c.jobTitle,
        },
        customerName: validName || salesState.customerName,
        email: customerData.email || salesState.email,
        phone: customerData.phone || salesState.phone,
        company: validComp || salesState.company,
        jobTitle: validRole || salesState.jobTitle,
        role: validRole || salesState.role,
      };
      if (salesState.profile?.customer) {
        if (validName) salesState.profile.customer.fullName = validName;
        if (customerData.email) salesState.profile.customer.email = customerData.email;
        if (customerData.phone) salesState.profile.customer.phone = customerData.phone;
        if (validComp) salesState.profile.customer.company = validComp;
        if (validRole) salesState.profile.customer.jobTitle = validRole;
      }
    }

    const validation = validateFinalSalesState(salesState as SalesState);
    if (!validation.valid) {
      console.warn(
        `[API /api/crm/sync-lead] Validation warnings for session ${sessionId}: missing ${validation.missing.join(', ')}`,
      );
    }

    const transcriptText = (transcript || [])
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');
    const incomingPayload = body.crmPayload;
    const crmPayload =
      incomingPayload ||
      buildStructuredCrmPayload(
        salesState as SalesState,
        undefined,
        transcriptText,
        customerData,
      );

    console.log('\n[CRM STAGE 3: Structured Payload Built]');
    console.log(`  name: ${(crmPayload.contact.firstName && crmPayload.contact.lastName ? `${crmPayload.contact.firstName} ${crmPayload.contact.lastName}` : crmPayload.contact.firstName) || 'undefined'}`);
    console.log(`  email: ${crmPayload.contact.email || 'undefined'}`);
    console.log(`  phone: ${crmPayload.contact.phone || 'undefined'}`);
    console.log(`  company: ${crmPayload.contact.company || 'undefined'}`);
    console.log(`  job title: ${crmPayload.contact.jobTitle || 'undefined'}`);
    console.log(`  need: ${crmPayload.qualification.need || 'undefined'}`);
    console.log(`  budget: ${crmPayload.qualification.budget || 'undefined'}`);
    console.log(`  timeline: ${crmPayload.qualification.timeline || 'undefined'}`);
    console.log(`  company size: ${crmPayload.qualification.companySize || 'undefined'}`);

    console.log(
      `[API /api/crm/sync-lead] Triggering sync for session: ${sessionId.trim()} (Stage: ${salesState.salesStage || 'unknown'}, Turns: ${transcript?.length || 0})`,
    );
    console.log('[FINAL CRM PAYLOAD]');
    console.log(JSON.stringify(crmPayload, null, 2));

    const result = await syncLeadToHubSpot({
      sessionId: sessionId.trim(),
      companyId: companyId.trim(),
      salesState,
      transcript,
      customerData,
      crmPayload,
    });

    console.log(
      `[API /api/crm/sync-lead] Sync completed: success=${result.success}, idempotent=${result.idempotent || false}, contact=${result.contactId || result.contact?.id}`,
    );

    const status = result.success ? 200 : 502;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error('[API /api/crm/sync-lead] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        synced: false,
        error: 'CRM lead synchronization failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (sessionId) {
    const pending = getPendingRetryRecords().find((r) => r.sessionId === sessionId);
    return NextResponse.json({
      sessionId,
      isPendingRetry: !!pending,
      pendingDetails: pending || null,
    });
  }

  return NextResponse.json({
    pendingRetryCount: getPendingRetryRecords().length,
    pendingRecords: getPendingRetryRecords(),
  });
}
