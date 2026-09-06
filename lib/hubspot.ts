import fs from 'fs';
import path from 'path';
import { Client, AssociationTypes } from '@hubspot/api-client';
import { SalesState, StructuredCrmPayload } from './sales/types';
import {
  analyzeAndUpdateSalesState,
  createInitialSalesState,
  buildStructuredCrmPayload,
  updateSessionSalesState,
  parseBudgetString,
  isValidPersonName,
  isValidCompanyName,
  sanitizeJobTitle,
} from './sales/tracker';

export interface CustomerData {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  company?: string;
}

export interface SyncLeadInput {
  sessionId: string;
  companyId?: string;
  salesState?: Partial<SalesState>;
  transcript?: Array<{ role: string; content: string }>;
  customerData?: CustomerData;
  crmPayload?: StructuredCrmPayload;
}

export interface SyncLeadResult {
  success: boolean;
  status: 'synced' | 'failed' | 'demo_mode';
  idempotent?: boolean;
  provider?: string;
  contact?: { id: string };
  company?: { id: string };
  deal?: { id: string };
  note?: { id: string };
  hubspot?: {
    contactId?: string;
    companyId?: string;
    dealId?: string;
    noteId?: string;
  };
  contactId?: string;
  companyId?: string;
  dealId?: string;
  noteId?: string;
  synced?: boolean;
  isMock?: boolean;
  summary?: string;
  duplicatePrevented?: boolean;
  missingFields?: string[];
  error?: string;
  errorDetails?: string;
  statusCode?: number;
}

// Durable file-backed sync cache to persist across server restarts and hot reloads
const CACHE_FILE = path.join(process.cwd(), '.crm-sync-cache.json');

function loadDurableCache(): Record<string, SyncLeadResult> {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch {}
  return {};
}

function saveToDurableCache(sessionId: string, result: SyncLeadResult): void {
  try {
    const data = loadDurableCache();
    data[sessionId] = result;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}
}

// In-memory mutex for in-flight requests & completed results
const completedSyncResults = new Map<string, SyncLeadResult>();
const inFlightSyncs = new Map<string, Promise<SyncLeadResult>>();

// In-memory retry queue for background retry
interface PendingSyncRecord {
  input: SyncLeadInput;
  lastAttempt: number;
  attempts: number;
  error?: string;
}

const pendingRetryQueue = new Map<string, PendingSyncRecord>();
const activeSessionRecords = new Map<
  string,
  { contactId: string; companyId: string; dealId?: string; noteId?: string }
>();

// In-memory mock store for offline/test environments (HUBSPOT_MOCK_MODE=true)
interface MockCrmStore {
  contacts: Map<string, Record<string, string>>;
  companies: Map<string, Record<string, string>>;
  deals: Map<string, Record<string, string>>;
  notes: Map<string, Record<string, string>>;
  sessionToRecords: Map<
    string,
    { contactId: string; companyId: string; dealId: string; noteId: string }
  >;
}

export const mockCrmStore: MockCrmStore = {
  contacts: new Map(),
  companies: new Map(),
  deals: new Map(),
  notes: new Map(),
  sessionToRecords: new Map(),
};

export function logHubSpotAuthStatus(): void {
  const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  const configured = !!token && token.length >= 10;
  console.log('[HUBSPOT AUTH]');
  console.log(`HUBSPOT_ACCESS_TOKEN configured: ${configured}`);
  console.log(`HUBSPOT_ACCESS_TOKEN length: ${configured ? token!.length : 0}`);
  console.log(`HUBSPOT credential type: ${configured ? 'configured' : 'missing'}`);
}

let cachedDealPipeline: {
  pipelineId: string;
  validStages: string[];
  defaultStage: string;
  highIntentStage: string;
} | null = null;

async function getDealPipelineConfig(client: Client) {
  if (cachedDealPipeline) return cachedDealPipeline;
  try {
    const pipelines = await client.crm.pipelines.pipelinesApi.getAll('deals');
    const defaultPipe = pipelines.results?.[0];
    if (defaultPipe && defaultPipe.stages && defaultPipe.stages.length > 0) {
      const stageIds = defaultPipe.stages.map((s) => s.id);
      const highIntent =
        stageIds.find((id) => id === 'presentationscheduled' || id === 'qualifiedtobuy') ||
        stageIds[Math.min(2, stageIds.length - 1)];
      const defaultStage =
        stageIds.find((id) => id === 'appointmentscheduled') || stageIds[0];
      cachedDealPipeline = {
        pipelineId: defaultPipe.id,
        validStages: stageIds,
        defaultStage,
        highIntentStage: highIntent,
      };
      return cachedDealPipeline;
    }
  } catch (pipeErr) {
    console.warn('[HUBSPOT DEAL] Could not query deal pipelines from HubSpot:', pipeErr);
  }
  return {
    pipelineId: 'default',
    validStages: [
      'appointmentscheduled',
      'qualifiedtobuy',
      'presentationscheduled',
      'decisionmakerboughtin',
      'contractsent',
      'closedwon',
      'closedlost',
    ],
    defaultStage: 'appointmentscheduled',
    highIntentStage: 'presentationscheduled',
  };
}

/**
 * Returns a server-side HubSpot client if access token is set.
 */
export function getHubSpotClient(): Client | null {
  const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (!token || token.length < 10) {
    return null;
  }
  return new Client({ accessToken: token });
}

/**
 * Generates an executive conversation summary and structured CRM note (Section 4 format).
 */
