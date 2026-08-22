"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Users,
  ArrowLeft,
  Pencil,
  X,
  KeyRound,
} from "lucide-react";
import {
  ApiError,
  Branch,
  BranchInput,
  BranchStaff,
  WorkingHours,
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  listBranchStaff,
  createBranchStaff,
  deleteBranchStaff,
  resetBranchStaffPassword,
} from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type BranchDraft = {
  name: string;
  address: string;
  consultation_fee: string;
  consultation_price: string;
  consultation_duration_minutes: string;
  consultation_validity_days: string;
};

const EMPTY_BRANCH: BranchDraft = {
  name: "",
  address: "",
  consultation_fee: "",
  consultation_price: "",
  consultation_duration_minutes: "15",
  consultation_validity_days: "14",
};

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

type HoursDraft = Record<(typeof DAYS)[number], { enabled: boolean; opens: string; closes: string }>;

// Mirrors the backend's clinic-wide default (core/clinic_schedule.py):
// open every day 10:00-21:00 except Friday.
const DEFAULT_HOURS: HoursDraft = DAYS.reduce((acc, day) => {
  acc[day] = { enabled: day !== "friday", opens: "10:00", closes: "21:00" };
  return acc;
}, {} as HoursDraft);

const hoursFromBranch = (workingHours?: WorkingHours | null): HoursDraft =>
  DAYS.reduce((acc, day) => {
    const entry = workingHours?.[day];
    acc[day] = entry
      ? { enabled: true, opens: entry.opens, closes: entry.closes }
      : workingHours
      ? { enabled: false, opens: "10:00", closes: "21:00" }
      : DEFAULT_HOURS[day];
    return acc;
  }, {} as HoursDraft);

const hoursToPayload = (hours: HoursDraft): WorkingHours =>
  DAYS.reduce((acc, day) => {
    acc[day] = hours[day].enabled ? { opens: hours[day].opens, closes: hours[day].closes } : null;
    return acc;
  }, {} as WorkingHours);

