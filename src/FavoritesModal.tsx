import { useEffect, useState } from "react";
import {
  FAVORITES_CAP_BYTES,
  addFavorite,
  byteSizeOf,
  getUsedBytes,
  listFavorites,
  planEviction,
  removeFavorite,
  type EvictionPlan,
  type FavoriteRecord,
} from "./favoritesDb";
import { formatBytes } from "./jsonUtils";
import { TrashIcon } from "./icons";

type SaveStage = "name" | "confirm-evict" | "too-large";

export function SaveFavoriteModal({
  raw,
  kind,
  defaultName,
  onClose,
  onSaved,
}: {
  raw: string;
  kind: string;
  defaultName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [stage, setStage] = useState<SaveStage>("name");
  const [plan, setPlan] = useState<EvictionPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const incomingBytes = byteSizeOf(raw);

  async function handleContinue() {
    const p = await planEviction(incomingBytes);
    setPlan(p);
    if (!p.fits) {
      setStage("too-large");
    } else if (p.toEvict.length > 0) {
      setStage("confirm-evict");
    } else {
      await doSave([]);
    }
  }

  async function doSave(evictIds: number[]) {
    setSaving(true);
    await addFavorite(name.trim() || defaultName, raw, kind, evictIds);
    setSaving(false);
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {stage === "name" && (
          <>
            <div className="modal-header">
              <h3>Save to favorites</h3>
            </div>
            <div className="modal-body">
              <label className="modal-label" htmlFor="fav-name-input">
                Name
              </label>
              <input
                id="fav-name-input"
                className="modal-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleContinue();
                }}
              />
              <p className="hint-text">This payload is {formatBytes(incomingBytes)}.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-accent" onClick={handleContinue} disabled={saving || !name.trim()}>
                Save
              </button>
            </div>
          </>
        )}

        {stage === "confirm-evict" && plan && (
          <>
            <div className="modal-header">
              <h3>Favorites storage is full</h3>
            </div>
            <div className="modal-body">
              <p className="hint-text">
                Saving “{name}” ({formatBytes(incomingBytes)}) would go over the 2 MB favorites limit. The
                oldest {plan.toEvict.length} favorite{plan.toEvict.length === 1 ? "" : "s"} below (
                {formatBytes(plan.evictedBytes)} total) will be removed to make room:
              </p>
              <ul className="eviction-list">
                {plan.toEvict.map((f) => (
                  <li key={f.id}>
                    <span>{f.name}</span>
                    <span className="eviction-size">{formatBytes(f.bytes)}</span>
                  </li>
                ))}
              </ul>
              <p className="hint-text">
                New payload: {formatBytes(incomingBytes)} · Usage after: {formatBytes(plan.newUsedBytes)} /{" "}
                {formatBytes(FAVORITES_CAP_BYTES)}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-accent"
                onClick={() => doSave(plan.toEvict.map((f) => f.id!))}
                disabled={saving}
              >
                Confirm & save
              </button>
            </div>
          </>
        )}

        {stage === "too-large" && plan && (
          <>
            <div className="modal-header">
              <h3>Payload too large</h3>
            </div>
            <div className="modal-body">
              <p className="hint-text">
                This payload is {formatBytes(incomingBytes)}, which alone exceeds the{" "}
                {formatBytes(FAVORITES_CAP_BYTES)} favorites limit — even removing every saved favorite
                wouldn't make room for it.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function FavoritesBrowserModal({ onClose, onLoad }: { onClose: () => void; onLoad: (raw: string) => void }) {
  const [items, setItems] = useState<FavoriteRecord[]>([]);
  const [usedBytes, setUsedBytes] = useState(0);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const [list, used] = await Promise.all([listFavorites(), getUsedBytes()]);
    setItems(list);
    setUsedBytes(used);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDelete(id?: number) {
    if (id === undefined) return;
    await removeFavorite(id);
    refresh();
  }

  const pct = Math.min(100, (usedBytes / FAVORITES_CAP_BYTES) * 100);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Favorites</h3>
        </div>
        <div className="modal-body">
          <div className="favorites-usage">
            <div className="favorites-usage-bar">
              <div className="favorites-usage-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="hint-text">
              {formatBytes(usedBytes)} of {formatBytes(FAVORITES_CAP_BYTES)} used
            </span>
          </div>
          {loading && <p className="hint-text">Loading…</p>}
          {!loading && items.length === 0 && <p className="search-empty">No favorites saved yet.</p>}
          <ul className="favorites-modal-list">
            {items.map((f) => (
              <li key={f.id} className="favorites-modal-item">
                <div className="favorites-modal-item-main">
                  <span className="favorite-name">{f.name}</span>
                  <span className="favorite-meta">
                    {f.kind.toUpperCase()} · {formatBytes(f.bytes)} · {new Date(f.savedAt).toLocaleString()}
                  </span>
                </div>
                <div className="favorites-modal-item-actions">
                  <button className="btn btn-accent" onClick={() => onLoad(f.raw)}>
                    Load
                  </button>
                  <button className="btn icon-btn icon-btn-only" title="Delete" onClick={() => handleDelete(f.id)}>
                    <TrashIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