export function generateCrmCallSummary(
  input: SyncLeadInput,
  salesState: Partial<SalesState>,
  _missingFields: string[],
): string {
  const prof = salesState.profile;
  const custData = input.customerData;
  const cust = salesState.customer;
  const qual = salesState.qualification;
  const sales = salesState.sales;

  const name =
    custData?.name ||
    prof?.customer?.fullName ||
    cust?.fullName ||
    salesState.customerName ||
    (cust?.firstName && cust?.lastName ? `${cust.firstName} ${cust.lastName}` : cust?.firstName) ||
    'Prospect';

  const company =
    custData?.company ||
    prof?.customer?.company ||
    cust?.company ||
    salesState.company ||
    'Enterprise Prospect';

  const role =
    custData?.role ||
    (custData as Record<string, string>)?.jobTitle ||
    prof?.customer?.jobTitle ||
    cust?.jobTitle ||
    salesState.jobTitle ||
    salesState.role ||
    'Not specified';

  const email =
    custData?.email ||
    prof?.customer?.email ||
    cust?.email ||
    salesState.email ||
    'Not provided';

  const phone =
    custData?.phone ||
    prof?.customer?.phone ||
    cust?.phone ||
    salesState.phone ||
    'Not provided';

  const need =
    prof?.qualification?.need ||
    qual?.need ||
    salesState.need ||
    'AI voice customer support';

  const painPoints = prof?.qualification?.painPoints?.length
    ? prof.qualification.painPoints
    : qual?.painPoints?.length
    ? qual.painPoints
    : salesState.painPoints?.length
    ? salesState.painPoints
    : ['High support workload', 'Voice latency and turn-taking'];

  const requirements = prof?.qualification?.requirements?.length
    ? prof.qualification.requirements
    : qual?.requirements?.length
    ? qual.requirements
    : salesState.requirements?.length
    ? salesState.requirements
    : ['conversational voice agent', 'customer support automation'];

  const companySize =
    prof?.customer?.companySize ||
    cust?.companySize ||
    qual?.companySize ||
    salesState.companySize ||
    'Not specified';

  const budget =
    prof?.qualification?.budget ||
    qual?.budget ||
    salesState.budget ||
    'Not specified';

  const timeline =
    prof?.qualification?.timeline ||
    qual?.timeline ||
    salesState.timeline ||
    'Not specified';

  const buyingIntent = (
    prof?.sales?.buyingIntent ||
    sales?.buyingIntent ||
    salesState.buyingIntent ||
    'Medium'
  );
  const buyingIntentDisplay =
    buyingIntent.charAt(0).toUpperCase() + buyingIntent.slice(1).toLowerCase();

  const leadScore =
    sales?.leadScore ??
    salesState.leadScore ??
    (buyingIntent.toLowerCase() === 'high' ? 90 : 60);

  const products = (
    prof?.sales?.productsInterested?.length
      ? prof.sales.productsInterested
      : sales?.productsInterested?.length
      ? sales.productsInterested
      : salesState.productsInterested?.length
      ? salesState.productsInterested
      : ['Conversational AI']
  ).join(', ');

  const rawNextAction =
    prof?.sales?.nextBestAction ||
    sales?.nextBestAction ||
    salesState.nextBestAction ||
    'Arrange Demo';
  const nextAction =
    rawNextAction === 'arrange_demo' ? 'Arrange Demo' : rawNextAction;

  return [
    `Customer: ${name}`,
    `Company: ${company}`,
    `Role: ${role}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    `Need: ${need}`,
    `Pain Points: ${painPoints.join(', ')}`,
    `Requirements: ${requirements.join(', ')}`,
    `Budget: ${budget}`,
    `Timeline: ${timeline}`,
    `Company Size: ${companySize}`,
    `Buying Intent: ${buyingIntentDisplay}`,
    `Lead Score: ${leadScore}`,
    `Product: ${products}`,
    `Next Action: ${nextAction}`,
    salesState.appointment?.meetingStatus === 'confirmed'
      ? `Appointment: Confirmed (${salesState.appointment.meetingType}) for ${salesState.appointment.selectedSlot?.formattedTime || 'Scheduled'}${salesState.appointment.calendarEventId ? ` [Calendar Event ID: ${salesState.appointment.calendarEventId}]` : ''}${salesState.appointment.meetingUrl ? ` [Meet: ${salesState.appointment.meetingUrl}]` : ''}${salesState.appointment.attendeeEmail ? ` [Attendee: ${salesState.appointment.attendeeEmail}]` : ''}`
      : null,
  ].filter(Boolean).join('\n');
}

/**
 * Public entrypoint for CRM lead synchronization.
 * Guarantees strict idempotency per sessionId/conversationId using an in-flight mutex
 * and durable file-backed persistence so one conversation never produces multiple CRM records.
 */
export async function syncLeadToHubSpot(
  input: SyncLeadInput,
): Promise<SyncLeadResult> {
  const sessionId = input.sessionId.trim();

  // 1. In-flight mutex check: if sync is currently running for this session, await its existing promise
  if (inFlightSyncs.has(sessionId)) {
    console.log(`[CRM MUTEX] Concurrently awaiting in-flight sync for session: ${sessionId}`);
    const inFlightResult = await inFlightSyncs.get(sessionId)!;
    return { ...inFlightResult, idempotent: true };
  }

  // 2. In-memory completed cache check
  const memoryCached = completedSyncResults.get(sessionId);
  if (memoryCached) {
    console.log(`[CRM IDEMPOTENT] Session ${sessionId} already synced in memory. Returning cached records.`);
    return { ...memoryCached, idempotent: true };
  }

  // 3. Durable disk cache check
  const durableCache = loadDurableCache();
  if (durableCache[sessionId]) {
    console.log(`[CRM IDEMPOTENT] Session ${sessionId} already synced in durable cache. Returning cached records.`);
    const diskResult = durableCache[sessionId];
    completedSyncResults.set(sessionId, diskResult);
    return { ...diskResult, idempotent: true };
  }

  // 4. Register execution promise in mutex map
  const executionPromise = executeLeadSync(input);
  inFlightSyncs.set(sessionId, executionPromise);

  try {
    const result = await executionPromise;
    if (result.success && !result.isMock) {
      completedSyncResults.set(sessionId, result);
      saveToDurableCache(sessionId, result);
    }
    return result;
  } finally {
    inFlightSyncs.delete(sessionId);
  }
}

let cachedDealPropertyNames: Set<string> | null = null;
async function getAvailableDealPropertyNames(client: Client | null): Promise<Set<string>> {
  if (cachedDealPropertyNames) return cachedDealPropertyNames;
  const set = new Set<string>();
  if (!client || process.env.HUBSPOT_MOCK_MODE === 'true' || process.env.HUBSPOT_DEMO_MODE === 'true') {
    ['dealname', 'pipeline', 'dealstage', 'amount', 'closedate'].forEach((p) => set.add(p));
    cachedDealPropertyNames = set;
    return set;
  }
  try {
    const props = await client.crm.properties.coreApi.getAll('deals');
    if (props && props.results) {
      props.results.forEach((p) => set.add(p.name));
    }
  } catch (err) {
    console.warn('[HUBSPOT PROPERTIES] Could not fetch deal properties:', err);
    ['dealname', 'pipeline', 'dealstage', 'amount'].forEach((p) => set.add(p));
  }
  cachedDealPropertyNames = set;
  return set;
}

/**
 * Internal execution handler for single-record HubSpot synchronization.
 */
async function executeLeadSync(input: SyncLeadInput): Promise<SyncLeadResult> {
  const { sessionId, customerData = {} } = input;
  const client = getHubSpotClient();
  logHubSpotAuthStatus();

  // 1. Enrich SalesState from full transcript if available
  let activeState: SalesState;
  if (input.transcript && Array.isArray(input.transcript) && input.transcript.length > 0) {
    const baseState = createInitialSalesState(sessionId);
    const extracted = analyzeAndUpdateSalesState(baseState, input.transcript);

    const resolvedName =
      [input.salesState?.customerName, input.salesState?.customer?.fullName, extracted.customerName].find(isValidPersonName) ||
      extracted.customerName;

    const resolvedCompany =
      [input.salesState?.company, input.salesState?.customer?.company, extracted.company].find((c) => isValidCompanyName(c)) ||
      extracted.company;

    const resolvedRole =
      [input.salesState?.role, input.salesState?.jobTitle, input.salesState?.customer?.jobTitle, extracted.role]
        .map(sanitizeJobTitle)
        .find(Boolean) || extracted.role;

    activeState = {
      ...extracted,
      ...(input.salesState || {}),
      conversationId: sessionId,
      profile: input.salesState?.profile || extracted.profile,
      customerName: resolvedName,
      company: resolvedCompany,
      role: resolvedRole,
      jobTitle: resolvedRole,
      need: input.salesState?.need || extracted.need || 'AI voice customer support automation',
      companySize: input.salesState?.companySize || extracted.companySize,
      timeline: input.salesState?.timeline || extracted.timeline,
      email: input.salesState?.email || extracted.email,
      phone: input.salesState?.phone || extracted.phone,
      productsInterested: Array.from(
        new Set([...(input.salesState?.productsInterested || []), ...extracted.productsInterested]),
      ),
      painPoints: Array.from(
        new Set([...(input.salesState?.painPoints || []), ...extracted.painPoints]),
      ),
      requirements: Array.from(
        new Set([...(input.salesState?.requirements || []), ...extracted.requirements]),
      ),
      objections: Array.from(
        new Set([...(input.salesState?.objections || []), ...extracted.objections]),
      ),
      competitorsMentioned: Array.from(
        new Set([
          ...(input.salesState?.competitorsMentioned || []),
          ...extracted.competitorsMentioned,
        ]),
      ),
      buyingIntent: input.salesState?.buyingIntent || extracted.buyingIntent,
      salesStage: input.salesState?.salesStage || extracted.salesStage,
      nextBestAction: input.salesState?.nextBestAction || extracted.nextBestAction,
      leadScore: input.salesState?.leadScore || extracted.leadScore,
      lastUpdated: Date.now(),
    };
  } else {
    activeState = {
      ...createInitialSalesState(sessionId),
      ...(input.salesState || {}),
      conversationId: sessionId,
      profile:
        input.salesState?.profile ||
        (input.salesState
          ? analyzeAndUpdateSalesState(createInitialSalesState(sessionId), []).profile
          : createInitialSalesState(sessionId).profile),
      lastUpdated: Date.now(),
    };
  }

  // 2. Track Missing Information
  const missingFields: string[] = [];
  const cProfile = activeState.profile?.customer;
  const currentEmail =
    customerData.email ||
    activeState.customerEmail ||
    cProfile?.email ||
    activeState.customer?.email ||
    activeState.email ||
    '';
  const currentPhone = customerData.phone || cProfile?.phone || activeState.phone || '';
  const currentName =
    customerData.name || cProfile?.fullName || activeState.customerName || '';
  const currentCompany =
    customerData.company || cProfile?.company || activeState.company || '';

  if (!currentEmail) missingFields.push('email');
  if (!currentPhone) missingFields.push('phone');
  if (!currentName) missingFields.push('name');
  if (!currentCompany) missingFields.push('company');

  // 3. Build Canonical Structured CRM Payload
  const callSummary = generateCrmCallSummary(input, activeState, missingFields);
  const transcriptText = (input.transcript || [])
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  const crmPayload: StructuredCrmPayload =
    input.crmPayload ||
    buildStructuredCrmPayload(activeState, callSummary, transcriptText, customerData);

  console.log(`[CRM PAYLOAD]`, JSON.stringify(crmPayload, null, 2));

  // Identity & fields with complete multi-tier fallback
  const fullName =
    crmPayload.contact.firstName && crmPayload.contact.lastName
      ? `${crmPayload.contact.firstName} ${crmPayload.contact.lastName}`
      : crmPayload.contact.firstName || customerData.name || activeState.customerName || activeState.customer?.fullName || '';
  const displayCompanyName =
    crmPayload.contact.company || customerData.company || activeState.customer?.company || activeState.company || 'Enterprise Account';
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = crmPayload.contact.firstName || nameParts[0] || (fullName ? fullName : 'Prospect');
  let lastName = crmPayload.contact.lastName || '';
  if (!lastName) {
    if (nameParts.length > 1) {
      lastName = nameParts.slice(1).join(' ');
    } else if (!fullName) {
      lastName = 'Lead';
    }
  }
  const email =
    crmPayload.contact.email ||
    customerData.email ||
    activeState.customerEmail ||
    activeState.customer?.email ||
    activeState.email ||
    activeState.profile?.customer?.email ||
    '';
  const phone =
    crmPayload.contact.phone ||
    customerData.phone ||
    activeState.customer?.phone ||
    activeState.phone ||
    activeState.profile?.customer?.phone ||
    '';
  const jobTitle =
    crmPayload.contact.jobTitle ||
    customerData.role ||
    (customerData as Record<string, string>).jobTitle ||
    activeState.customer?.jobTitle ||
    activeState.jobTitle ||
    activeState.role ||
    activeState.profile?.customer?.jobTitle ||
    '';

  // Budget & Deal Mapping
  const dealName = `${displayCompanyName} - Voice AI Project [${sessionId.slice(0, 12)}]`;
  const stage = crmPayload.sales.salesStage || activeState.salesStage || 'discovery';

  const need =
    crmPayload.qualification.need ||
    activeState.qualification?.need ||
    activeState.need ||
    activeState.profile?.qualification?.need ||
    'AI voice customer support';
  const budget =
    crmPayload.qualification.budget ||
    activeState.qualification?.budget ||
    activeState.budget ||
    activeState.profile?.qualification?.budget ||
    '';
  const budgetMin =
    crmPayload.qualification.budgetMin ??
    activeState.qualification?.budgetMin ??
    activeState.budgetMin ??
    activeState.profile?.qualification?.budgetMin;
  const budgetMax =
    crmPayload.qualification.budgetMax ??
    activeState.qualification?.budgetMax ??
    activeState.budgetMax ??
    activeState.profile?.qualification?.budgetMax;
  const timeline =
    crmPayload.qualification.timeline ||
    activeState.qualification?.timeline ||
    activeState.timeline ||
    activeState.profile?.qualification?.timeline ||
    '';
  const companySize =
    crmPayload.qualification.companySize ||
    activeState.qualification?.companySize ||
    activeState.customer?.companySize ||
    activeState.companySize ||
    activeState.profile?.customer?.companySize ||
    '';
  const buyingIntent = (
    crmPayload.sales.buyingIntent ||
    activeState.sales?.buyingIntent ||
    activeState.buyingIntent ||
    activeState.profile?.sales?.buyingIntent ||
    'medium'
  );
  const leadScore =
    activeState.sales?.leadScore ??
    activeState.leadScore ??
    (buyingIntent.toLowerCase() === 'high' ? 90 : 50);
  const rawNextAction =
    crmPayload.sales.nextBestAction ||
    activeState.sales?.nextBestAction ||
    activeState.nextBestAction ||
    activeState.profile?.sales?.nextBestAction ||
    'Arrange Demo';
  const nextAction =
    rawNextAction === 'arrange_demo' ? 'Arrange Demo' : rawNextAction;
  const products =
    crmPayload.sales.productsInterested?.length
      ? crmPayload.sales.productsInterested
      : activeState.sales?.productsInterested?.length
      ? activeState.sales.productsInterested
      : activeState.productsInterested?.length
      ? activeState.productsInterested
      : activeState.profile?.sales?.productsInterested?.length
      ? activeState.profile.sales.productsInterested
      : ['Conversational AI'];

  // Map budget directly to deal amount
  let estimatedValue = 18000;
  if (budgetMin) {
    estimatedValue = budgetMin;
  } else if (budgetMax) {
    estimatedValue = budgetMax;
  } else if (budget) {
    const parsed = parseBudgetString(budget);
    if (parsed?.budgetMin) estimatedValue = parsed.budgetMin;
    else if (parsed?.budgetMax) estimatedValue = parsed.budgetMax;
  }
  if (!budgetMin && !budgetMax && (stage === 'closing' || buyingIntent === 'high')) {
    estimatedValue = 35000;
  }

  console.log(`[CRM SYNC START] Session: ${sessionId} | Amount: $${estimatedValue.toLocaleString()}`);
  console.log(
    `[CRM LEAD DATA]`,
    JSON.stringify(
      {
        customerName: fullName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        company: displayCompanyName || undefined,
        jobTitle,
        need,
        companySize,
        budget,
        budgetMin,
        budgetMax,
        timeline,
        productsInterested: products,
        buyingIntent,
        salesStage: stage,
        nextBestAction: nextAction,
        missingFields: missingFields.length > 0 ? missingFields : undefined,
      },
      null,
      2,
    ),
  );

  // 4. Live HubSpot Sync
  if (client) {
    try {
      // 4a. Resolve Contact (Deduplicate by email or session record)
      let contactId: string | undefined = activeSessionRecords.get(sessionId)?.contactId;
      let duplicatePrevented = false;

      if (!contactId && email) {
        const contactSearch = await client.crm.contacts.searchApi.doSearch({
          filterGroups: [
            { filters: [{ propertyName: 'email', operator: 'EQ' as never, value: email }] },
          ],
          sorts: ['createdate'],
          properties: ['email', 'firstname', 'lastname'],
          limit: 1,
          after: '0',
        });
        if (contactSearch && contactSearch.results && contactSearch.results.length > 0) {
          contactId = contactSearch.results[0].id;
        }
      }

      // 4b. Resolve Company (Check direct Contact association first, then search by name)
      let companyRecordId: string | undefined = activeSessionRecords.get(sessionId)?.companyId;
      if (!companyRecordId && contactId) {
        try {
          const contactAssocs = await client.crm.associations.v4.basicApi.getPage(
            'contacts',
            contactId,
            'companies',
          );
          if (contactAssocs.results && contactAssocs.results.length > 0) {
            companyRecordId = contactAssocs.results[0].toObjectId;
          }
        } catch {}
      }

      if (!companyRecordId && displayCompanyName && displayCompanyName !== 'Enterprise Account') {
        const companySearch = await client.crm.companies.searchApi.doSearch({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'name',
                  operator: 'EQ' as never,
                  value: displayCompanyName,
                },
              ],
            },
          ],
          sorts: ['createdate'],
          properties: ['name', 'domain'],
          limit: 1,
          after: '0',
        });
        if (companySearch.results && companySearch.results.length > 0) {
          companyRecordId = companySearch.results[0].id;
        }
      }

      // 4c. Resolve Deal (Directly check Contact's associated deals to bypass search indexing latency)
      let dealId: string | undefined = activeSessionRecords.get(sessionId)?.dealId;
      if (!dealId && contactId) {
        try {
          const contactDeals = await client.crm.associations.v4.basicApi.getPage(
            'contacts',
            contactId,
            'deals',
          );
          if (contactDeals.results && contactDeals.results.length > 0) {
            dealId = contactDeals.results[0].toObjectId;
          }
        } catch {}
      }

      if (!dealId) {
        const dealSearch = await client.crm.deals.searchApi.doSearch({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'dealname',
                  operator: 'CONTAINS_TOKEN' as never,
                  value: sessionId.slice(0, 12),
                },
              ],
            },
          ],
          sorts: ['createdate'],
          properties: ['dealname', 'dealstage', 'amount'],
          limit: 1,
          after: '0',
        });
        if (dealSearch.results && dealSearch.results.length > 0) {
          dealId = dealSearch.results[0].id;
        }
      }

      // 4d. Debug Logging (Section 6) immediately before syncing
      console.log('\n[CRM STAGE 4: HubSpot API Properties Prepared]');
      console.log(`  name: ${firstName}${lastName ? ` ${lastName}` : ''}`);
      console.log(`  email: ${email || 'undefined'}`);
      console.log(`  phone: ${phone || 'undefined'}`);
      console.log(`  company: ${displayCompanyName || 'undefined'}`);
      console.log(`  job title: ${jobTitle || 'undefined'}`);
      console.log(`  need: ${need || 'undefined'}`);
      console.log(`  budget: ${budget || 'undefined'}`);
      console.log(`  timeline: ${timeline || 'undefined'}`);
      console.log(`  company size: ${companySize || 'undefined'}`);

      console.log('[CRM FINAL STATE]');
      console.log(`email: ${email || 'not provided'}`);
      console.log(`phone: ${phone || 'not provided'}`);
      console.log(`company: ${displayCompanyName || 'not provided'}`);
      console.log(`budget: ${budget || 'not specified'}`);
      console.log(`timeline: ${timeline || 'not specified'}`);
      console.log(`need: ${need || 'not specified'}`);
      console.log(`products: ${products.join(', ') || 'Conversational AI'}`);
      console.log('');
      console.log('[CRM SYNC]');
      console.log(`contact: ${contactId ? 'update' : 'create'}`);
      console.log(`company: ${companyRecordId ? 'update' : 'create'}`);
      console.log(`deal: ${dealId ? 'update' : 'create'}`);
      console.log(`note: create`);

      // Execute Contact Create/Update
      const contactProperties: Record<string, string> = {
        firstname: firstName,
        company: displayCompanyName,
      };
      if (lastName) contactProperties.lastname = lastName;
      if (jobTitle) contactProperties.jobtitle = jobTitle;
      if (email) contactProperties.email = email;
      if (phone) contactProperties.phone = phone;

      if (contactId) {
        await client.crm.contacts.basicApi.update(contactId, {
          properties: contactProperties,
        });
        duplicatePrevented = true;
        console.log(
          `[HUBSPOT CONTACT] ID: ${contactId} | Updated: ${firstName} ${lastName} (${email || 'No email'})`,
        );
      } else {
        const newContact = await client.crm.contacts.basicApi.create({
          properties: contactProperties,
          associations: [],
        });
        contactId = newContact.id;
        console.log(
          `[HUBSPOT CONTACT] ID: ${contactId} | Created: ${firstName} ${lastName} (${email || 'No email'})`,
        );
      }

      // Execute Company Create/Update
      const companyProperties: Record<string, string> = {
        name: displayCompanyName,
        description: `Voice AI Customer Support Evaluation via Agora Conversational AI. Session: ${sessionId}`,
      };

      if (companyRecordId) {
        await client.crm.companies.basicApi.update(companyRecordId, {
          properties: companyProperties,
        });
        console.log(`[HUBSPOT COMPANY] ID: ${companyRecordId} | Updated: ${displayCompanyName}`);
      } else {
        const newCompany = await client.crm.companies.basicApi.create({
          properties: companyProperties,
          associations: [],
        });
        companyRecordId = newCompany.id;
        console.log(`[HUBSPOT COMPANY] ID: ${companyRecordId} | Created: ${displayCompanyName}`);
      }

      // Associate Contact <-> Company
      try {
        await client.crm.associations.v4.basicApi.create(
          'contacts',
          contactId,
          'companies',
          companyRecordId,
          [
            {
              associationCategory: 'HUBSPOT_DEFINED' as never,
              associationTypeId: AssociationTypes.contactToCompany,
            },
          ],
        );
        console.log(`[HUBSPOT ASSOCIATION] Contact ${contactId} <-> Company ${companyRecordId}: SUCCESS`);
      } catch (assocErr) {
        const e = assocErr as { message?: string; body?: { message?: string } };
        console.warn(`[HUBSPOT ASSOCIATION] Contact <-> Company: ${e.body?.message || e.message}`);
      }

      // Execute Deal Create/Update with custom property checks
      const pipelineConfig = await getDealPipelineConfig(client);
      let chosenDealStage = pipelineConfig.defaultStage;
      if (activeState.appointment?.meetingStatus === 'confirmed') {
        chosenDealStage = pipelineConfig.validStages.includes('appointmentscheduled')
          ? 'appointmentscheduled'
          : pipelineConfig.highIntentStage;
      } else if (stage === 'closing' || buyingIntent === 'high') {
        chosenDealStage = pipelineConfig.highIntentStage;
      } else if (stage === 'qualification' || stage === 'objection_handling') {
        chosenDealStage = pipelineConfig.validStages.includes('qualifiedtobuy')
          ? 'qualifiedtobuy'
          : pipelineConfig.defaultStage;
      }

      const availableDealProps = await getAvailableDealPropertyNames(client);
      const apptDesc = activeState.appointment?.meetingStatus === 'confirmed'
        ? ` | Appointment Booked: ${activeState.appointment.selectedSlot?.formattedTime || 'Confirmed'} (Event ID: ${activeState.appointment.calendarEventId || 'confirmed'}, Meet: ${activeState.appointment.meetingUrl || 'Google Meet'}, Attendee: ${activeState.appointment.attendeeEmail || email})`
        : '';
      const dealProperties: Record<string, string> = {
        dealname: dealName,
        pipeline: pipelineConfig.pipelineId,
        amount: estimatedValue.toString(),
        description: `Agora Conversational AI Voice Opportunity. Buying Intent: ${buyingIntent}. Need: ${need}${apptDesc}`,
      };

      // Rule 25: Only update deal stage when the stage actually changes
      const previousSyncedStage = activeState.crm?.lastSyncedStage;
      if (chosenDealStage !== previousSyncedStage) {
        dealProperties.dealstage = chosenDealStage;
      }

      // Check available deal/custom properties
      const customDealPropsToCheck: Record<string, string | number | undefined> = {
        budget: budget || undefined,
        timeline: timeline || undefined,
        company_size: companySize || undefined,
        need: need || undefined,
        buying_intent: buyingIntent || undefined,
        lead_score: leadScore !== undefined ? leadScore : undefined,
        next_best_action: nextAction || undefined,
      };

      for (const [propName, propVal] of Object.entries(customDealPropsToCheck)) {
        if (propVal !== undefined && String(propVal).trim()) {
          if (availableDealProps.has(propName)) {
            dealProperties[propName] = String(propVal);
          } else {
            console.log(`[HUBSPOT PROPERTY SKIPPED] ${propName}`);
          }
        }
      }

      if (dealId) {
        await client.crm.deals.basicApi.update(dealId, {
          properties: dealProperties,
        });
        duplicatePrevented = true;
        console.log(
          `[HUBSPOT DEAL] ID: ${dealId} | Updated: ${dealName} (${dealProperties.dealstage ? chosenDealStage : 'stage unchanged'})`,
        );
      } else {
        dealProperties.dealstage = chosenDealStage;
        const newDeal = await client.crm.deals.basicApi.create({
          properties: dealProperties,
          associations: [],
        });
        dealId = newDeal.id;
        console.log(`[HUBSPOT DEAL] ID: ${dealId} | Created: ${dealName} (${chosenDealStage})`);
      }

      // Associate Deal <-> Company and Deal <-> Contact
      try {
        await client.crm.associations.v4.basicApi.create(
          'deals',
          dealId,
          'companies',
          companyRecordId,
          [
            {
              associationCategory: 'HUBSPOT_DEFINED' as never,
              associationTypeId: AssociationTypes.dealToCompany,
            },
          ],
        );
        console.log(`[HUBSPOT ASSOCIATION] Deal ${dealId} <-> Company ${companyRecordId}: SUCCESS`);
      } catch (assocErr) {
        const e = assocErr as { message?: string; body?: { message?: string } };
        console.warn(`[HUBSPOT ASSOCIATION] Deal <-> Company: ${e.body?.message || e.message}`);
      }

      try {
        await client.crm.associations.v4.basicApi.create(
          'deals',
          dealId,
          'contacts',
          contactId,
          [
            {
              associationCategory: 'HUBSPOT_DEFINED' as never,
              associationTypeId: AssociationTypes.dealToContact,
            },
          ],
        );
        console.log(`[HUBSPOT ASSOCIATION] Deal ${dealId} <-> Contact ${contactId}: SUCCESS`);
      } catch (assocErr) {
        const e = assocErr as { message?: string; body?: { message?: string } };
        console.warn(`[HUBSPOT ASSOCIATION] Deal <-> Contact: ${e.body?.message || e.message}`);
      }

      // 4d. Create Engagement Note (Call Summary)
      let noteId: string = `note-${Date.now()}`;
      try {
        const note = await client.crm.objects.notes.basicApi.create({
          properties: {
            hs_timestamp: Date.now().toString(),
            hs_note_body: callSummary,
          },
          associations: [],
        });
        noteId = note.id;
        console.log(`[HUBSPOT NOTE] ID: ${noteId} | Summary attached`);

        // Associate Note to Contact and Deal
        try {
          await client.crm.associations.v4.basicApi.create(
            'notes',
            noteId,
            'contacts',
            contactId,
            [
              {
                associationCategory: 'HUBSPOT_DEFINED' as never,
                associationTypeId: AssociationTypes.noteToContact,
              },
            ],
          );
          console.log(`[HUBSPOT ASSOCIATION] Note ${noteId} <-> Contact ${contactId}: SUCCESS`);
        } catch (assocErr) {
          const e = assocErr as { message?: string; body?: { message?: string } };
          console.warn(`[HUBSPOT ASSOCIATION] Note <-> Contact: ${e.body?.message || e.message}`);
        }

        if (dealId) {
          try {
            await client.crm.associations.v4.basicApi.create(
              'notes',
              noteId,
              'deals',
              dealId,
              [
                {
                  associationCategory: 'HUBSPOT_DEFINED' as never,
                  associationTypeId: AssociationTypes.noteToDeal,
                },
              ],
            );
            console.log(`[HUBSPOT ASSOCIATION] Note ${noteId} <-> Deal ${dealId}: SUCCESS`);
          } catch (assocErr) {
            const e = assocErr as { message?: string; body?: { message?: string } };
            console.warn(`[HUBSPOT ASSOCIATION] Note <-> Deal: ${e.body?.message || e.message}`);
          }
        }
      } catch (noteErr) {
        const e = noteErr as { message?: string; body?: { message?: string } };
        console.warn(`[HUBSPOT NOTE FAILED]: ${e.body?.message || e.message}`);
      }

      activeSessionRecords.set(sessionId, {
        contactId,
        companyId: companyRecordId,
        dealId,
        noteId,
      });

      // Update SalesState CRM fields
      activeState.crm = {
        synced: true,
        syncInProgress: false,
        syncCompletedAt: new Date().toISOString(),
        hubspotContactId: contactId,
        hubspotCompanyId: companyRecordId,
        hubspotDealId: dealId,
        hubspotNoteId: noteId,
        lastSyncedStage: chosenDealStage,
      };
      updateSessionSalesState(sessionId, activeState);

      pendingRetryQueue.delete(sessionId);
      console.log(`[CRM SYNC COMPLETE] Session: ${sessionId} (HubSpot Cloud Live)`);

      return {
        success: true,
        status: 'synced',
        synced: true,
        isMock: false,
        idempotent: false,
        contact: { id: contactId },
        company: { id: companyRecordId },
        deal: { id: dealId },
        note: { id: noteId },
        hubspot: {
          contactId,
          companyId: companyRecordId,
          dealId,
          noteId,
        },
        contactId,
        companyId: companyRecordId,
        dealId,
        noteId,
        summary: callSummary,
        duplicatePrevented,
        missingFields: missingFields.length > 0 ? missingFields : undefined,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[CRM SYNC FAILED] Session: ${sessionId} | Error: ${errMsg}`);

      pendingRetryQueue.set(sessionId, {
        input,
        lastAttempt: Date.now(),
        attempts: (pendingRetryQueue.get(sessionId)?.attempts || 0) + 1,
        error: errMsg,
      });

      return {
        success: false,
        status: 'failed',
        synced: false,
        provider: 'hubspot',
        error: errMsg,
        errorDetails: errMsg,
      };
    }
  }

  // Offline / Demo Mode fallback (ONLY when explicitly enabled via HUBSPOT_MOCK_MODE=true or HUBSPOT_DEMO_MODE=true)
  const isDemoMode =
    process.env.HUBSPOT_MOCK_MODE === 'true' || process.env.HUBSPOT_DEMO_MODE === 'true';
  if (isDemoMode) {
    const mockChosenDealStage = activeState.appointment?.meetingStatus === 'confirmed'
      ? 'appointmentscheduled'
      : stage === 'closing' || buyingIntent === 'high'
      ? 'qualifiedtobuy'
      : 'appointmentscheduled';

    return syncToMockCrm(
      input,
      activeState,
      callSummary,
      firstName,
      lastName,
      displayCompanyName,
      email,
      jobTitle,
      phone,
      dealName,
      mockChosenDealStage,
      estimatedValue,
      missingFields,
    );
  }

  console.error(
    `[CRM SYNC FAILED] Session: ${sessionId} | Error: HubSpot credentials not configured`,
  );
  return {
    success: false,
    status: 'failed',
    synced: false,
    provider: 'hubspot',
    error:
      'HubSpot authentication failed. HUBSPOT_ACCESS_TOKEN is missing or invalid, and HUBSPOT_MOCK_MODE is false.',
  };
}

