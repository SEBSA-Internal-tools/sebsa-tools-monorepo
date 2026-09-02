export interface DashboardHeroStat {
  icon: string;
  value: string;
  label: string;
}

export interface DashboardHeroData {
  greeting?: string;
  title: string;
  description: string;
  stats: DashboardHeroStat[];
}

export interface DashboardSummaryCard {
  label: string;
  value: string;
  change: string;
  icon: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
}

export interface DashboardProjectHealthItem {
  id: string;
  projectName: string;
  status: string;
  health: string;
  healthStatus: 'success' | 'warning' | 'danger';
  budget: number;
  timeline: number;
  resources: number;
  risks: number;
  completionPercentage: number;
  team: string[];
  totalTasks: number;
  completedTasks: number;
  color?: string | null;
}

export interface DashboardSummaryResponse {
  hero: DashboardHeroData;
  summaryCards: DashboardSummaryCard[];
  projectHealthMatrix: DashboardProjectHealthItem[];
}
