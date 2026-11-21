// Live updates (Decision 0063): the invalidations pathops-events sends, and
// the only place that decides which view an invalidation concerns. A view
// names what it shows with a Topic; it never inspects events itself.

// APPLICATION_CHANGED: the Application itself (created, its provisioning);
// it names no resource.
export type LiveType = "BUILD_CHANGED" | "DELIVERY_CHANGED" | "INBOX_CHANGED" | "APPLICATION_CHANGED";

// LiveEvent is one invalidation: what changed (never its new state).
export interface LiveEvent {
  type: LiveType;
  applicationId: string;
  resourceId?: string;
  occurredAt: string;
}

// Topic is what a view shows, as the invalidations that change it.
export type Topic = (e: LiveEvent) => boolean;

// The Builds or DeliveryRuns of an Application, a page of them. The newest
// page also changes when a new one is created; an older page only when one
// of its own rows changes (a new build never moves the person off it).
export function applicationList(type: "BUILD_CHANGED" | "DELIVERY_CHANGED", appId: string, newest: boolean, ids: string[]): Topic {
  return (e) => e.type === type && e.applicationId === appId && (newest || (e.resourceId !== undefined && ids.includes(e.resourceId)));
}

// One Build or DeliveryRun.
export function resource(type: "BUILD_CHANGED" | "DELIVERY_CHANGED", id: string): Topic {
  return (e) => e.type === type && e.resourceId === id;
}

// One Deployment: its delivery run's changes (a Deployment changes with its
// run, DELIVERY_CHANGED); before it is read, any of its Application's runs.
export function deployment(appId: string, runId: string | undefined): Topic {
  return (e) => e.type === "DELIVERY_CHANGED" && e.applicationId === appId && (runId === undefined || e.resourceId === runId);
}

// The DeliveryRuns of one Application (its overview: every build change
// changes its run too, so one type is enough).
export function deliveries(appId: string): Topic {
  return (e) => e.type === "DELIVERY_CHANGED" && e.applicationId === appId;
}

// The Applications list: any Application created or provisioned, and any
// delivery (its last delivery).
export const applications: Topic = (e) => e.type === "APPLICATION_CHANGED" || e.type === "DELIVERY_CHANGED";

// One Application itself: its provisioning, its repositories.
export function application(appId: string): Topic {
  return (e) => e.type === "APPLICATION_CHANGED" && e.applicationId === appId;
}

// An Application's overview: the Application and its DeliveryRuns.
export function applicationOverview(appId: string): Topic {
  return (e) => application(appId)(e) || deliveries(appId)(e);
}

// The Inbox: its list and the unread count.
export const inbox: Topic = (e) => e.type === "INBOX_CHANGED";

// One Inbox message (read elsewhere).
export function message(id: string | undefined): Topic {
  return (e) => e.type === "INBOX_CHANGED" && id !== undefined && e.resourceId === id;
}

// isLiveEvent: a well-formed invalidation (anything else is ignored).
export function isLiveEvent(v: unknown): v is LiveEvent {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    (e.type === "BUILD_CHANGED" || e.type === "DELIVERY_CHANGED" || e.type === "INBOX_CHANGED" || e.type === "APPLICATION_CHANGED") &&
    typeof e.applicationId === "string" &&
    (e.resourceId === undefined || typeof e.resourceId === "string") &&
    typeof e.occurredAt === "string"
  );
}
