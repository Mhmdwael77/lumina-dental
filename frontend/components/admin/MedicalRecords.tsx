"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Plus,
  Search,
  Trash2,
  Loader2,
  X,
  Upload,
  User,
  Phone,
  Stethoscope,
  FileText,
  Activity,
  Pill,
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  Pencil,
} from "lucide-react";
import {
  ApiError,
  MedicalRecord,
  MedicalRecordEntry,
  MedicalImage,
  MedicalRecordProfileInput,
  MedicalRecordEntryInput,
  listMedicalRecords,
  createMedicalRecord,
  editMedicalRecord,
  deleteMedicalRecord,
  createMedicalRecordEntry,
  editMedicalRecordEntry,
  deleteMedicalRecordEntry,
  uploadMedicalImage,
  deleteMedicalImage,
  mediaUrl,
} from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const digitsOf = (s?: string | null) => (s || "").replace(/\D/g, "");

/**
 * Match a search query against a stored phone number, tolerant of
 * country-code / leading-zero differences (e.g. searching "01552007412"
 * should still find a record stored as "+201552007412").
 */
const phoneMatches = (recordPhone: string | null | undefined, queryDigits: string) => {
  const p = digitsOf(recordPhone);
  if (!p) return false;
  if (p.includes(queryDigits)) return true;
  return queryDigits.length >= 7 && (p.endsWith(queryDigits) || queryDigits.endsWith(p));
};

const todayIso = () => new Date().toISOString().slice(0, 10);

type ProfileDraft = {
  patient_name: string;
  gender: string;
  age: string;
  phone: string;
};

const EMPTY_PROFILE: ProfileDraft = { patient_name: "", gender: "", age: "", phone: "" };

type EntryDraft = {
  date: string;
  diagnosis: string;
  symptoms: string;
  prescription: string;
  chronic_conditions: string;
  current_medications: string;
  follow_up_needed: boolean;
  follow_up_notes: string;
  notes: string;
};

const emptyEntry = (): EntryDraft => ({
  date: todayIso(),
  diagnosis: "",
  symptoms: "",
  prescription: "",
  chronic_conditions: "",
  current_medications: "",
  follow_up_needed: false,
  follow_up_notes: "",
  notes: "",
});

