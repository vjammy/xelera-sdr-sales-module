import type { getOrganizationInviteDigestHistory } from "@/lib/data";

export type DigestFilterState = "all" | "sent" | "manual" | "failed" | "skipped" | "retry";
export type DigestIssueFilterState = "all" | "active_issue" | "reviewed";
export const DIGESTS_PER_PAGE = 6;

export type OrganizationDigestHistory = Awaited<ReturnType<typeof getOrganizationInviteDigestHistory>>;
export type OrganizationDigestHistoryEntry = OrganizationDigestHistory[number];

export function normalizeFilterState(value?: string): DigestFilterState {
  if (value === "sent" || value === "manual" || value === "failed" || value === "skipped" || value === "retry") {
    return value;
  }

  return "all";
}

export function normalizePageNumber(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

export function normalizeIssueFilterState(value?: string): DigestIssueFilterState {
  if (value === "active_issue" || value === "reviewed") {
    return value;
  }

  return "all";
}

export function matchesRecipientFilter(query: string, entry: OrganizationDigestHistoryEntry) {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();

  return (
    entry.recipients.some((recipient) => recipient.toLowerCase().includes(normalizedQuery)) ||
    entry.requestedRecipients.some((recipient) => recipient.toLowerCase().includes(normalizedQuery)) ||
    entry.recipientDeliveries.some((delivery) => delivery.email.toLowerCase().includes(normalizedQuery))
  );
}

export function filterDigestHistory(
  history: OrganizationDigestHistory,
  state: DigestFilterState,
  recipientQuery: string,
  issueState: DigestIssueFilterState = "all",
) {
  return history.filter((entry) => {
    const matchesState =
      state === "all"
        ? true
        : state === "retry"
          ? entry.isTargetedRetry
          : entry.action === state;
    const matchesIssueState =
      issueState === "all"
        ? true
        : entry.recipientDeliveries.some((delivery) => delivery.issueState === issueState);

    return matchesState && matchesRecipientFilter(recipientQuery, entry) && matchesIssueState;
  });
}

export function paginateDigestHistory(history: OrganizationDigestHistory, page: number) {
  const totalPages = Math.max(1, Math.ceil(history.length / DIGESTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * DIGESTS_PER_PAGE;

  return {
    currentPage,
    totalPages,
    paginatedHistory: history.slice(startIndex, startIndex + DIGESTS_PER_PAGE),
  };
}

export function buildDigestHref(args: {
  page: number;
  state: DigestFilterState;
  recipientQuery: string;
  issueState?: DigestIssueFilterState;
}) {
  const params = new URLSearchParams();

  if (args.page > 1) {
    params.set("page", String(args.page));
  }

  if (args.state !== "all") {
    params.set("state", args.state);
  }

  if (args.recipientQuery) {
    params.set("recipient", args.recipientQuery);
  }

  if (args.issueState && args.issueState !== "all") {
    params.set("issue", args.issueState);
  }

  const query = params.toString();

  return query ? `/admin/digests?${query}` : "/admin/digests";
}

export function buildDigestExportHref(args: {
  page: number;
  state: DigestFilterState;
  recipientQuery: string;
  issueState?: DigestIssueFilterState;
}) {
  const path = buildDigestHref(args);
  const params = new URLSearchParams(path.split("?")[1] ?? "");
  const query = params.toString();

  return query ? `/admin/digests/export?${query}` : "/admin/digests/export";
}