export function ClinicSettings({ token, onAuthError }: { token: string; onAuthError?: () => void }) {
  const { t } = useLanguage();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<BranchDraft>(EMPTY_BRANCH);
  const [hoursDraft, setHoursDraft] = useState<HoursDraft>(DEFAULT_HOURS);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Staff panel for one branch at a time.
  const [staffBranch, setStaffBranch] = useState<Branch | null>(null);
  const [staff, setStaff] = useState<BranchStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [staffDraft, setStaffDraft] = useState({ username: "", password: "" });
  const [staffSaving, setStaffSaving] = useState(false);
  const [removingStaffId, setRemovingStaffId] = useState<number | null>(null);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [resetDraft, setResetDraft] = useState("");
  const [resetSaving, setResetSaving] = useState(false);

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        onAuthError?.();
        return true;
      }
      return false;
    },
    [onAuthError]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBranches(await listBranches(token));
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err instanceof ApiError ? err.message : t("admin.branches.loadError"));
      }
    } finally {
      setLoading(false);
    }
  }, [token, handleAuthError, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditingId(null);
    setDraft(EMPTY_BRANCH);
    setHoursDraft(DEFAULT_HOURS);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (b: Branch) => {
    setEditingId(b.id);
    setDraft({
      name: b.name,
      address: b.address || "",
      consultation_fee: b.consultation_fee != null ? String(b.consultation_fee) : "",
      consultation_price: b.consultation_price != null ? String(b.consultation_price) : "",
      consultation_duration_minutes:
        b.consultation_duration_minutes != null ? String(b.consultation_duration_minutes) : "15",
      consultation_validity_days:
        b.consultation_validity_days != null ? String(b.consultation_validity_days) : "14",
    });
    setHoursDraft(hoursFromBranch(b.working_hours));
    setFormError("");
    setShowForm(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) {
      setFormError(t("admin.branches.nameError"));
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const input: BranchInput = {
        name: draft.name.trim(),
        address: draft.address.trim() || undefined,
        consultation_fee: parseFloat(draft.consultation_fee) || 0,
        consultation_price: parseFloat(draft.consultation_price) || 0,
        consultation_duration_minutes: parseInt(draft.consultation_duration_minutes, 10) || 15,
        consultation_validity_days: parseInt(draft.consultation_validity_days, 10) || 14,
        working_hours: hoursToPayload(hoursDraft),
      };
      if (editingId == null) {
        await createBranch(token, input);
      } else {
        await updateBranch(token, editingId, input);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      if (!handleAuthError(err)) {
        setFormError(err instanceof ApiError ? err.message : t("admin.branches.saveError"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBranch = async (id: number) => {
    if (!confirm(t("admin.branches.deleteConfirm"))) return;
    setDeletingId(id);
    try {
      await deleteBranch(token, id);
      if (staffBranch?.id === id) setStaffBranch(null);
      await load();
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err instanceof ApiError ? err.message : t("admin.branches.deleteError"));
      }
    } finally {
      setDeletingId(null);
    }
  };

  const loadStaff = useCallback(
    async (branch: Branch) => {
      setStaffLoading(true);
      setStaffError("");
      try {
        setStaff(await listBranchStaff(token, branch.id));
      } catch (err) {
        if (!handleAuthError(err)) {
          setStaffError(err instanceof ApiError ? err.message : t("admin.branches.staffLoadError"));
        }
      } finally {
        setStaffLoading(false);
      }
    },
    [token, handleAuthError, t]
  );

  const openStaffPanel = (branch: Branch) => {
    setStaffBranch(branch);
    setStaffDraft({ username: "", password: "" });
    setStaffError("");
    setResettingId(null);
    loadStaff(branch);
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffBranch) return;
    if (!staffDraft.username.trim() || staffDraft.password.length < 4) {
      setStaffError(t("admin.branches.staffSaveError"));
      return;
    }
    setStaffSaving(true);
    setStaffError("");
    try {
      await createBranchStaff(token, staffBranch.id, {
        username: staffDraft.username.trim(),
        password: staffDraft.password,
      });
      setStaffDraft({ username: "", password: "" });
      await loadStaff(staffBranch);
      await load();
    } catch (err) {
      if (!handleAuthError(err)) {
        setStaffError(err instanceof ApiError ? err.message : t("admin.branches.staffSaveError"));
      }
    } finally {
      setStaffSaving(false);
    }
  };

  const handleRemoveStaff = async (userId: number) => {
    if (!staffBranch) return;
    if (!confirm(t("admin.branches.removeStaffConfirm"))) return;
    setRemovingStaffId(userId);
    try {
      await deleteBranchStaff(token, staffBranch.id, userId);
      await loadStaff(staffBranch);
      await load();
    } catch (err) {
      if (!handleAuthError(err)) {
        setStaffError(err instanceof ApiError ? err.message : t("admin.branches.staffDeleteError"));
      }
    } finally {
      setRemovingStaffId(null);
    }
  };

  const handleResetPassword = async (userId: number) => {
    if (!staffBranch || resetDraft.length < 4) return;
    setResetSaving(true);
    setStaffError("");
    try {
      await resetBranchStaffPassword(token, staffBranch.id, userId, resetDraft);
      setResettingId(null);
      setResetDraft("");
    } catch (err) {
      if (!handleAuthError(err)) {
        setStaffError(err instanceof ApiError ? err.message : t("admin.branches.resetPasswordError"));
      }
    } finally {
      setResetSaving(false);
    }
  };

  const inputClass =
    "w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-sm text-[#101820] outline-none focus:border-[#b99a6b]";
  const labelClass = "block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1";

  // ── Staff panel for one branch ──────────────────────────────────────────
  if (staffBranch) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm">
          <button
            onClick={() => setStaffBranch(null)}
            className="inline-flex items-center gap-1.5 text-xs text-[#101820]/60 hover:text-[#101820] mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
            {t("admin.branches.backToBranches")}
          </button>
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-[#101820] text-[#b99a6b] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h2 className="font-serif text-2xl font-medium text-[#101820]">
              {t("admin.branches.staffTitle", { branch: staffBranch.name })}
            </h2>
          </div>
        </div>

        {staffError && (
          <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{staffError}</span>
          </div>
        )}

        {/* Add staff form */}
        <form
          onSubmit={handleAddStaff}
          className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm space-y-3"
        >
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#101820]/60">
            {t("admin.branches.addStaff")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
            <div>
              <label className={labelClass}>{t("admin.branches.usernameLabel")}</label>
              <input
                type="text"
                value={staffDraft.username}
                onChange={(e) => setStaffDraft((d) => ({ ...d, username: e.target.value }))}
                placeholder={t("admin.branches.usernamePlaceholder")}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("admin.branches.passwordLabel")}</label>
              <input
                type="password"
                value={staffDraft.password}
                onChange={(e) => setStaffDraft((d) => ({ ...d, password: e.target.value }))}
                placeholder={t("admin.branches.passwordPlaceholder")}
                className={inputClass}
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={staffSaving}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium hover:bg-[#101820]/85 transition-colors disabled:opacity-50"
              >
                {staffSaving ? t("admin.branches.saving") : t("admin.branches.createStaff")}
              </button>
            </div>
          </div>
        </form>

        {/* Staff list */}
        {staffLoading ? (
          <div className="flex items-center justify-center py-16 text-[#101820]/50">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : staff.length === 0 ? (
          <div className="bg-white border border-[#101820]/10 rounded-2xl p-10 text-center text-sm text-[#101820]/50 shadow-sm">
            {t("admin.branches.noStaff")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {staff.map((s) => (
              <div
                key={s.id}
                className="bg-white border border-[#101820]/10 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="font-serif text-base font-medium text-[#101820]">{s.username}</p>
                  <p className="text-[0.7rem] text-[#101820]/40">
                    {t("admin.branches.createdOn", { date: new Date(s.created_at).toLocaleDateString() })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {resettingId === s.id ? (
                    <>
                      <input
                        type="password"
                        value={resetDraft}
                        onChange={(e) => setResetDraft(e.target.value)}
                        placeholder={t("admin.branches.newPasswordPlaceholder")}
                        className="w-40 bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-1.5 text-xs text-[#101820] outline-none focus:border-[#b99a6b]"
                      />
                      <button
                        onClick={() => handleResetPassword(s.id)}
                        disabled={resetSaving || resetDraft.length < 4}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        {t("admin.branches.confirmReset")}
                      </button>
                      <button
                        onClick={() => {
                          setResettingId(null);
                          setResetDraft("");
                        }}
                        className="p-1.5 rounded-lg bg-[#f4f1eb] border border-[#101820]/15 text-[#101820]/60 hover:text-[#101820] transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setResettingId(s.id);
                          setResetDraft("");
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f4f1eb] border border-[#101820]/15 text-xs text-[#101820] hover:bg-[#101820] hover:text-white transition-colors"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        {t("admin.branches.resetPassword")}
                      </button>
                      <button
                        onClick={() => handleRemoveStaff(s.id)}
                        disabled={removingStaffId === s.id}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 transition-colors"
                        title={t("admin.branches.removeStaff")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Branch list ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-[#101820] text-[#b99a6b] flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-medium text-[#101820]">{t("admin.branches.title")}</h2>
            <p className="text-xs text-[#101820]/50 mt-0.5">{t("admin.branches.subtitle")}</p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.12em] hover:bg-[#101820]/85 transition-colors"
        >
          <Plus className="w-4 h-4 text-[#b99a6b]" />
          {t("admin.branches.addBranch")}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#101820]/50">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : branches.length === 0 ? (
        <div className="bg-white border border-[#101820]/10 rounded-2xl p-12 text-center shadow-sm">
          <div className="max-w-md mx-auto flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-[#f4f1eb] text-[#b99a6b] flex items-center justify-center">
              <Building2 className="w-7 h-7" />
            </div>
            <h3 className="font-serif text-xl font-medium text-[#101820]">{t("admin.branches.emptyTitle")}</h3>
            <p className="text-xs text-[#101820]/60 leading-relaxed">{t("admin.branches.emptyBody")}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {branches.map((b) => (
            <div key={b.id} className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-lg font-medium text-[#101820]">{b.name}</h3>
                    <span
                      className={`text-[0.62rem] px-2 py-0.5 rounded-full font-medium ${
                        b.is_active
                          ? "bg-emerald-500/10 text-emerald-700 border border-emerald-500/30"
                          : "bg-[#101820]/5 text-[#101820]/50 border border-[#101820]/15"
                      }`}
                    >
                      {b.is_active ? t("admin.branches.active") : t("admin.branches.inactive")}
                    </span>
                  </div>
                  {b.address && <p className="text-xs text-[#101820]/50 mt-1">{b.address}</p>}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#101820]/70 mt-2">
                    <span title={t("admin.branches.feeLabel")}>{t("admin.branches.feeLabel").split(" (")[0]}: {(b.consultation_fee ?? 0).toLocaleString()} EGP</span>
                    <span>·</span>
                    <span title={t("admin.branches.priceLabel")}>{t("admin.branches.priceLabel").split(" (")[0]}: {(b.consultation_price ?? 0).toLocaleString()} EGP</span>
                    <span>·</span>
                    <span>{b.consultation_duration_minutes ?? 15} {t("admin.branches.durationLabel").split(" (")[0]}</span>
                    <span>·</span>
                    <span>{t("admin.branches.validityLabel").split(" (")[0]}: {b.consultation_validity_days ?? 14}</span>
                    <span>·</span>
                    <span>{t("admin.branches.staffCount", { count: b.staff_count })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openEdit(b)}
                    className="p-1.5 rounded-lg bg-[#f4f1eb] hover:bg-[#101820] hover:text-white border border-[#101820]/15 text-[#101820] transition-colors"
                    title={t("admin.branches.edit")}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteBranch(b.id)}
                    disabled={deletingId === b.id}
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 transition-colors"
                    title={t("admin.branches.delete")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <button
                onClick={() => openStaffPanel(b)}
                className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#f4f1eb] border border-[#101820]/10 text-xs text-[#101820] hover:bg-[#101820] hover:text-white transition-colors"
              >
                <Users className="w-3.5 h-3.5" />
                {t("admin.branches.manageStaff")}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit branch modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-[#101820]/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg my-8 bg-white border border-[#101820]/15 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#101820]/10 pb-4">
              <h3 className="font-serif text-xl font-medium text-[#101820]">
                {editingId == null ? t("admin.branches.newBranchTitle") : t("admin.branches.editBranchTitle")}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-full bg-[#f4f1eb] hover:bg-[#101820] hover:text-white text-[#101820]/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-xs">
                  {formError}
                </div>
              )}

              <div>
                <label className={labelClass}>{t("admin.branches.nameLabel")}</label>
                <input
                  type="text"
                  required
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder={t("admin.branches.namePlaceholder")}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>{t("admin.branches.addressLabel")}</label>
                <input
                  type="text"
                  value={draft.address}
                  onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                  placeholder={t("admin.branches.addressPlaceholder")}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>{t("admin.branches.feeLabel")}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.consultation_fee}
                    onChange={(e) => setDraft((d) => ({ ...d, consultation_fee: e.target.value }))}
                    placeholder="0"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t("admin.branches.durationLabel")}</label>
                  <input
                    type="number"
                    min="1"
                    max="240"
                    value={draft.consultation_duration_minutes}
                    onChange={(e) => setDraft((d) => ({ ...d, consultation_duration_minutes: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>{t("admin.branches.priceLabel")}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.consultation_price}
                  onChange={(e) => setDraft((d) => ({ ...d, consultation_price: e.target.value }))}
                  placeholder="0"
                  className={inputClass}
                />
                <p className="text-[0.68rem] text-[#101820]/45 mt-1">{t("admin.branches.priceHint")}</p>
              </div>

              <div>
                <label className={labelClass}>{t("admin.branches.validityLabel")}</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={draft.consultation_validity_days}
                  onChange={(e) => setDraft((d) => ({ ...d, consultation_validity_days: e.target.value }))}
                  className={inputClass}
                />
                <p className="text-[0.68rem] text-[#101820]/45 mt-1">{t("admin.branches.validityHint")}</p>
              </div>

              <div>
                <label className={labelClass}>{t("admin.branches.workingHoursLabel")}</label>
                <p className="text-[0.68rem] text-[#101820]/45 mb-2">{t("admin.branches.workingHoursHint")}</p>
                <div className="rounded-xl border border-[#101820]/10 overflow-y-auto max-h-52 divide-y divide-[#101820]/8">
                  {DAYS.map((day) => {
                    const d = hoursDraft[day];
                    return (
                      <div
                        key={day}
                        className={`flex items-center gap-2 px-2.5 py-1.5 transition-colors ${
                          d.enabled ? "bg-white" : "bg-[#101820]/[0.025]"
                        }`}
                      >
                        <label className="flex items-center gap-2 w-24 shrink-0 text-[0.7rem] font-medium cursor-pointer select-none">
                          <span className="relative inline-flex h-3.5 w-6 shrink-0 items-center">
                            <input
                              type="checkbox"
                              checked={d.enabled}
                              onChange={(e) =>
                                setHoursDraft((h) => ({ ...h, [day]: { ...h[day], enabled: e.target.checked } }))
                              }
                              className="peer absolute inset-0 opacity-0 cursor-pointer"
                            />
                            <span className="pointer-events-none h-3.5 w-6 rounded-full bg-[#101820]/15 peer-checked:bg-[#b99a6b] transition-colors" />
                            <span className="pointer-events-none absolute left-0.5 rtl:left-auto rtl:right-0.5 h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-2.5 rtl:peer-checked:-translate-x-2.5" />
                          </span>
                          <span className={d.enabled ? "text-[#101820]" : "text-[#101820]/40"}>
                            {t(`admin.days.${day}`)}
                          </span>
                        </label>
                        {d.enabled ? (
                          // The row itself follows the page's natural direction (labels
                          // read "من ... إلى ..." right-to-left in Arabic), but each time
                          // input is individually forced dir="ltr" so its HH:MM/AM-PM
                          // segments never mirror — only the row layout should flip, not
                          // the numbers themselves.
                          <div className="flex items-center gap-1 flex-1">
                            <span className="text-[0.62rem] text-[#101820]/40 shrink-0">{t("admin.branches.fromLabel")}</span>
                            <input
                              type="time"
                              dir="ltr"
                              value={d.opens}
                              onChange={(e) =>
                                setHoursDraft((h) => ({ ...h, [day]: { ...h[day], opens: e.target.value } }))
                              }
                              className="flex-1 min-w-0 bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-lg px-1.5 py-0.5 text-[0.7rem] text-[#101820] outline-none focus:border-[#b99a6b] focus:bg-white"
                            />
                            <span className="text-[0.62rem] text-[#101820]/40 shrink-0">{t("admin.branches.toLabel")}</span>
                            <input
                              type="time"
                              dir="ltr"
                              value={d.closes}
                              onChange={(e) =>
                                setHoursDraft((h) => ({ ...h, [day]: { ...h[day], closes: e.target.value } }))
                              }
                              className="flex-1 min-w-0 bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-lg px-1.5 py-0.5 text-[0.7rem] text-[#101820] outline-none focus:border-[#b99a6b] focus:bg-white"
                            />
                          </div>
                        ) : (
                          <span className="flex-1 text-[0.62rem] font-medium uppercase tracking-wider text-[#101820]/30">
                            {t("admin.branches.closed")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-xl bg-[#f4f1eb] hover:bg-[#101820] hover:text-white text-[#101820]/70 text-xs font-medium transition-colors"
                >
                  {t("admin.branches.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.15em] hover:bg-[#101820]/85 transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving ? t("admin.branches.saving") : t("admin.branches.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
