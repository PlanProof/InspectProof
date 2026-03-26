export type Plan = 'free_trial' | 'starter' | 'professional' | 'enterprise';

export interface PlanLimits {
  maxProjects: number | null;
  maxInspectionsMonthly: number | null;
  maxInspectionsTotal: number | null;
  maxTeamMembers: number | null;
  customTemplates: boolean;
  allReportTypes: boolean;
  label: string;
  monthlyPriceAud: number | null;
  annualPriceAud: number | null;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free_trial: {
    maxProjects: 1,
    maxInspectionsMonthly: null,
    maxInspectionsTotal: 10,
    maxTeamMembers: 1,
    customTemplates: false,
    allReportTypes: false,
    label: 'Free Trial',
    monthlyPriceAud: 0,
    annualPriceAud: 0,
  },
  starter: {
    maxProjects: 10,
    maxInspectionsMonthly: 50,
    maxInspectionsTotal: null,
    maxTeamMembers: 3,
    customTemplates: false,
    allReportTypes: true,
    label: 'Starter',
    monthlyPriceAud: 5900,
    annualPriceAud: 59000,
  },
  professional: {
    maxProjects: null,
    maxInspectionsMonthly: null,
    maxInspectionsTotal: null,
    maxTeamMembers: 10,
    customTemplates: true,
    allReportTypes: true,
    label: 'Professional',
    monthlyPriceAud: 14900,
    annualPriceAud: 149000,
  },
  enterprise: {
    maxProjects: null,
    maxInspectionsMonthly: null,
    maxInspectionsTotal: null,
    maxTeamMembers: null,
    customTemplates: true,
    allReportTypes: true,
    label: 'Enterprise',
    monthlyPriceAud: null,
    annualPriceAud: null,
  },
};

export function getLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.free_trial;
}