export function MedicalRecords({
  token,
  onAuthError,
  readOnly = false,
}: {
  token: string;
  onAuthError?: () => void;
  /** Staff can view records but not create/edit/delete them or their
   *  images — only the ADMIN role may, matching the backend's restriction. */
  readOnly?: boolean;
}) {
  const { t } = useLanguage();

  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Patient profile modal (fixed identity data: name/gender/age/phone)
  const [showForm, setShowForm] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(EMPTY_PROFILE);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSavedNote, setProfileSavedNote] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [deletingRecordId, setDeletingRecordId] = useState<number | null>(null);

  // Dated visit entry form (diagnosis/symptoms/etc. for one visit)
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(emptyEntry());
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryError, setEntryError] = useState("");
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);

  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRecords(await listMedicalRecords(token));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        onAuthError?.();
        return;
      }
      setError(err instanceof ApiError ? err.message : t("admin.records.loadError"));
    } finally {
      setLoading(false);
    }
  }, [token, onAuthError, t]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    const qDigits = digitsOf(q);
    return records.filter((r) => {
      if (r.patient_name.toLowerCase().includes(q)) return true;
      if (qDigits.length > 0 && phoneMatches(r.phone, qDigits)) return true;
      return r.entries.some(
        (e) => (e.diagnosis || "").toLowerCase().includes(q) || (e.symptoms || "").toLowerCase().includes(q)
      );
    });
  }, [records, search]);

  const activeRecord = useMemo(
    () => records.find((r) => r.id === editingProfileId) ?? null,
    [records, editingProfileId]
  );
  const activeEntry = useMemo(
    () => activeRecord?.entries.find((e) => e.id === editingEntryId) ?? null,
    [activeRecord, editingEntryId]
  );

  // ── Patient profile ──────────────────────────────────────────────────────
  const openNewProfile = () => {
    setEditingProfileId(null);
    setProfileDraft(EMPTY_PROFILE);
    setProfileError("");
    setProfileSavedNote(false);
    setShowEntryForm(false);
    setEditingEntryId(null);
    setEntryError("");
    setShowForm(true);
  };

  const openProfile = (r: MedicalRecord) => {
    setEditingProfileId(r.id);
    setProfileDraft({
      patient_name: r.patient_name,
      gender: r.gender || "",
      age: r.age != null ? String(r.age) : "",
      phone: r.phone || "",
    });
    setProfileError("");
    setProfileSavedNote(false);
    setShowEntryForm(false);
    setEditingEntryId(null);
    setEntryError("");
    setShowForm(true);
  };

  const buildProfileInput = (): MedicalRecordProfileInput => ({
    patient_name: profileDraft.patient_name.trim(),
    gender: profileDraft.gender || undefined,
    age: profileDraft.age ? parseInt(profileDraft.age, 10) : null,
    phone: profileDraft.phone.trim() || undefined,
  });

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileDraft.patient_name.trim()) return setProfileError(t("admin.records.nameError"));
    setProfileSaving(true);
    setProfileError("");
    try {
      const input = buildProfileInput();
      if (editingProfileId == null) {
        const rec = await createMedicalRecord(token, input);
        setEditingProfileId(rec.id); // switch to edit mode so visits can be added
      } else {
        await editMedicalRecord(token, editingProfileId, input);
      }
      setProfileSavedNote(true);
      setTimeout(() => setProfileSavedNote(false), 2500);
      await load();
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : t("admin.records.saveError"));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleDeleteRecord = async (id: number) => {
    if (!confirm(t("admin.records.deleteConfirm"))) return;
    setDeletingRecordId(id);
    try {
      await deleteMedicalRecord(token, id);
      if (editingProfileId === id) setShowForm(false);
      await load();
    } catch {
      /* keep list on failure */
    } finally {
      setDeletingRecordId(null);
    }
  };

  // ── Visit entries ────────────────────────────────────────────────────────
  const openNewEntry = () => {
    setEditingEntryId(null);
    setEntryDraft(emptyEntry());
    setEntryError("");
    setShowEntryForm(true);
  };

  const openEditEntry = (entry: MedicalRecordEntry) => {
    setEditingEntryId(entry.id);
    setEntryDraft({
      date: entry.date,
      diagnosis: entry.diagnosis || "",
      symptoms: entry.symptoms || "",
      prescription: entry.prescription || "",
      chronic_conditions: entry.chronic_conditions || "",
      current_medications: entry.current_medications || "",
      follow_up_needed: entry.follow_up_needed,
      follow_up_notes: entry.follow_up_notes || "",
      notes: entry.notes || "",
    });
    setEntryError("");
    setShowEntryForm(true);
  };

  const cancelEntryForm = () => {
    setShowEntryForm(false);
    setEditingEntryId(null);
    setEntryError("");
  };

  const buildEntryInput = (): MedicalRecordEntryInput => ({
    date: entryDraft.date,
    diagnosis: entryDraft.diagnosis.trim() || undefined,
    symptoms: entryDraft.symptoms.trim() || undefined,
    prescription: entryDraft.prescription.trim() || undefined,
    follow_up_needed: entryDraft.follow_up_needed,
    follow_up_notes: entryDraft.follow_up_notes.trim() || undefined,
    chronic_conditions: entryDraft.chronic_conditions.trim() || undefined,
    current_medications: entryDraft.current_medications.trim() || undefined,
    notes: entryDraft.notes.trim() || undefined,
  });

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProfileId == null) return;
    if (!entryDraft.date) return setEntryError(t("admin.records.dateError"));
    setEntrySaving(true);
    setEntryError("");
    try {
      const input = buildEntryInput();
      if (editingEntryId == null) {
        const entry = await createMedicalRecordEntry(token, editingProfileId, input);
        setEditingEntryId(entry.id); // switch to edit mode so images can be attached
      } else {
        await editMedicalRecordEntry(token, editingEntryId, input);
      }
      await load();
    } catch (err) {
      setEntryError(err instanceof ApiError ? err.message : t("admin.records.entrySaveError"));
    } finally {
      setEntrySaving(false);
    }
  };

  const handleDeleteEntry = async (entryId: number) => {
    if (!confirm(t("admin.records.deleteVisitConfirm"))) return;
    setDeletingEntryId(entryId);
    try {
      await deleteMedicalRecordEntry(token, entryId);
      if (editingEntryId === entryId) cancelEntryForm();
      await load();
    } catch {
      /* keep list on failure */
    } finally {
      setDeletingEntryId(null);
    }
  };

  // ── Images (attached to the entry currently open for edit) ─────────────────
  const handleUpload = async (files: FileList | null) => {
    if (!files || editingEntryId == null) return;
    setUploading(true);
    setEntryError("");
    try {
      for (const file of Array.from(files)) {
        await uploadMedicalImage(token, editingEntryId, file);
      }
      await load();
    } catch (err) {
      setEntryError(err instanceof ApiError ? err.message : t("admin.records.uploadError"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    try {
      await deleteMedicalImage(token, imageId);
      await load();
    } catch {
      /* leave as-is on failure */
    }
  };

  const genderLabel = (g?: string | null) =>
    g === "male" ? t("admin.records.male") : g === "female" ? t("admin.records.female") : g === "other" ? t("admin.records.other") : null;

  const formatDate = (iso: string) => {
    try {
      const [y, m, d] = iso.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  };

  const inputClass =
    "w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-sm text-[#101820] outline-none focus:border-blue-500/50";
  const areaClass = inputClass + " resize-none";
  const labelClass = "flex items-center gap-1 text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1";

  const renderImageGrid = (images: MedicalImage[], allowDelete: boolean) => (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {images.map((img) => (
        <div key={img.id} className="relative group aspect-square rounded-xl overflow-hidden border border-[#101820]/10">
          <a href={mediaUrl(img.url)} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(img.url)} alt={img.original_name || ""} className="h-full w-full object-cover" />
          </a>
          {allowDelete && (
            <button
              onClick={() => handleDeleteImage(img.id)}
              className="absolute top-1 right-1 rtl:right-auto rtl:left-1 p-1 rounded-full bg-red-600/90 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              title={t("admin.records.deleteImage")}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header + search + new */}
      <div className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-[#101820] text-blue-300 flex items-center justify-center">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-medium text-[#101820]">{t("admin.records.title")}</h2>
            <p className="text-xs text-[#101820]/50 mt-0.5">{t("admin.records.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-2.5 w-4 h-4 text-[#101820]/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.records.searchPlaceholder")}
              className="w-56 bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl pl-9 pr-3 rtl:pr-9 rtl:pl-3 py-2 text-xs text-[#101820] outline-none focus:border-blue-500/50"
            />
          </div>
          {!readOnly && (
            <button
              onClick={openNewProfile}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.12em] hover:bg-[#101820]/85 transition-colors"
            >
              <Plus className="w-4 h-4 text-blue-300" />
              {t("admin.records.newRecord")}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#101820]/50">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#101820]/10 rounded-2xl p-12 text-center shadow-sm">
          <div className="max-w-md mx-auto flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-[#f4f1eb] text-blue-500 flex items-center justify-center">
              <ClipboardList className="w-7 h-7" />
            </div>
            <h3 className="font-serif text-xl font-medium text-[#101820]">{t("admin.records.emptyTitle")}</h3>
            <p className="text-xs text-[#101820]/60 leading-relaxed">{t("admin.records.emptyBody")}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((r) => {
            const latest = r.entries[0] || null;
            return (
              <div key={r.id} className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-serif text-lg font-medium text-[#101820]">{r.patient_name}</h3>
                      {genderLabel(r.gender) && (
                        <span className="text-[0.62rem] px-2 py-0.5 rounded-full bg-[#f4f1eb] border border-[#101820]/10 text-[#101820]/60">
                          {genderLabel(r.gender)}
                          {r.age != null ? ` · ${r.age}` : ""}
                        </span>
                      )}
                      <span className="text-[0.62rem] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700">
                        {t("admin.records.entryCount", { count: r.entries.length, plural: r.entries.length > 1 ? "s" : "" })}
                      </span>
                      {latest?.follow_up_needed && (
                        <span className="inline-flex items-center gap-1 text-[0.62rem] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800">
                          <CalendarClock className="w-3 h-3" /> {t("admin.records.followUpShort")}
                        </span>
                      )}
                    </div>
                    {r.phone && (
                      <div className="flex items-center gap-1.5 text-xs text-[#101820]/50 mt-1 font-mono">
                        <Phone className="w-3 h-3 text-blue-500" /> {r.phone}
                      </div>
                    )}
                    {latest && (
                      <p className="text-xs text-[#101820]/70 mt-2 line-clamp-2">
                        <span className="text-[#101820]/40">{formatDate(latest.date)}: </span>
                        {latest.diagnosis || t("admin.records.noVisits")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openProfile(r)}
                      className="px-3 py-1.5 rounded-lg bg-[#f4f1eb] hover:bg-blue-600 hover:text-white border border-[#101820]/15 text-xs text-[#101820] transition-colors"
                    >
                      {t("admin.records.open")}
                    </button>
                    {!readOnly && (
                      <button
                        onClick={() => handleDeleteRecord(r.id)}
                        disabled={deletingRecordId === r.id}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 transition-colors"
                        title={t("admin.records.delete")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {latest && latest.images.length > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    {latest.images.slice(0, 4).map((img) => (
                      <a key={img.id} href={mediaUrl(img.url)} target="_blank" rel="noreferrer" className="block h-12 w-12 rounded-lg overflow-hidden border border-[#101820]/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaUrl(img.url)} alt="" className="h-full w-full object-cover" />
                      </a>
                    ))}
                    {latest.images.length > 4 && (
                      <span className="text-xs text-[#101820]/50">+{latest.images.length - 4}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Patient profile + visit history modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-[#101820]/60 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl my-8 bg-white border border-[#101820]/15 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#101820]/10 pb-4">
              <div>
                <span className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-blue-600">
                  {t("admin.records.profileTitle")}
                </span>
                <h3 className="font-serif text-xl font-medium text-[#101820] mt-0.5">
                  {editingProfileId == null ? t("admin.records.newRecord") : profileDraft.patient_name || t("admin.records.recordLabel")}
                </h3>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-full bg-[#f4f1eb] hover:bg-[#101820] hover:text-white text-[#101820]/60 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile: fixed identity data */}
            <form onSubmit={handleSaveProfile} className="space-y-3">
              {profileError && (
                <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{profileError}</p>
              )}
              <fieldset disabled={readOnly} className="grid grid-cols-1 sm:grid-cols-4 gap-3 min-w-0">
                <div className="sm:col-span-2">
                  <label className={labelClass}><User className="w-3 h-3" /> {t("admin.records.name")} *</label>
                  <input value={profileDraft.patient_name} onChange={(e) => setProfileDraft((d) => ({ ...d, patient_name: e.target.value }))} className={inputClass} placeholder={t("admin.records.namePlaceholder")} />
                </div>
                <div>
                  <label className={labelClass}>{t("admin.records.gender")}</label>
                  <select value={profileDraft.gender} onChange={(e) => setProfileDraft((d) => ({ ...d, gender: e.target.value }))} className={inputClass}>
                    <option value="">—</option>
                    <option value="male">{t("admin.records.male")}</option>
                    <option value="female">{t("admin.records.female")}</option>
                    <option value="other">{t("admin.records.other")}</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{t("admin.records.age")}</label>
                  <input type="number" min="0" max="130" value={profileDraft.age} onChange={(e) => setProfileDraft((d) => ({ ...d, age: e.target.value }))} className={inputClass} placeholder="—" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}><Phone className="w-3 h-3" /> {t("admin.records.phone")}</label>
                  <input value={profileDraft.phone} onChange={(e) => setProfileDraft((d) => ({ ...d, phone: e.target.value }))} className={inputClass} placeholder="+20 100 000 0000" />
                </div>
              </fieldset>
              {!readOnly && (
                <div className="flex items-center gap-2">
                  <button type="submit" disabled={profileSaving} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.12em] hover:bg-[#101820]/85 transition-colors disabled:opacity-50">
                    {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {editingProfileId == null ? t("admin.records.saveCreate") : t("admin.records.save")}
                  </button>
                  {profileSavedNote && <span className="text-xs text-emerald-700">{t("admin.records.saved")}</span>}
                </div>
              )}
            </form>

            {/* Visit history: dated entries */}
            <div className="border-t border-[#101820]/10 pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-[#101820] flex items-center gap-1.5">
                  <Stethoscope className="w-4 h-4 text-blue-500" /> {t("admin.records.visitHistory")}
                </h4>
                {!readOnly && editingProfileId != null && (
                  <button
                    onClick={openNewEntry}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-700 border border-blue-500/30 hover:bg-blue-500/20 text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> {t("admin.records.addVisit")}
                  </button>
                )}
              </div>

              {editingProfileId == null ? (
                <p className="text-xs text-[#101820]/45">{t("admin.records.saveFirst")}</p>
              ) : (
                <>
                  {/* Entry create/edit form */}
                  {showEntryForm && (
                    <form onSubmit={handleSaveEntry} className="p-4 rounded-2xl bg-[#f4f1eb] border border-blue-500/30 space-y-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#101820] uppercase tracking-wider">
                        <span className="flex items-center justify-center h-6 w-6 rounded-lg bg-blue-500/15 text-blue-700">
                          {editingEntryId == null ? <Plus className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                        </span>
                        {editingEntryId == null ? t("admin.records.newVisitTitle") : t("admin.records.editVisitTitle")}
                      </div>
                      {entryError && (
                        <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{entryError}</p>
                      )}
                      <fieldset disabled={readOnly} className="space-y-3 min-w-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className={labelClass}><CalendarClock className="w-3 h-3" /> {t("admin.records.visitDate")} *</label>
                            <input
                              type="date"
                              value={entryDraft.date}
                              onChange={(e) => setEntryDraft((d) => ({ ...d, date: e.target.value }))}
                              className={inputClass}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className={labelClass}><Stethoscope className="w-3 h-3" /> {t("admin.records.diagnosis")}</label>
                            <textarea rows={2} value={entryDraft.diagnosis} onChange={(e) => setEntryDraft((d) => ({ ...d, diagnosis: e.target.value }))} className={areaClass} />
                          </div>
                          <div>
                            <label className={labelClass}><AlertTriangle className="w-3 h-3" /> {t("admin.records.symptoms")}</label>
                            <textarea rows={2} value={entryDraft.symptoms} onChange={(e) => setEntryDraft((d) => ({ ...d, symptoms: e.target.value }))} className={areaClass} />
                          </div>
                          <div className="sm:col-span-2">
                            <label className={labelClass}><FileText className="w-3 h-3" /> {t("admin.records.prescription")}</label>
                            <textarea rows={2} value={entryDraft.prescription} onChange={(e) => setEntryDraft((d) => ({ ...d, prescription: e.target.value }))} className={areaClass} />
                          </div>
                          <div>
                            <label className={labelClass}><Activity className="w-3 h-3" /> {t("admin.records.chronic")}</label>
                            <textarea rows={2} value={entryDraft.chronic_conditions} onChange={(e) => setEntryDraft((d) => ({ ...d, chronic_conditions: e.target.value }))} className={areaClass} />
                          </div>
                          <div>
                            <label className={labelClass}><Pill className="w-3 h-3" /> {t("admin.records.medications")}</label>
                            <textarea rows={2} value={entryDraft.current_medications} onChange={(e) => setEntryDraft((d) => ({ ...d, current_medications: e.target.value }))} className={areaClass} />
                          </div>
                          <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-3">
                            <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-[#101820]/15 text-xs text-[#101820] cursor-pointer shrink-0">
                              <input type="checkbox" checked={entryDraft.follow_up_needed} onChange={(e) => setEntryDraft((d) => ({ ...d, follow_up_needed: e.target.checked }))} className="accent-blue-600 w-3.5 h-3.5" />
                              {t("admin.records.followUp")}
                            </label>
                            {entryDraft.follow_up_needed && (
                              <input value={entryDraft.follow_up_notes} onChange={(e) => setEntryDraft((d) => ({ ...d, follow_up_notes: e.target.value }))} placeholder={t("admin.records.followUpNotesPlaceholder")} className={inputClass + " flex-1"} />
                            )}
                          </div>
                          <div className="sm:col-span-2">
                            <label className={labelClass}>{t("admin.records.notes")}</label>
                            <textarea rows={2} value={entryDraft.notes} onChange={(e) => setEntryDraft((d) => ({ ...d, notes: e.target.value }))} className={areaClass} />
                          </div>
                        </div>
                      </fieldset>

                      {!readOnly && (
                        <div className="flex items-center gap-2">
                          <button type="submit" disabled={entrySaving} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium hover:bg-[#101820]/85 transition-colors disabled:opacity-50">
                            {entrySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            {entrySaving ? t("admin.records.savingVisit") : t("admin.records.saveVisit")}
                          </button>
                          <button type="button" onClick={cancelEntryForm} className="px-3.5 py-1.5 rounded-xl bg-white border border-[#101820]/15 text-[#101820]/70 text-xs font-medium hover:bg-[#101820]/5 transition-colors">
                            {t("admin.records.cancel")}
                          </button>
                        </div>
                      )}

                      {/* Images for the entry being edited — only once it has an id */}
                      <div className="border-t border-[#101820]/10 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-xs font-medium text-[#101820] flex items-center gap-1.5">
                            <Upload className="w-3.5 h-3.5 text-blue-500" /> {t("admin.records.images")}
                          </h5>
                          {!readOnly && editingEntryId != null && (
                            <div>
                              <input ref={fileRef} type="file" accept="image/*" multiple onChange={(e) => handleUpload(e.target.files)} className="hidden" id="med-entry-file" disabled={uploading} />
                              <label
                                htmlFor="med-entry-file"
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-blue-500/10 text-blue-700 border border-blue-500/30 hover:bg-blue-500/20 cursor-pointer transition-colors"
                              >
                                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                {t("admin.records.uploadImage")}
                              </label>
                            </div>
                          )}
                        </div>
                        {editingEntryId == null ? (
                          <p className="text-xs text-[#101820]/45">{t("admin.records.saveEntryFirst")}</p>
                        ) : !activeEntry || activeEntry.images.length === 0 ? (
                          <p className="text-xs text-[#101820]/45">{t("admin.records.noImages")}</p>
                        ) : (
                          renderImageGrid(activeEntry.images, !readOnly)
                        )}
                      </div>
                    </form>
                  )}

                  {/* Entries list (already ordered newest-first by the API) */}
                  {activeRecord && activeRecord.entries.length === 0 && !showEntryForm ? (
                    <p className="text-xs text-[#101820]/45">{t("admin.records.noVisits")}</p>
                  ) : (
                    <div className="space-y-3">
                      {activeRecord?.entries.map((entry) => (
                        <div key={entry.id} className="p-4 rounded-2xl bg-[#f4f1eb]/60 border border-[#101820]/10 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-[#101820] bg-white border border-[#101820]/10 rounded-lg px-2.5 py-1">
                                {formatDate(entry.date)}
                              </span>
                              {entry.follow_up_needed && (
                                <span className="inline-flex items-center gap-1 text-[0.62rem] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800">
                                  <CalendarClock className="w-3 h-3" /> {t("admin.records.followUpShort")}
                                </span>
                              )}
                            </div>
                            {!readOnly && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button onClick={() => openEditEntry(entry)} className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-600 hover:text-white border border-[#101820]/15 text-xs text-[#101820] transition-colors">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteEntry(entry.id)}
                                  disabled={deletingEntryId === entry.id}
                                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 transition-colors"
                                  title={t("admin.records.deleteVisit")}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#101820]/80">
                            {entry.diagnosis && <p><span className="text-[#101820]/40">{t("admin.records.diagnosis")}: </span>{entry.diagnosis}</p>}
                            {entry.symptoms && <p><span className="text-[#101820]/40">{t("admin.records.symptoms")}: </span>{entry.symptoms}</p>}
                            {entry.prescription && <p><span className="text-[#101820]/40">{t("admin.records.prescription")}: </span>{entry.prescription}</p>}
                            {entry.chronic_conditions && <p><span className="text-[#101820]/40">{t("admin.records.chronic")}: </span>{entry.chronic_conditions}</p>}
                            {entry.current_medications && <p><span className="text-[#101820]/40">{t("admin.records.medications")}: </span>{entry.current_medications}</p>}
                            {entry.notes && <p><span className="text-[#101820]/40">{t("admin.records.notes")}: </span>{entry.notes}</p>}
                          </div>
                          {entry.images.length > 0 && renderImageGrid(entry.images, false)}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
