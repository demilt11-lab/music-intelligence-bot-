'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';

interface SignalCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  stat: string;
  statLabel: string;
  accentClass: string;
}

function SignalCard({ icon, title, description, stat, statLabel, accentClass }: SignalCardProps) {
  return (
    <Card variant="default" className="p-4 flex flex-col gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accentClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="mt-auto pt-2 border-t border-slate-800">
        <span className="text-lg font-bold tabular-nums text-slate-100">{stat}</span>
        <span className="text-xs text-slate-500 ml-1.5">{statLabel}</span>
      </div>
    </Card>
  );
}

interface SignalsSectionProps {
  breakingArtistCount: number;
  viralTrackCount: number;
  rightsComplexityAvg: number | null;
}

export function SignalsSection({ breakingArtistCount, viralTrackCount, rightsComplexityAvg }: SignalsSectionProps) {
  return (
    <section aria-labelledby="signals-heading" className="mb-6">
      <h2 id="signals-heading" className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
        Signals You Can't Get Anywhere Else
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SignalCard
          accentClass="bg-emerald-900/50 text-emerald-400"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
            </svg>
          }
          title="ML Breakout Predictions"
          description="XGBoost + neural trajectory model trained on 3 years of chart history. Surfaces artists 4–8 weeks before mainstream charts."
          stat={String(breakingArtistCount)}
          statLabel="artists predicted to break this week"
        />
        <SignalCard
          accentClass="bg-violet-900/50 text-violet-400"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          }
          title="Geographic Viral Spread"
          description="Track TikTok adoption entropy across 20+ regions. Identifies cultural crossover moments before they hit Western platforms."
          stat={String(viralTrackCount)}
          statLabel="tracks with cross-regional velocity today"
        />
        <SignalCard
          accentClass="bg-amber-900/50 text-amber-400"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          }
          title="Rights Complexity Score"
          description="Proprietary score combining split count, PRO registration gaps, and ownership chain depth. Flags high-friction signings before due diligence."
          stat={rightsComplexityAvg != null ? rightsComplexityAvg.toFixed(2) : '—'}
          statLabel="avg complexity score across today's radar"
        />
      </div>
    </section>
  );
}

SignalsSection.displayName = 'SignalsSection';
export default SignalsSection;
