import AsyncStorage from '@react-native-async-storage/async-storage';

export const UPDATE_RELEASE_NOTES_STORAGE_KEY = '@spendly/update_release_notes_v2';

export interface ReleaseNoteItem {
  id: string;
  title: string;
  description: string;
  minAppVersion?: string;
  minRuntimeVersion?: string;
  releaseId?: string;
  updateId?: string;
}

interface ReleaseNotesLedger {
  deliveredNoteIds: string[];
  pendingInstall?: {
    updateId: string;
    noteIds: string[];
  };
}

const emptyLedger = (): ReleaseNotesLedger => ({ deliveredNoteIds: [] });

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'note';
}

function compareVersions(left: string, right: string): number | null {
  const a = left.trim().split('.').map((part) => Number(part));
  const b = right.trim().split('.').map((part) => Number(part));
  if (a.some((part) => !Number.isFinite(part)) || b.some((part) => !Number.isFinite(part))) {
    return null;
  }
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const av = a[index] || 0;
    const bv = b[index] || 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

function meetsMinimum(actual: string | undefined, minimum: string | undefined): boolean {
  if (!minimum) return true;
  if (!actual) return false;
  const comparison = compareVersions(actual, minimum);
  return comparison === null ? actual === minimum : comparison >= 0;
}

export function isReleaseNoteApplicable(
  item: ReleaseNoteItem,
  manifest?: { runtimeVersion?: string; version?: string; extra?: Record<string, unknown> }
): boolean {
  const appVersion = cleanString(
    manifest?.version ??
      (isRecord(manifest?.extra?.expoClient) ? manifest?.extra?.expoClient.version : undefined)
  );
  return (
    meetsMinimum(appVersion, item.minAppVersion) &&
    meetsMinimum(cleanString(manifest?.runtimeVersion), item.minRuntimeVersion)
  );
}

function normaliseObject(value: Record<string, unknown>, fallbackKey: string): ReleaseNoteItem | null {
  const title = cleanString(value.title) || cleanString(value.name);
  const description = cleanString(value.description) || cleanString(value.body) || title;
  if (!title || !description) return null;
  const releaseId = cleanString(value.releaseId) || cleanString(value.release);
  const updateId = cleanString(value.updateId);
  const id = cleanString(value.id) || `release-note:${releaseId || updateId || fallbackKey}:${slugify(title)}`;
  return {
    id,
    title,
    description,
    minAppVersion: cleanString(value.minAppVersion),
    minRuntimeVersion: cleanString(value.minRuntimeVersion),
    releaseId,
    updateId,
  };
}

export function normaliseReleaseNotes(
  value: unknown,
  stablePrefix: string
): ReleaseNoteItem[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split('\n') : [];
  return values
    .map((entry, index) => {
      if (isRecord(entry)) return normaliseObject(entry, `${stablePrefix}:${index}`);
      const text = cleanString(entry)?.replace(/^[-*•]\s*/, '');
      if (!text) return null;
      return {
        // Legacy string notes have no publisher-provided ID. Content-derived
        // IDs keep the same announcement from duplicating across OTA groups.
        id: `release-note:legacy:${slugify(text)}`,
        title: text,
        description: text,
      };
    })
    .filter((entry): entry is ReleaseNoteItem => Boolean(entry));
}

export function dedupeReleaseNotes(items: ReleaseNoteItem[]): ReleaseNoteItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function readLedger(): Promise<ReleaseNotesLedger> {
  try {
    const raw = await AsyncStorage.getItem(UPDATE_RELEASE_NOTES_STORAGE_KEY);
    if (!raw) return emptyLedger();
    const parsed = JSON.parse(raw) as Partial<ReleaseNotesLedger>;
    return {
      deliveredNoteIds: Array.isArray(parsed.deliveredNoteIds)
        ? parsed.deliveredNoteIds.filter((id): id is string => typeof id === 'string')
        : [],
      pendingInstall:
        parsed.pendingInstall &&
        typeof parsed.pendingInstall.updateId === 'string' &&
        Array.isArray(parsed.pendingInstall.noteIds)
          ? {
              updateId: parsed.pendingInstall.updateId,
              noteIds: parsed.pendingInstall.noteIds.filter(
                (id): id is string => typeof id === 'string'
              ),
            }
          : undefined,
    };
  } catch {
    return emptyLedger();
  }
}

async function writeLedger(ledger: ReleaseNotesLedger): Promise<void> {
  await AsyncStorage.setItem(
    UPDATE_RELEASE_NOTES_STORAGE_KEY,
    JSON.stringify({
      deliveredNoteIds: Array.from(new Set(ledger.deliveredNoteIds)),
      pendingInstall: ledger.pendingInstall,
    })
  );
}

type UpdateIdentity = {
  id?: string;
  updateId?: string;
  runtimeVersion?: string;
  version?: string;
};

function getManifestUpdateId(manifest?: UpdateIdentity | null): string | undefined {
  return cleanString(manifest?.id) || cleanString(manifest?.updateId);
}

export async function getDeliveredReleaseNoteIds(): Promise<Set<string>> {
  return new Set((await readLedger()).deliveredNoteIds);
}

export async function getUnreconciledReleaseNotes(
  items: ReleaseNoteItem[],
  manifest?: { runtimeVersion?: string; version?: string; extra?: Record<string, unknown> }
): Promise<ReleaseNoteItem[]> {
  const delivered = await getDeliveredReleaseNoteIds();
  return dedupeReleaseNotes(items).filter(
    (item) => isReleaseNoteApplicable(item, manifest) && !delivered.has(item.id)
  );
}

export async function stageUpdateInstallation(
  manifest: UpdateIdentity | null | undefined,
  items: ReleaseNoteItem[]
): Promise<void> {
  const updateId = getManifestUpdateId(manifest);
  if (!updateId) return;
  const ledger = await readLedger();
  ledger.pendingInstall = {
    updateId,
    noteIds: dedupeReleaseNotes(items).map((item) => item.id),
  };
  await writeLedger(ledger);
}

export async function abandonStagedUpdateInstallation(): Promise<void> {
  const ledger = await readLedger();
  if (ledger.pendingInstall) {
    delete ledger.pendingInstall;
    await writeLedger(ledger);
  }
}

export async function reconcileInstalledReleaseNotes(
  manifest: UpdateIdentity | null | undefined,
  installedItems: ReleaseNoteItem[] = []
): Promise<void> {
  const updateId = getManifestUpdateId(manifest);
  const ledger = await readLedger();
  const delivered = new Set(ledger.deliveredNoteIds);

  if (updateId && ledger.pendingInstall?.updateId === updateId) {
    ledger.pendingInstall.noteIds.forEach((id) => delivered.add(id));
    delete ledger.pendingInstall;
  }

  // A bundle that already contains structured release metadata is an explicit
  // baseline. We never infer delivery from app version or from opening a dialog.
  installedItems.forEach((item) => delivered.add(item.id));
  ledger.deliveredNoteIds = Array.from(delivered);
  await writeLedger(ledger);
}
