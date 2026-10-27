import { C, type ReportStatus } from './constants';

export type Workflow = Record<string, string[]>;

export const DEFAULT_WORKFLOW: Workflow = C.reportTransitions;
export const REPORT_FLOW: ReportStatus[] = ['submitted', 'acknowledged', 'assigned', 'in_progress', 'resolved'];

/** Statuses a report may move to next (the rules enforce the same table). */
export function nextStatuses(from: string, workflow: Workflow | null | undefined): string[] {
  return (workflow ?? DEFAULT_WORKFLOW)[from] ?? [];
}

export function isOpen(status: string): boolean {
  return status !== 'resolved' && status !== 'rejected';
}

/** Index of the status in the main lifecycle, for progress bars (-1 if off it). */
export function progressIndex(status: string): number {
  return REPORT_FLOW.indexOf(status as ReportStatus);
}
