'use client';

import React, { useState, useEffect } from 'react';
import {
  User,
  Building2,
  Briefcase,
  Mail,
  Phone,
  Users,
  CheckCircle2,
  Target,
  Sparkles,
  Database,
  BookOpen,
  Check,
  X,
  Lightbulb,
  Calendar,
  Video,
  Edit3,
  Save,
  Loader2,
  CheckCheck,
  AlertCircle,
  Brain,
  Compass,
  Zap,
  UserCheck,
  ShieldAlert,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { SalesState, SalesStage, BuyingIntent } from '@/lib/sales/types';
import { isValidCustomerEmail } from '@/lib/sales/email-validation';
import { deriveDealIntelligence } from '@/lib/sales/deal-intelligence';

interface SalesIntelligenceDashboardProps {
  salesState: SalesState;
  className?: string;
  onOpenDetailsModal?: () => void;
  onSaveCustomerDetails?: (details: {
    fullName: string;
    email: string;
    company?: string;
    phone?: string;
    jobTitle?: string;
  }) => Promise<void>;
}

// Stage badge styling mapper
function getStageBadge(stage: SalesStage) {
  switch (stage) {
    case 'discovery':
      return { label: 'Discovery', bg: 'bg-blue-500/15 text-blue-300 border-blue-500/30' };
    case 'qualification':
      return { label: 'Qualification', bg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' };
    case 'needs_analysis':
      return { label: 'Needs Analysis', bg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' };
    case 'pitch':
      return { label: 'Pitch', bg: 'bg-purple-500/15 text-purple-300 border-purple-500/30' };
    case 'recommendation':
      return { label: 'Recommendation', bg: 'bg-violet-500/15 text-violet-300 border-violet-500/30' };
    case 'objection_handling':
      return { label: 'Objection Handling', bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    case 'negotiation':
      return { label: 'Negotiation', bg: 'bg-rose-500/15 text-rose-300 border-rose-500/30' };
    case 'closing':
      return { label: 'Closing', bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
    case 'follow_up':
      return { label: 'Follow-up', bg: 'bg-teal-500/15 text-teal-300 border-teal-500/30' };
    default:
      return { label: stage || 'Discovery', bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
  }
}

// Buying intent styling mapper
function getIntentBadge(intent: BuyingIntent) {
  switch (intent) {
    case 'high':
      return { label: 'HIGH INTENT', bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' };
    case 'medium':
      return { label: 'MEDIUM INTENT', bg: 'bg-blue-500/15 text-blue-300 border-blue-500/40' };
    case 'low':
      return { label: 'LOW INTENT', bg: 'bg-zinc-800 text-zinc-400 border-zinc-700' };
    default:
      return { label: 'EVALUATING', bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
  }
}

function formatRelativeTime(timestamp: number) {
  const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);
  if (secondsAgo < 5) return 'Just now';
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
}

// Clean internal field name tags for user display
function cleanFieldName(rawField: string | null | undefined): string {
  if (!rawField) return 'None';
  const stripped = rawField.replace(/_/g, ' ').trim();
  if (stripped.toLowerCase() === 'fullname') return 'Full Name';
  return stripped;
}

// Human-readable Next Best Action translation
function formatNextBestAction(
  rawAction: string | null | undefined,
  dealIntelNextMove: string | undefined,
  dealIntelReason: string | undefined,
  nextQuestionReason: string | undefined,
  currentlyAskingField: string | null
): { headline: string; why: string } {
  // If deal intelligence already computed a rich nextBestMove and strategyReason
  if (dealIntelNextMove && dealIntelNextMove.length > 5 && !dealIntelNextMove.includes('Ask a diagnostic question')) {
    return {
      headline: dealIntelNextMove,
      why: dealIntelReason || 'Derived from current stage requirements and prospect engagement signals.',
    };
  }

  if (!rawAction) {
    if (currentlyAskingField) {
      return {
        headline: `Understand ${cleanFieldName(currentlyAskingField)} before recommending a tier.`,
        why: nextQuestionReason || 'Essential prospect context needed to personalize the solution and estimate sizing accurately.',
      };
    }
    return {
      headline: 'Ask diagnostic discovery questions to understand their voice AI use case and scale.',
      why: 'Establish baseline requirements before pitching solutions or quoting pricing.',
    };
  }

  const actionLower = rawAction.toLowerCase();

  if (actionLower.startsWith('ask_budget') || actionLower === 'ask_budget') {
    return {
      headline: 'Understand expected monthly usage before recommending a plan.',
      why: nextQuestionReason || 'The customer has not provided their expected usage, so an accurate pricing recommendation cannot be made yet.',
    };
  }

  if (actionLower.startsWith('ask_role') || actionLower === 'ask_role' || actionLower === 'ask_job_title') {
    return {
      headline: "Determine the prospect's role and technical involvement in the voice project.",
      why: 'Identifies decision-making authority and technical evaluation criteria.',
    };
  }

  if (actionLower.startsWith('ask_company_size') || actionLower === 'ask_company_size') {
    return {
      headline: 'Identify team size and monthly call concurrency needs.',
      why: 'Ensures recommended tier supports their peak agent volume and throughput.',
    };
  }

  if (actionLower.startsWith('request_email') || actionLower.includes('request_email')) {
    return {
      headline: 'Collect email address to dispatch calendar invite and Google Meet link.',
      why: 'Required to deliver confirmed calendar invite and meeting details.',
    };
  }

  if (actionLower.startsWith('ask_time') || actionLower.includes('ask_time')) {
    return {
      headline: 'Agree on a preferred time slot for a live technical demonstration.',
      why: 'Prospect requested a meeting; lock in a conflict-free time on Google Calendar.',
    };
  }

  if (actionLower.startsWith('confirm_appointment') || actionLower.includes('confirm_appointment')) {
    return {
      headline: 'Confirm scheduled demo details and deliver attendee access link.',
      why: 'Meeting slot is reserved; ensure attendee readiness and show rate.',
    };
  }

  if (actionLower.startsWith('fill_form') || actionLower.includes('fill_form')) {
    return {
      headline: 'Guide customer to review or complete contact details in the form.',
      why: 'Allows prospect to directly verify contact details without voice latency.',
    };
  }

  if (actionLower.startsWith('discover_pain_point') || actionLower.includes('discover_pain_point')) {
    return {
      headline: 'Ask focused discovery questions to understand use case, target audience, and scale.',
      why: 'Uncover primary operational challenges before demonstrating technical capabilities.',
    };
  }

  if (actionLower.startsWith('send_quote') || actionLower.includes('send_quote')) {
    return {
      headline: 'Prepare tailored pricing proposal based on expected volume.',
      why: 'Prospect has verified requirements and requested pricing structure.',
    };
  }

  // If rawAction has a colon like "category: detail description"
  const colonIndex = rawAction.indexOf(':');
  if (colonIndex !== -1 && colonIndex < 35) {
    const detail = rawAction.slice(colonIndex + 1).trim();
    if (detail.length > 5) {
      return {
        headline: detail,
        why: dealIntelReason || nextQuestionReason || 'Aligned with current qualification stage.',
      };
    }
  }

  return {
    headline: rawAction,
    why: dealIntelReason || nextQuestionReason || 'Next strategic action determined by the sales brain.',
  };
}

export function SalesIntelligenceDashboard({
  salesState,
  className = '',
  onOpenDetailsModal,
  onSaveCustomerDetails,
}: SalesIntelligenceDashboardProps) {
  // View mode: 'customer' (prospect-facing) vs 'sales' (internal cockpit)
  const [viewMode, setViewMode] = useState<'customer' | 'sales'>('customer');

  // Manual edit form state
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    company: '',
    phone: '',
    jobTitle: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const manualOverrides =
    salesState.customer?.manualOverrides ||
    salesState.profile?.customer?.manualOverrides ||
    salesState.manualOverrides ||
    {};

  // Keep form data in sync with canonical salesState when user is not actively editing
  useEffect(() => {
    if (!isEditing) {
      setFormData({
        fullName: salesState.customer?.fullName || salesState.customerName || '',
        email: salesState.customer?.email || salesState.email || '',
        company: salesState.customer?.company || salesState.company || '',
        phone: salesState.customer?.phone || salesState.phone || '',
        jobTitle: salesState.customer?.jobTitle || salesState.role || salesState.jobTitle || '',
      });
      setErrors({});
    }
  }, [salesState, isEditing]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    const rawName = formData.fullName.trim();
    if (!rawName || rawName.length < 2) {
      newErrors.fullName = 'Full name is required (min 2 characters)';
    }

    const rawEmail = formData.email.trim().toLowerCase();
    if (!rawEmail || !isValidCustomerEmail(rawEmail)) {
      newErrors.email = 'Please enter a valid, real email address (e.g. name@company.com)';
    }

    const rawPhone = formData.phone.trim();
    if (rawPhone) {
      const digits = rawPhone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        newErrors.phone = 'Phone must contain 7 to 15 digits';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSaving(true);
    setErrors({});

    try {
      if (onSaveCustomerDetails) {
        await onSaveCustomerDetails({
          fullName: rawName,
          email: rawEmail,
          company: formData.company.trim() || undefined,
          phone: rawPhone || undefined,
          jobTitle: formData.jobTitle.trim() || undefined,
        });
      } else {
        const res = await fetch('/api/sales/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: salesState.conversationId,
            updateCustomerDetails: {
              fullName: rawName,
              email: rawEmail,
              company: formData.company.trim() || undefined,
              phone: rawPhone || undefined,
              jobTitle: formData.jobTitle.trim() || undefined,
            },
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || 'Failed to save customer details');
        }
      }

      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3500);
    } catch (err: unknown) {
      setErrors({ form: err instanceof Error ? err.message : 'Failed to save customer details' });
    } finally {
      setIsSaving(false);
    }
  };

  // Extract values with fallbacks to guarantee canonical source of truth
  const customer = salesState.customer || {};
  const qualification = salesState.qualification || { painPoints: [], requirements: [] };
  const sales = salesState.sales || {
    productsInterested: [],
    competitors: [],
    objections: [],
    salesStage: salesState.salesStage || 'discovery',
    leadScore: salesState.leadScore || 10,
    buyingIntent: salesState.buyingIntent || 'low',
  };
  const crm = salesState.crm || { synced: false, syncInProgress: false };
  const knowledgeUsed = salesState.knowledgeUsed || [];

  // Core CRM fields for Checklist & Information Collection
  const customerName = customer.fullName || customer.firstName || salesState.customerName || null;
  const companyName = customer.company || salesState.company || null;
  const jobTitle = customer.jobTitle || salesState.role || salesState.jobTitle || null;
  const email = customer.email || salesState.email || null;
  const phone = customer.phone || salesState.phone || null;
  const companySize = customer.companySize || qualification.companySize || salesState.companySize || null;

  const coreFields = [
    { label: 'Name', key: 'name', value: customerName, icon: User, isOverridden: Boolean(manualOverrides.fullName) },
    { label: 'Company', key: 'company', value: companyName, icon: Building2, isOverridden: Boolean(manualOverrides.company) },
    { label: 'Email', key: 'email', value: email, icon: Mail, isOverridden: Boolean(manualOverrides.email) },
    { label: 'Phone', key: 'phone', value: phone, icon: Phone, isOverridden: Boolean(manualOverrides.phone) },
    { label: 'Company size', key: 'companySize', value: companySize, icon: Users, isOverridden: false },
    { label: 'Role', key: 'role', value: jobTitle, icon: Briefcase, isOverridden: Boolean(manualOverrides.jobTitle) },
  ];

  const collectedCount = coreFields.filter((f) => Boolean(f.value)).length;
  const missingCount = coreFields.length - collectedCount;

  // Active question being asked by the AI Agent
  const currentlyAsking =
    salesState.informationCollection?.lastRequestedField ||
    salesState.nextQuestion?.field ||
    salesState.nextInfoToCollect?.field ||
    null;

  const stageInfo = getStageBadge(sales.salesStage || salesState.salesStage);
  const intentInfo = getIntentBadge(sales.buyingIntent || salesState.buyingIntent);

  const dealIntel = salesState.dealIntelligence || deriveDealIntelligence(salesState);

  const nextBestMoveData = formatNextBestAction(
    sales.nextBestAction || salesState.nextBestAction,
    dealIntel.nextBestMove,
    dealIntel.strategyReason,
    salesState.nextQuestion?.reason,
    currentlyAsking
  );

  // Determine HubSpot CRM status node
  let crmStatusNode: React.ReactNode;
  if (crm.synced) {
    crmStatusNode = (
      <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
        <Check className="h-4 w-4" />
        <span>Synced</span>
      </div>
    );
  } else if (crm.syncInProgress) {
    crmStatusNode = (
      <div className="flex items-center gap-1.5 text-blue-400 font-medium">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
        </span>
        <span>Syncing</span>
      </div>
    );
  } else if (crm.syncFailed) {
    crmStatusNode = (
      <div className="flex items-center gap-1.5 text-rose-400 font-medium">
        <X className="h-4 w-4" />
        <span>Sync failed</span>
      </div>
    );
  } else {
    crmStatusNode = (
      <div className="flex items-center gap-1.5 text-zinc-400 font-medium">
        <span className="h-2 w-2 rounded-full bg-zinc-500"></span>
        <span>Not synced</span>
      </div>
    );
  }

  // Pain points and requirements deduplicated
  const activePainPoints = Array.from(
    new Set([...(qualification.painPoints || []), ...(salesState.painPoints || [])])
  );
  const activeRequirements = Array.from(
    new Set([...(qualification.requirements || []), ...(salesState.requirements || [])])
  );

  return (
    <div className={`flex flex-col gap-3.5 overflow-y-auto pr-1 text-sm ${className}`} aria-label="Sales Intelligence Dashboard">
      {/* ── TOP VIEW SWITCHER ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-xl border border-border/80 bg-card/95 p-1.5 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-lg border border-border/60">
          <button
            type="button"
            onClick={() => setViewMode('customer')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'customer'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Customer View</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('sales')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'sales'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Sales Cockpit</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 pr-2 text-[11px]">
          {viewMode === 'customer' ? (
            <span className="text-emerald-400 font-medium flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Visitor Perspective
            </span>
          ) : (
            <span className="text-indigo-400 font-medium flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse"></span>
              Internal Sales Intelligence
            </span>
          )}
        </div>
      </div>

      {/* ── SHARED CUSTOMER PROFILE SECTION (Used in both views) ──────────── */}
      <section className="rounded-2xl border border-border/70 bg-card/40 p-4 backdrop-blur-md shadow-sm transition-all">
        <div className="flex items-center justify-between border-b border-border/50 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <User className="h-4 w-4" />
            </div>
            <h2 className="font-semibold text-foreground tracking-tight">Customer Profile</h2>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                type="button"
                onClick={() => {
                  setFormData({
                    fullName: salesState.customer?.fullName || salesState.customerName || '',
                    email: salesState.customer?.email || salesState.email || '',
                    company: salesState.customer?.company || salesState.company || '',
                    phone: salesState.customer?.phone || salesState.phone || '',
                    jobTitle: salesState.customer?.jobTitle || salesState.role || salesState.jobTitle || '',
                  });
                  setErrors({});
                  setIsEditing(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                title="Edit customer details"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Details</span>
              </button>
            )}
            {onOpenDetailsModal && !isEditing && (
              <button
                type="button"
                onClick={onOpenDetailsModal}
                className="text-xs text-zinc-400 hover:text-zinc-200 underline decoration-dotted transition-colors cursor-pointer ml-1"
                title="Open modal dialog"
              >
                Modal
              </button>
            )}
          </div>
        </div>

        {/* Save success feedback */}
        {saveSuccess && (
          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in duration-200">
            <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">Details updated and saved to state.</span>
          </div>
        )}

        {isEditing ? (
          /* ── INLINE EDIT FORM ── */
          <form onSubmit={handleSave} className="mt-3 flex flex-col gap-3">
            {errors.form && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errors.form}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {/* Full Name */}
              <div className="flex flex-col gap-1">
                <label className="text-zinc-300 font-medium flex items-center justify-between">
                  <span>Name <span className="text-rose-400">*</span></span>
                  {manualOverrides.fullName && (
                    <span className="text-[10px] text-indigo-400 font-mono">Edited</span>
                  )}
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="e.g. John Smith"
                  className={`w-full rounded-lg border bg-zinc-900/80 px-2.5 py-1.5 text-xs text-foreground placeholder:text-zinc-500 focus:outline-none focus:ring-1 ${
                    errors.fullName
                      ? 'border-rose-500/60 focus:ring-rose-500'
                      : 'border-border/60 focus:border-indigo-500/80 focus:ring-indigo-500'
                  }`}
                />
                {errors.fullName && (
                  <span className="text-[11px] text-rose-400">{errors.fullName}</span>
                )}
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1">
                <label className="text-zinc-300 font-medium flex items-center justify-between">
                  <span>Email <span className="text-rose-400">*</span></span>
                  {manualOverrides.email && (
                    <span className="text-[10px] text-indigo-400 font-mono">Edited</span>
                  )}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g. john@company.com"
                  className={`w-full rounded-lg border bg-zinc-900/80 px-2.5 py-1.5 text-xs text-foreground placeholder:text-zinc-500 focus:outline-none focus:ring-1 ${
                    errors.email
                      ? 'border-rose-500/60 focus:ring-rose-500'
                      : 'border-border/60 focus:border-indigo-500/80 focus:ring-indigo-500'
                  }`}
                />
                {errors.email && (
                  <span className="text-[11px] text-rose-400">{errors.email}</span>
                )}
              </div>

              {/* Company */}
              <div className="flex flex-col gap-1">
                <label className="text-zinc-300 font-medium flex items-center justify-between">
                  <span>Company</span>
                  {manualOverrides.company && (
                    <span className="text-[10px] text-indigo-400 font-mono">Edited</span>
                  )}
                </label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="e.g. Acme Technologies"
                  className="w-full rounded-lg border border-border/60 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-foreground placeholder:text-zinc-500 focus:border-indigo-500/80 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Phone */}
              <div className="flex flex-col gap-1">
                <label className="text-zinc-300 font-medium flex items-center justify-between">
                  <span>Phone</span>
                  {manualOverrides.phone && (
                    <span className="text-[10px] text-indigo-400 font-mono">Edited</span>
                  )}
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="e.g. +1 555-0199"
                  className={`w-full rounded-lg border bg-zinc-900/80 px-2.5 py-1.5 text-xs text-foreground placeholder:text-zinc-500 focus:outline-none focus:ring-1 ${
                    errors.phone
                      ? 'border-rose-500/60 focus:ring-rose-500'
                      : 'border-border/60 focus:border-indigo-500/80 focus:ring-indigo-500'
                  }`}
                />
                {errors.phone && (
                  <span className="text-[11px] text-rose-400">{errors.phone}</span>
                )}
              </div>

              {/* Role / Job Title */}
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-zinc-300 font-medium flex items-center justify-between">
                  <span>Role / Job Title</span>
                  {manualOverrides.jobTitle && (
                    <span className="text-[10px] text-indigo-400 font-mono">Edited</span>
                  )}
                </label>
                <input
                  type="text"
                  value={formData.jobTitle}
                  onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                  placeholder="e.g. CTO / Product Director"
                  className="w-full rounded-lg border border-border/60 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-foreground placeholder:text-zinc-500 focus:border-indigo-500/80 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  setFormData({
                    fullName: salesState.customer?.fullName || salesState.customerName || '',
                    email: salesState.customer?.email || salesState.email || '',
                    company: salesState.customer?.company || salesState.company || '',
                    phone: salesState.customer?.phone || salesState.phone || '',
                    jobTitle: salesState.customer?.jobTitle || salesState.role || salesState.jobTitle || '',
                  });
                  setErrors({});
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 rounded-lg border border-border/60 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-foreground text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* ── REAL CRM PROFILE VIEW ── */
          <div className="mt-3 flex flex-col gap-3">
            {/* Prominent Profile Banner */}
            <div className="rounded-xl bg-zinc-900/60 p-3.5 border border-border/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-bold text-base">
                    {customerName ? customerName.charAt(0).toUpperCase() : <User className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-foreground">
                        {customerName || <span className="text-zinc-400 font-normal italic">Prospect Name Missing</span>}
                      </h3>
                      {manualOverrides.fullName && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">
                          Verified
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-300 font-medium mt-0.5">
                      {companyName || <span className="text-zinc-400 italic">Company not specified yet</span>}
                      {jobTitle && <span className="text-zinc-500 mx-1.5">•</span>}
                      {jobTitle && <span className="text-zinc-300">{jobTitle}</span>}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Structured CRM Attributes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {/* Email */}
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-zinc-950/40">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Email</span>
                </span>
                <span className="font-mono text-zinc-200 truncate max-w-[60%] font-medium">
                  {email || <span className="text-zinc-400 italic text-[11px]">Not provided yet</span>}
                </span>
              </div>
              {/* Phone */}
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-zinc-950/40">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Phone</span>
                </span>
                <span className="font-mono text-zinc-200 truncate max-w-[60%] font-medium">
                  {phone || <span className="text-zinc-400 italic text-[11px]">Not provided yet</span>}
                </span>
              </div>
              {/* Role */}
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-zinc-950/40">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Role</span>
                </span>
                <span className="text-zinc-200 truncate max-w-[60%] font-medium">
                  {jobTitle || <span className="text-zinc-400 italic text-[11px]">Not established yet</span>}
                </span>
              </div>
              {/* Company Size */}
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-zinc-950/40">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Company Size</span>
                </span>
                <span className="text-zinc-200 truncate max-w-[60%] font-medium">
                  {companySize || <span className="text-zinc-400 italic text-[11px]">Not specified yet</span>}
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* ── CONDITIONAL VIEW A: CUSTOMER VIEW (VISITOR PERSPECTIVE) ─────────── */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {viewMode === 'customer' && (
        <>
          {/* 1. What We Understood About Your Requirements */}
          <section className="rounded-2xl border border-border/70 bg-card/40 p-4 backdrop-blur-md shadow-sm">
            <div className="flex items-center gap-2 border-b border-border/50 pb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground tracking-tight">Understanding Your Needs</h2>
                <p className="text-[11px] text-zinc-400">Summary of requirements and objectives captured from our discussion</p>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-3 text-xs">
              {/* Core Need */}
              <div className="rounded-xl border border-border/40 bg-zinc-900/50 p-3">
                <span className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider block mb-1">
                  Primary Use Case & Goal
                </span>
                <p className="text-sm font-medium text-foreground leading-relaxed">
                  {qualification.need || salesState.need || (
                    <span className="text-zinc-400 italic font-normal">
                      Not identified yet — The AI will determine this during the conversation.
                    </span>
                  )}
                </p>
              </div>

              {/* Requirements List */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-zinc-300">Key Requirements:</span>
                {activeRequirements.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {activeRequirements.map((r, idx) => (
                      <span key={idx} className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-300 font-medium">
                        {r}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/40 bg-zinc-900/40 p-2 text-zinc-400 italic text-[11px]">
                    Not identified yet — Requirements will be captured as you describe your project.
                  </div>
                )}
              </div>

              {/* Pain Points */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-zinc-300">Challenges & Pain Points:</span>
                {activePainPoints.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {activePainPoints.map((p, idx) => (
                      <span key={idx} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 font-medium">
                        {p}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/40 bg-zinc-900/40 p-2 text-zinc-400 italic text-[11px]">
                    Not identified yet — Let the AI agent know if you have latency, cost, or scaling concerns.
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 2. Tailored Recommendation & Pricing Highlights */}
          <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4 backdrop-blur-md shadow-sm">
            <div className="flex items-center gap-2 border-b border-primary/20 pb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground tracking-tight">Recommended Solution</h2>
                <p className="text-[11px] text-zinc-400">Tailored architecture to match your requirements</p>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-3 text-xs">
              <div className="rounded-xl border border-primary/30 bg-card/60 p-3.5">
                <div className="text-base font-bold text-foreground flex items-center justify-between">
                  <span>{sales.recommendedProduct || salesState.recommendedProduct || 'Agora Conversational AI Engine'}</span>
                  <span className="text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                  {sales.recommendationReason || salesState.recommendationReason || 'Optimal low-latency conversational voice agent workflow with global SD-RTN sub-500ms pipeline.'}
                </p>
              </div>

              {/* Pricing & Value Pillars */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-xl border border-border/50 bg-zinc-900/50 p-2.5">
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Transparent Pricing</span>
                  <span className="text-sm font-bold text-foreground font-mono mt-0.5 block">$0.10 / min</span>
                  <span className="text-[11px] text-zinc-400 mt-0.5 block">First 300 minutes free each month</span>
                </div>
                <div className="rounded-xl border border-border/50 bg-zinc-900/50 p-2.5">
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Latency SLA</span>
                  <span className="text-sm font-bold text-emerald-400 font-mono mt-0.5 block">&lt; 500 ms</span>
                  <span className="text-[11px] text-zinc-400 mt-0.5 block">Ultra-responsive turn-taking</span>
                </div>
                <div className="rounded-xl border border-border/50 bg-zinc-900/50 p-2.5">
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Security & Scale</span>
                  <span className="text-sm font-bold text-indigo-400 font-mono mt-0.5 block">SOC2 / HIPAA</span>
                  <span className="text-[11px] text-zinc-400 mt-0.5 block">Global mesh SD-RTN infrastructure</span>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Meeting Scheduling & Consultation */}
          <section className="rounded-2xl border border-border/70 bg-card/40 p-4 backdrop-blur-md shadow-sm">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground tracking-tight">Meeting & Consultation</h2>
                  <p className="text-[11px] text-zinc-400">Live technical consultation with Agora engineers</p>
                </div>
              </div>
              {salesState.appointment?.meetingRequested && (
                <span className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full border ${
                  salesState.appointment.meetingStatus === 'confirmed'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                }`}>
                  {salesState.appointment.meetingStatus.replace('_', ' ')}
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-3 text-xs">
              {salesState.appointment?.meetingRequested ? (
                <div className="flex flex-col gap-2.5">
                  {/* Scheduled Slot Time */}
                  <div className="rounded-xl border border-border/40 bg-zinc-900/60 p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase text-zinc-400 font-semibold block">Scheduled Time</span>
                      <span className="text-sm font-bold text-emerald-400 mt-0.5 block">
                        {salesState.appointment.selectedSlot?.formattedTime ||
                          (salesState.appointment.proposedSlots && salesState.appointment.proposedSlots[0]?.formattedTime) ||
                          'Scheduling in progress...'}
                      </span>
                    </div>
                    <Clock className="w-5 h-5 text-emerald-400 shrink-0" />
                  </div>

                  {/* Google Meet Link */}
                  {salesState.appointment.meetingUrl && (
                    <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Video className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="font-medium text-blue-300 truncate">
                          Google Meet Video Call
                        </span>
                      </div>
                      <a
                        href={salesState.appointment.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-lg text-xs font-semibold shadow-sm transition-colors shrink-0"
                      >
                        <span>Join Meet</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {/* Confirmation Email Status */}
                  {salesState.appointment.attendeeEmail && (
                    <div className="rounded-xl border border-border/40 bg-zinc-900/50 p-2.5 text-zinc-300 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate">
                        Calendar invite delivered to: <strong className="text-emerald-300">{salesState.appointment.attendeeEmail}</strong>
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-border/40 bg-zinc-900/40 p-3 text-center text-zinc-300">
                  <p className="font-medium">Ready to see Agora Conversational AI in your environment?</p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Simply ask the voice agent to schedule a demo at your preferred date and time.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* 4. Clear Next Steps */}
          <section className="rounded-2xl border border-border/70 bg-card/40 p-4 backdrop-blur-md shadow-sm">
            <h2 className="font-semibold text-foreground tracking-tight text-xs uppercase text-zinc-400 mb-2.5">
              Clear Next Steps
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border border-border/40 bg-zinc-900/50 p-3">
                <span className="text-[10px] font-mono font-bold text-indigo-400 block mb-1">STEP 1</span>
                <span className="font-semibold text-foreground block">Voice Discovery</span>
                <span className="text-[11px] text-zinc-400 mt-0.5 block">Talk with the AI agent about your scale and use case.</span>
              </div>
              <div className="rounded-xl border border-border/40 bg-zinc-900/50 p-3">
                <span className="text-[10px] font-mono font-bold text-indigo-400 block mb-1">STEP 2</span>
                <span className="font-semibold text-foreground block">Lock In Demo</span>
                <span className="text-[11px] text-zinc-400 mt-0.5 block">Reserve your Google Meet slot and receive email confirmation.</span>
              </div>
              <div className="rounded-xl border border-border/40 bg-zinc-900/50 p-3">
                <span className="text-[10px] font-mono font-bold text-indigo-400 block mb-1">STEP 3</span>
                <span className="font-semibold text-foreground block">Pilot Implementation</span>
                <span className="text-[11px] text-zinc-400 mt-0.5 block">Deploy sub-500ms voice pipeline with developer support.</span>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* ── CONDITIONAL VIEW B: SALES COCKPIT (INTERNAL DEAL INTELLIGENCE) ───── */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {viewMode === 'sales' && (
        <>
          {/* ── 1. INFORMATION COLLECTION (Clear Visual Checklist) ──────────── */}
          <section className="rounded-2xl border border-border/70 bg-card/40 p-4 backdrop-blur-md shadow-sm">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                  <Lightbulb className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground tracking-tight">Information Collection</h2>
                  <p className="text-[11px] text-zinc-400">Core qualification checklist</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-emerald-400 font-medium">✓ {collectedCount} collected</span>
                <span className="text-zinc-500">•</span>
                <span className="text-zinc-400">○ {missingCount} missing</span>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              {/* Active question indicator */}
              {currentlyAsking && missingCount > 0 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-400/90">
                    Currently asking:
                  </div>
                  <div className="text-sm font-bold text-amber-300 capitalize mt-0.5 flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    {cleanFieldName(currentlyAsking)}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300 font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  All essential customer information collected
                </div>
              )}

              {/* Structured Checklist */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {coreFields.map((field) => {
                  const isKnown = Boolean(field.value);
                  return (
                    <div
                      key={field.key}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                        isKnown
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-medium'
                          : 'border-border/40 bg-zinc-900/40 text-zinc-400'
                      }`}
                    >
                      <span className={`text-xs font-bold ${isKnown ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {isKnown ? '✓' : '○'}
                      </span>
                      <span className="truncate">{field.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── 2. DEAL INTELLIGENCE (Internal Sales Cockpit) ────────────────── */}
          <section className="rounded-2xl border border-indigo-500/40 bg-gradient-to-br from-indigo-950/40 via-card/60 to-purple-950/30 p-4 backdrop-blur-md shadow-md">
            <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300">
                  <Brain className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground tracking-tight flex items-center gap-2">
                    <span>Deal Intelligence</span>
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                      Real-time Cockpit
                    </span>
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${stageInfo.bg}`}>
                  {stageInfo.label}
                </span>
                <span className="text-xs text-zinc-400">Deal Confidence:</span>
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md border ${
                  dealIntel.dealConfidence >= 75
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : dealIntel.dealConfidence >= 50
                    ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}>
                  {dealIntel.dealConfidence}%
                </span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Buying Intent */}
              <div className="rounded-lg border border-border/40 bg-zinc-900/70 p-2.5">
                <span className="text-[10px] text-zinc-400 uppercase font-medium block">Buying Intent</span>
                <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ${intentInfo.bg}`}>
                  {dealIntel.buyingIntent}
                </span>
              </div>

              {/* Deal Confidence Progress */}
              <div className="rounded-lg border border-border/40 bg-zinc-900/70 p-2.5">
                <span className="text-[10px] text-zinc-400 uppercase font-medium block">Deal Confidence</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs font-bold font-mono text-foreground">{dealIntel.dealConfidence}%</span>
                  <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full ${
                        dealIntel.dealConfidence >= 75 ? 'bg-emerald-400' : dealIntel.dealConfidence >= 50 ? 'bg-indigo-400' : 'bg-amber-400'
                      }`}
                      style={{ width: `${dealIntel.dealConfidence}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Primary Blocker */}
              <div className="rounded-lg border border-border/40 bg-zinc-900/70 p-2.5">
                <span className="text-[10px] text-zinc-400 uppercase font-medium block">Primary Blocker</span>
                <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[11px] font-medium truncate max-w-full border ${
                  dealIntel.primaryObjection !== 'None'
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30 font-semibold'
                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                }`}>
                  {dealIntel.primaryObjection !== 'None' ? dealIntel.primaryObjection : 'None identified'}
                </span>
              </div>

              {/* Negotiation Leverage */}
              <div className="rounded-lg border border-border/40 bg-zinc-900/70 p-2.5">
                <span className="text-[10px] text-zinc-400 uppercase font-medium block">Negotiation Leverage</span>
                <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[11px] font-semibold border ${
                  dealIntel.negotiationLeverage === 'Agora (AI)'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : dealIntel.negotiationLeverage === 'Customer'
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                }`}>
                  {dealIntel.negotiationLeverage || 'Evaluating'}
                </span>
              </div>
            </div>

            {/* Need, Budget Sensitivity, Authority & Priorities */}
            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border/40 bg-zinc-900/60 p-2.5">
                <span className="text-[10px] text-zinc-400 uppercase font-medium block mb-0.5">Customer Need:</span>
                <span className="font-medium text-foreground block">
                  {dealIntel.customerNeed || 'Not identified yet — The AI will determine this during the conversation.'}
                </span>
              </div>
              <div className="rounded-lg border border-border/40 bg-zinc-900/60 p-2.5">
                <span className="text-[10px] text-zinc-400 uppercase font-medium block mb-0.5">Budget & Sensitivity:</span>
                <span className="font-medium text-foreground block">
                  {dealIntel.budgetPriceSensitivity || 'Not discussed yet'}
                </span>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border/40 bg-zinc-900/60 p-2.5">
                <span className="text-[10px] text-zinc-400 uppercase font-medium block mb-0.5">Decision Authority & Urgency:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-foreground">{dealIntel.decisionAuthority || 'Not established yet'}</span>
                  <span className="text-zinc-500">•</span>
                  <span className="font-mono text-indigo-300">{dealIntel.timelineUrgency || 'Not specified yet'}</span>
                </div>
              </div>
              <div className="rounded-lg border border-border/40 bg-zinc-900/60 p-2.5">
                <span className="text-[10px] text-zinc-400 uppercase font-medium block mb-1">Customer Priorities:</span>
                <div className="flex flex-wrap gap-1">
                  {dealIntel.customerPriorities && dealIntel.customerPriorities.length > 0 ? (
                    dealIntel.customerPriorities.map((item, idx) => (
                      <span key={idx} className="rounded bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 text-[11px] text-indigo-300 font-medium">
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className="text-zinc-400 italic text-[11px]">Not identified yet</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ── 3. AI STRATEGY & NEGOTIATION BALANCE ────────────────────────── */}
          <section className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-4 backdrop-blur-md shadow-sm">
            <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300">
                  <Compass className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground tracking-tight">AI Strategy</h2>
                  <p className="text-[11px] text-zinc-400">Autonomous tactic selection and negotiation balance</p>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                dealIntel.giveGetBalance.includes('Balanced')
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : dealIntel.giveGetBalance.includes('Demanding')
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700'
              }`}>
                {dealIntel.giveGetBalance}
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-2.5 text-xs">
              {/* Current Strategy */}
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3">
                <div className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider">
                  Current Strategy:
                </div>
                <div className="text-sm font-bold text-foreground mt-0.5">
                  {dealIntel.currentStrategy}
                </div>
                <div className="mt-2 text-xs text-zinc-300 border-t border-indigo-500/20 pt-1.5 leading-relaxed">
                  <span className="font-semibold text-indigo-300">Why Selected: </span>
                  <span>{dealIntel.strategyReason}</span>
                </div>
              </div>

              {/* Negotiation Give / Get Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* Customer Wants */}
                <div className="rounded-lg border border-border/40 bg-zinc-900/50 p-2.5">
                  <span className="text-[10px] text-zinc-400 uppercase font-medium block mb-1">
                    Customer Wants:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {dealIntel.customerWants.length > 0 ? (
                      dealIntel.customerWants.map((want, idx) => (
                        <span key={idx} className="rounded bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 text-[11px] text-rose-300 font-medium">
                          {want}
                        </span>
                      ))
                    ) : (
                      <span className="text-zinc-400 italic text-[11px]">None identified yet</span>
                    )}
                  </div>
                </div>

                {/* AI Has Offered */}
                <div className="rounded-lg border border-border/40 bg-zinc-900/50 p-2.5">
                  <span className="text-[10px] text-zinc-400 uppercase font-medium block mb-1">
                    AI Has Offered:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {dealIntel.aiOffered.length > 0 ? (
                      dealIntel.aiOffered.map((offer, idx) => (
                        <span key={idx} className="rounded bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[11px] text-emerald-300 font-medium">
                          {offer}
                        </span>
                      ))
                    ) : (
                      <span className="text-zinc-400 italic text-[11px]">Standard pricing</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── 4. UPGRADED "NEXT BEST ACTION" (⚡ Next Best Move) ─────────── */}
          <section className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-950/30 via-card/60 to-orange-950/20 p-4 backdrop-blur-md shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <Zap className="h-4 w-4" />
              </div>
              <h2 className="font-semibold text-foreground tracking-tight text-sm uppercase tracking-wider text-amber-300">
                ⚡ Next Best Move
              </h2>
            </div>

            <div className="mt-2 text-sm font-bold text-foreground leading-snug">
              {nextBestMoveData.headline}
            </div>
            <div className="mt-2.5 text-xs text-zinc-300 leading-relaxed border-t border-amber-500/20 pt-2">
              <strong className="text-amber-300 font-semibold">Why: </strong>
              <span>{nextBestMoveData.why}</span>
            </div>
          </section>

          {/* ── 5. RAG VISIBILITY ("KNOWLEDGE USED") ─────────────────────────── */}
          <section className="rounded-2xl border border-border/70 bg-card/40 p-4 backdrop-blur-md shadow-sm">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground tracking-tight">Knowledge Used</h2>
                  <p className="text-[11px] text-zinc-400">RAG context retrieved during this conversation</p>
                </div>
              </div>
              <span className="text-xs text-zinc-400 font-mono">
                {knowledgeUsed.length} {knowledgeUsed.length === 1 ? 'doc' : 'docs'}
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {knowledgeUsed.length === 0 ? (
                <div className="rounded-xl border border-border/40 bg-zinc-900/40 p-3 text-center text-xs text-zinc-400 italic">
                  No specific knowledge chunks retrieved yet for this conversation turn.
                </div>
              ) : (
                knowledgeUsed.slice(0, 5).map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg border border-border/40 bg-zinc-900/50 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-400 shrink-0" />
                      <span className="font-medium text-foreground truncate" title={item.title}>
                        {item.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-zinc-400 font-mono text-[11px]">
                      <span className="text-teal-400 font-medium">{item.relevance}% relevance</span>
                      <span>{formatRelativeTime(item.retrievedAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* ── 6. CALENDAR, GMAIL & HUBSPOT CRM STATUS ─────────────────────── */}
          <section className="rounded-2xl border border-border/70 bg-card/40 p-4 backdrop-blur-md shadow-sm">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground tracking-tight">Calendar & HubSpot CRM</h2>
                  <p className="text-[11px] text-zinc-400">Google Workspace and HubSpot integrations</p>
                </div>
              </div>
              {crmStatusNode}
            </div>

            <div className="mt-3 flex flex-col gap-3 text-xs">
              {/* Calendar Booking Status if requested */}
              {salesState.appointment?.meetingRequested && (
                <div
                  className={`rounded-xl border p-3 ${
                    salesState.appointment.meetingStatus === 'confirmed'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : salesState.appointment.meetingStatus === 'failed'
                      ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                      : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 font-semibold text-xs">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span className="capitalize">{salesState.appointment.meetingType} Booking</span>
                    </div>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border border-current">
                      {salesState.appointment.meetingStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-foreground mt-1">
                    {salesState.appointment.selectedSlot ? (
                      <div>
                        Slot:{' '}
                        <span className="font-medium text-emerald-400">
                          {salesState.appointment.selectedSlot.formattedTime}
                        </span>
                      </div>
                    ) : salesState.appointment.proposedSlots && salesState.appointment.proposedSlots.length > 0 ? (
                      <div>
                        Proposed:{' '}
                        <span className="font-medium">
                          {salesState.appointment.proposedSlots[0].formattedTime}
                        </span>
                      </div>
                    ) : (
                      <div className="text-zinc-400">Scheduling requested...</div>
                    )}
                  </div>
                  {salesState.appointment.meetingUrl && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium mt-1.5">
                      <Video className="h-3.5 w-3.5 shrink-0" />
                      <a
                        href={salesState.appointment.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-blue-300 truncate font-mono text-[11px]"
                      >
                        {salesState.appointment.meetingUrl}
                      </a>
                    </div>
                  )}
                  {salesState.appointment.attendeeEmail && (
                    <div className="text-[11px] text-zinc-300 mt-1 flex items-center gap-1 truncate">
                      <Mail className="h-3 w-3 shrink-0 text-emerald-400" />
                      <span>Attendee: {salesState.appointment.attendeeEmail}</span>
                    </div>
                  )}
                </div>
              )}

              {/* HubSpot CRM Records */}
              <div className="rounded-xl border border-border/40 bg-zinc-900/50 p-3 font-mono">
                {crm.synced && (crm.hubspotContactId || crm.hubspotCompanyId || crm.hubspotDealId) ? (
                  <div className="grid grid-cols-1 gap-1.5">
                    {crm.hubspotContactId && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 font-normal">Contact ID:</span>
                        <span className="font-semibold text-emerald-400">{crm.hubspotContactId}</span>
                      </div>
                    )}
                    {crm.hubspotCompanyId && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 font-normal">Company ID:</span>
                        <span className="font-semibold text-emerald-400">{crm.hubspotCompanyId}</span>
                      </div>
                    )}
                    {crm.hubspotDealId && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 font-normal">Deal ID:</span>
                        <span className="font-semibold text-emerald-400">{crm.hubspotDealId}</span>
                      </div>
                    )}
                  </div>
                ) : crm.syncInProgress ? (
                  <div className="text-center text-blue-400 text-xs font-sans">
                    Syncing active sales qualification to HubSpot...
                  </div>
                ) : crm.syncFailed ? (
                  <div className="text-center text-rose-400 text-xs font-sans">
                    {crm.syncError || 'HubSpot synchronization encountered an error.'}
                  </div>
                ) : (
                  <div className="text-center text-zinc-400 text-xs font-sans">
                    Records will be synchronized upon call completion.
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
