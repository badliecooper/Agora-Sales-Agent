'use client';

import React, { useState, useEffect, useRef } from 'react';
import { PendingDetailsRequest } from '@/lib/sales/types';
import { isValidCustomerEmail } from '@/lib/sales/email-validation';
import { X, CheckCircle2, AlertCircle, Loader2, Sparkles, User, Mail, Building2, Phone } from 'lucide-react';

export interface CustomerDetailsModalProps {
  isOpen: boolean;
  request: PendingDetailsRequest | null;
  currentCustomer: {
    fullName?: string | null;
    email?: string | null;
    company?: string | null;
    phone?: string | null;
    [key: string]: unknown;
  };
  onSubmit: (details: {
    fullName: string;
    email: string;
    company?: string;
    phone?: string;
    [key: string]: unknown;
  }) => Promise<void>;
  onClose: () => void;
}

export function CustomerDetailsModal({
  isOpen,
  request,
  currentCustomer,
  onSubmit,
  onClose,
}: CustomerDetailsModalProps) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    company: '',
    phone: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [voiceCollectedFields, setVoiceCollectedFields] = useState<Set<string>>(new Set());

  const firstInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Sync initial form values and determine which fields were already collected via voice
  useEffect(() => {
    if (isOpen) {
      const voiceFields = new Set<string>();

      const initialName = currentCustomer.fullName || '';
      const initialEmail = currentCustomer.email || '';
      const initialCompany = currentCustomer.company || '';
      const initialPhone = currentCustomer.phone || '';

      if (initialName) voiceFields.add('fullName');
      if (initialEmail) voiceFields.add('email');
      if (initialCompany) voiceFields.add('company');
      if (initialPhone) voiceFields.add('phone');

      setFormData({
        fullName: initialName,
        email: initialEmail,
        company: initialCompany,
        phone: initialPhone,
      });

      setVoiceCollectedFields(voiceFields);
      setErrors({});
      setIsSubmitting(false);

      // Focus first missing required field
      setTimeout(() => {
        if (!initialName && firstInputRef.current) {
          firstInputRef.current.focus();
        } else if (!initialEmail && emailInputRef.current) {
          emailInputRef.current.focus();
        } else if (firstInputRef.current) {
          firstInputRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen, currentCustomer]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const requiredFields = request?.requiredFields || ['fullName', 'email'];
  const isNameRequired = requiredFields.includes('fullName') || requiredFields.includes('name');
  const isEmailRequired = requiredFields.includes('email');
  const isCompanyRequired = requiredFields.includes('company');
  const isPhoneRequired = requiredFields.includes('phone');

  const actionTitle = request?.title || "Let's get your details";
  const actionDescription =
    request?.description ||
    'Please verify your contact details so we can complete this action and send your confirmation.';

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Validate Full Name
    if (isNameRequired && (!formData.fullName || formData.fullName.trim().length < 2)) {
      newErrors.fullName = 'Full Name is required (minimum 2 characters).';
    }

    // Validate Email
    if (isEmailRequired) {
      if (!formData.email || !formData.email.trim()) {
        newErrors.email = 'Email address is required.';
      } else if (!isValidCustomerEmail(formData.email.trim())) {
        newErrors.email = 'Please enter a valid, real email address (e.g. name@company.com; placeholders like example.com are not accepted).';
      }
    } else if (formData.email && !isValidCustomerEmail(formData.email.trim())) {
      newErrors.email = 'Please enter a valid, non-placeholder email address.';
    }

    // Validate Company if required
    if (isCompanyRequired && (!formData.company || formData.company.trim().length < 2)) {
      newErrors.company = 'Company name is required.';
    }

    // Validate Phone if provided
    if (formData.phone && formData.phone.trim()) {
      const digitsOnly = formData.phone.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        newErrors.phone = 'Please enter a valid phone number (7-15 digits).';
      }
    } else if (isPhoneRequired) {
      newErrors.phone = 'Phone number is required.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        fullName: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        company: formData.company.trim() || undefined,
        phone: formData.phone.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      console.error('[CustomerDetailsModal] Submit error:', err);
      setErrors((prev) => ({
        ...prev,
        form: err instanceof Error ? err.message : 'Failed to save details. Please try again.',
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getActionBadge = () => {
    switch (request?.actionType) {
      case 'book_meeting':
        return { label: 'Demo Booking', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
      case 'send_proposal':
        return { label: 'Quote / Proposal', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' };
      case 'send_confirmation':
        return { label: 'Email Confirmation', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' };
      case 'create_hubspot_lead':
        return { label: 'CRM Sync', color: 'bg-orange-500/10 text-orange-400 border-orange-500/30' };
      default:
        return { label: 'Customer Information', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' };
    }
  };

  const actionBadge = getActionBadge();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-details-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-border/80 bg-zinc-950/95 p-6 shadow-2xl backdrop-blur-xl text-foreground animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-zinc-800 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Section */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${actionBadge.color}`}
            >
              <Sparkles className="w-3 h-3" />
              {actionBadge.label}
            </span>
          </div>
          <h2 id="customer-details-title" className="text-xl font-bold tracking-tight text-white">
            {actionTitle}
          </h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{actionDescription}</p>
        </div>

        {/* Global Form Error if any */}
        {errors.form && (
          <div className="mb-4 flex items-center gap-2 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errors.form}</span>
          </div>
        )}

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="modal-fullname" className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-zinc-400" />
                <span>Full Name</span>
                {isNameRequired ? (
                  <span className="text-rose-400 font-bold">*</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span>
                )}
              </label>
              {voiceCollectedFields.has('fullName') && formData.fullName && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  Collected via voice
                </span>
              )}
            </div>
            <input
              ref={firstInputRef}
              id="modal-fullname"
              type="text"
              value={formData.fullName}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, fullName: e.target.value }));
                if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: '' }));
              }}
              placeholder="e.g. Alex Vance"
              disabled={isSubmitting}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm bg-zinc-900/90 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 transition-all ${
                errors.fullName
                  ? 'border-rose-500 focus:ring-rose-500/30'
                  : 'border-border/80 focus:border-indigo-500 focus:ring-indigo-500/30'
              }`}
            />
            {errors.fullName && (
              <p className="mt-1 text-[11px] text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.fullName}
              </p>
            )}
          </div>

          {/* Email Address */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="modal-email" className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-zinc-400" />
                <span>Work Email</span>
                {isEmailRequired ? (
                  <span className="text-rose-400 font-bold">*</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span>
                )}
              </label>
              {voiceCollectedFields.has('email') && formData.email && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  Collected via voice
                </span>
              )}
            </div>
            <input
              ref={emailInputRef}
              id="modal-email"
              type="email"
              value={formData.email}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, email: e.target.value }));
                if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
              }}
              placeholder="e.g. alex@cloudcorp.com"
              disabled={isSubmitting}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm bg-zinc-900/90 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 transition-all ${
                errors.email
                  ? 'border-rose-500 focus:ring-rose-500/30'
                  : 'border-border/80 focus:border-indigo-500 focus:ring-indigo-500/30'
              }`}
            />
            {errors.email && (
              <p className="mt-1 text-[11px] text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.email}
              </p>
            )}
          </div>

          {/* Company Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="modal-company" className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>Company</span>
                {isCompanyRequired ? (
                  <span className="text-rose-400 font-bold">*</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span>
                )}
              </label>
              {voiceCollectedFields.has('company') && formData.company && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  Collected via voice
                </span>
              )}
            </div>
            <input
              id="modal-company"
              type="text"
              value={formData.company}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, company: e.target.value }));
                if (errors.company) setErrors((prev) => ({ ...prev, company: '' }));
              }}
              placeholder="e.g. CloudCorp"
              disabled={isSubmitting}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm bg-zinc-900/90 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 transition-all ${
                errors.company
                  ? 'border-rose-500 focus:ring-rose-500/30'
                  : 'border-border/80 focus:border-indigo-500 focus:ring-indigo-500/30'
              }`}
            />
            {errors.company && (
              <p className="mt-1 text-[11px] text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.company}
              </p>
            )}
          </div>

          {/* Phone Number */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="modal-phone" className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-zinc-400" />
                <span>Phone Number</span>
                {isPhoneRequired ? (
                  <span className="text-rose-400 font-bold">*</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span>
                )}
              </label>
              {voiceCollectedFields.has('phone') && formData.phone && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  Collected via voice
                </span>
              )}
            </div>
            <input
              id="modal-phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, phone: e.target.value }));
                if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
              }}
              placeholder="e.g. +1 555 123 4567"
              disabled={isSubmitting}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm bg-zinc-900/90 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 transition-all ${
                errors.phone
                  ? 'border-rose-500 focus:ring-rose-500/30'
                  : 'border-border/80 focus:border-indigo-500 focus:ring-indigo-500/30'
              }`}
            />
            {errors.phone && (
              <p className="mt-1 text-[11px] text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.phone}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
            >
              Cancel / Later
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-md shadow-indigo-900/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-60 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving details...</span>
                </>
              ) : (
                <span>Continue</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