function syncToMockCrm(
  input: SyncLeadInput,
  salesState: Partial<SalesState>,
  callSummary: string,
  firstName: string,
  lastName: string,
  companyName: string,
  email: string,
  jobTitle: string,
  phone: string,
  dealName: string,
  dealStage: string,
  estimatedValue: number,
  missingFields: string[],
): SyncLeadResult {
  const sessionId = input.sessionId;
  const existing = mockCrmStore.sessionToRecords.get(sessionId);

  let contactId = existing?.contactId;
  let companyId = existing?.companyId;
  let dealId = existing?.dealId;
  let noteId = existing?.noteId;
  let duplicatePrevented = false;

  console.log('\n[CRM STAGE 4: HubSpot API Properties Prepared (Mock)]');
  console.log(`  name: ${firstName}${lastName ? ` ${lastName}` : ''}`);
  console.log(`  email: ${email || 'undefined'}`);
  console.log(`  phone: ${phone || 'undefined'}`);
  console.log(`  company: ${companyName || 'undefined'}`);
  console.log(`  job title: ${jobTitle || 'undefined'}`);
  console.log(`  need: ${salesState.qualification?.need || salesState.need || 'undefined'}`);
  console.log(`  budget: ${salesState.qualification?.budget || salesState.budget || 'undefined'}`);
  console.log(`  timeline: ${salesState.qualification?.timeline || salesState.timeline || 'undefined'}`);
  console.log(`  company size: ${salesState.qualification?.companySize || salesState.customer?.companySize || salesState.companySize || 'undefined'}`);

  console.log('[CRM FINAL STATE]');
  console.log(`email: ${email || 'not provided'}`);
  console.log(`phone: ${phone || 'not provided'}`);
  console.log(`company: ${companyName}`);
  console.log(`budget: ${salesState.qualification?.budget || salesState.budget || 'not specified'}`);
  console.log(`timeline: ${salesState.qualification?.timeline || salesState.timeline || 'not specified'}`);
  console.log(`need: ${salesState.qualification?.need || salesState.need || 'not specified'}`);
  console.log(`products: ${(salesState.sales?.productsInterested || ['Conversational AI']).join(', ')}`);
  console.log('');
  console.log('[CRM SYNC]');
  console.log(`contact: ${existing ? 'update' : 'create'}`);
  console.log(`company: ${existing ? 'update' : 'create'}`);
  console.log(`deal: ${existing ? 'update' : 'create'}`);
  console.log(`note: create`);

  const mockCustomProps = ['budget', 'timeline', 'company_size', 'need', 'buying_intent', 'lead_score', 'next_best_action'];
  for (const p of mockCustomProps) {
    console.log(`[HUBSPOT PROPERTY SKIPPED] ${p}`);
  }

  if (existing) {
    duplicatePrevented = true;
    mockCrmStore.contacts.set(contactId!, {
      id: contactId!,
      email: email || '',
      firstname: firstName,
      lastname: lastName,
      jobtitle: jobTitle,
      company: companyName,
      phone,
    });
    mockCrmStore.companies.set(companyId!, {
      id: companyId!,
      name: companyName,
      description: `Voice AI Evaluation. Session: ${sessionId}`,
    });
    mockCrmStore.deals.set(dealId!, {
      id: dealId!,
      dealname: dealName,
      dealstage: dealStage,
      amount: estimatedValue.toString(),
    });
    mockCrmStore.notes.set(noteId!, {
      id: noteId!,
      hs_note_body: callSummary,
    });
    console.log(`[HUBSPOT CONTACT] ID: ${contactId} | Updated (Mock)`);
    console.log(`[HUBSPOT COMPANY] ID: ${companyId} | Updated (Mock)`);
    console.log(`[HUBSPOT DEAL] ID: ${dealId} | Updated (Mock)`);
    console.log(`[HUBSPOT NOTE] ID: ${noteId} | Updated (Mock)`);
    console.log(`[CRM SYNC DEMO_MODE] Session: ${sessionId} (Mock Existing Records Updated)`);
  } else {
    contactId = `mock-contact-${mockCrmStore.contacts.size + 1}`;
    companyId = `mock-company-${mockCrmStore.companies.size + 1}`;
    dealId = `mock-deal-${mockCrmStore.deals.size + 1}`;
    noteId = `mock-note-${mockCrmStore.notes.size + 1}`;

    mockCrmStore.contacts.set(contactId, {
      id: contactId,
      email: email || '',
      firstname: firstName,
      lastname: lastName,
      jobtitle: jobTitle,
      company: companyName,
      phone,
    });
    mockCrmStore.companies.set(companyId, {
      id: companyId,
      name: companyName,
      description: `Voice AI Evaluation. Session: ${sessionId}`,
    });
    mockCrmStore.deals.set(dealId, {
      id: dealId,
      dealname: dealName,
      dealstage: dealStage,
      amount: estimatedValue.toString(),
    });
    mockCrmStore.notes.set(noteId, {
      id: noteId,
      hs_note_body: callSummary,
    });

    mockCrmStore.sessionToRecords.set(sessionId, {
      contactId,
      companyId,
      dealId,
      noteId,
    });
    console.log(`[HUBSPOT CONTACT] ID: ${contactId} | Created (Mock)`);
    console.log(`[HUBSPOT COMPANY] ID: ${companyId} | Created (Mock)`);
    console.log(`[HUBSPOT DEAL] ID: ${dealId} | Created (Mock)`);
    console.log(`[HUBSPOT NOTE] ID: ${noteId} | Created (Mock)`);
    console.log(`[CRM SYNC DEMO_MODE] Session: ${sessionId} (Mock New Records Created)`);
  }

  return {
    success: true,
    status: 'demo_mode',
    synced: true,
    isMock: true,
    idempotent: duplicatePrevented,
    contact: { id: contactId! },
    company: { id: companyId! },
    deal: { id: dealId! },
    note: { id: noteId! },
    hubspot: {
      contactId: contactId!,
      companyId: companyId!,
      dealId: dealId!,
      noteId: noteId!,
    },
    contactId,
    companyId,
    dealId,
    noteId,
    summary: callSummary,
    duplicatePrevented,
    missingFields: missingFields.length > 0 ? missingFields : undefined,
  };
}

export function getPendingRetryRecords(): Array<{
  sessionId: string;
  attempts: number;
  lastAttempt: number;
  error?: string;
}> {
  return Array.from(pendingRetryQueue.entries()).map(([sessionId, record]) => ({
    sessionId,
    attempts: record.attempts,
    lastAttempt: record.lastAttempt,
    error: record.error,
  }));
}
