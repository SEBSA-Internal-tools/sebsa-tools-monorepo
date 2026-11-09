'use client';

import React from 'react';
import { Check, X } from 'lucide-react';
import { PASSWORD_REQUIREMENTS } from '@/lib/passwordValidation';

/** Live checklist shared by signup, invitation activation, and password recovery. */
export default function PasswordRequirementsList({ password }: { password: string }) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 px-1">
      {PASSWORD_REQUIREMENTS.map((req) => {
        const met = req.test(password);
        return (
          <li
            key={req.id}
            className={`flex items-center gap-1.5 text-[11px] font-semibold transition-colors ${
              met ? 'text-emerald-600' : 'text-slate-400'
            }`}
          >
            {met ? <Check className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />}
            <span>{req.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
