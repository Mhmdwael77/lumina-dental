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
  Pill,
  Activity,
  AlertCircle,
  CalendarClock,
} from "lucide-react";
import {
  ApiError,
  MedicalRecord,
  MedicalImage,
  MedicalRecordInput,
  listMedicalRecords,
  createMedicalRecord,
  editMedicalRecord,
  deleteMedicalRecord,
  uploadMedicalImage,
  deleteMedicalImage,
  mediaUrl,
} from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Draft = {
  patient_name: string;
  gender: string;
  age: string;
  phone: string;
  diagnosis: string;
  prescription: string;
  chronic_conditions: string;
  current_medications: string;
  follow_up_needed: boolean;
  follow_up_notes: string;
  notes: string;
};

const EMPTY: Draft = {
  patient_name: "",
  gender: "",
  age: "",
  phone: "",
  diagnosis: "",
  prescription: "",
  chronic_conditions: "",
  current_medications: "",
  follow_up_needed: false,
  notes: "",
  follow_up_notes: "",
};

export function MedicalRecords({ token, onAuthError }: { token: string; onAuthError?: () => void }) {
  const { t } = useLanguage();

  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [images, setImages] = useState<MedicalImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [formError, setFormError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<number | null>(null);
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
    return records.filter(
      (r) =>
        r.patient_name.toLowerCase().includes(q) ||
        (r.phone || "").toLowerCase().includes(q) ||
        (r.diagnosis || "").toLowerCase().includes(q)
    );
  }, [records, search]);

  const openNew = () => {
    setEditingId(null);
    setDraft(EMPTY);
    setImages([]);
    setFormError("");
    setSavedNote(false);
    setShowForm(true);
  };

  const openEdit = (r: MedicalRecord) => {
    setEditingId(r.id);
    setDraft({
      patient_name: r.patient_name,
      gender: r.gender || "",
      age: r.age != null ? String(r.age) : "",
      phone: r.phone || "",
      diagnosis: r.diagnosis || "",
      prescription: r.prescription || "",
      chronic_conditions: r.chronic_conditions || "",
      current_medications: r.current_medications || "",
      follow_up_needed: r.follow_up_needed,
      follow_up_notes: r.follow_up_notes || "",
      notes: r.notes || "",
    });
    setImages(r.images || []);
    setFormError("");
    setSavedNote(false);
    setShowForm(true);
  };

  const buildInput = (): MedicalRecordInput => ({
    patient_name: draft.patient_name.trim(),
    gender: draft.gender || undefined,
    age: draft.age ? parseInt(draft.age, 10) : null,
    phone: draft.phone.trim() || undefined,
    diagnosis: draft.diagnosis.trim() || undefined,
    prescription: draft.prescription.trim() || undefined,
    chronic_conditions: draft.chronic_conditions.trim() || undefined,
    current_medications: draft.current_medications.trim() || undefined,
    follow_up_needed: draft.follow_up_needed,
    follow_up_notes: draft.follow_up_notes.trim() || undefined,
    notes: draft.notes.trim() || undefined,
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.patient_name.trim()) return setFormError(t("admin.records.nameError"));
    setSaving(true);
    setFormError("");
    try {
      const input = buildInput();
      if (editingId == null) {
        const rec = await createMedicalRecord(token, input);
        setEditingId(rec.id); // switch to edit mode so images can be attached
        setImages(rec.images || []);
      } else {
        const rec = await editMedicalRecord(token, editingId, input);
        setImages(rec.images || []);
      }
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 2500);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("admin.records.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || editingId == null) return;
    setUploading(true);
    setFormError("");
    try {
      for (const file of Array.from(files)) {
        const img = await uploadMedicalImage(token, editingId, file);
        setImages((prev) => [...prev, img]);
      }
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("admin.records.uploadError"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    try {
      await deleteMedicalImage(token, imageId);
      setImages((prev) => prev.filter((i) => i.id !== imageId));
      await load();
    } catch {
      /* leave as-is on failure */
    }
  };

  const handleDeleteRecord = async (id: number) => {
    if (!confirm(t("admin.records.deleteConfirm"))) return;
    setDeletingRecordId(id);
    try {
      await deleteMedicalRecord(token, id);
      if (editingId === id) setShowForm(false);
      await load();
    } catch {
      /* keep list on failure */
    } finally {
      setDeletingRecordId(null);
    }
  };

  const genderLabel = (g?: string | null) =>
    g === "male" ? t("admin.records.male") : g === "female" ? t("admin.records.female") : g === "other" ? t("admin.records.other") : null;

  const inputClass =
    "w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-sm text-[#101820] outline-none focus:border-blue-500/50";
  const areaClass = inputClass + " resize-none";
  const labelClass = "flex items-center gap-1 text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1";

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
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.12em] hover:bg-[#101820]/85 transition-colors"
          >
            <Plus className="w-4 h-4 text-blue-300" />
            {t("admin.records.newRecord")}
          </button>
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
          {filtered.map((r) => (
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
                    {r.follow_up_needed && (
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
                  {r.diagnosis && (
                    <p className="text-xs text-[#101820]/70 mt-2 line-clamp-2">
                      <span className="text-[#101820]/40">{t("admin.records.diagnosis")}: </span>
                      {r.diagnosis}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openEdit(r)}
                    className="px-3 py-1.5 rounded-lg bg-[#f4f1eb] hover:bg-blue-600 hover:text-white border border-[#101820]/15 text-xs text-[#101820] transition-colors"
                  >
                    {t("admin.records.open")}
                  </button>
                  <button
                    onClick={() => handleDeleteRecord(r.id)}
                    disabled={deletingRecordId === r.id}
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 transition-colors"
                    title={t("admin.records.delete")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {r.images.length > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  {r.images.slice(0, 4).map((img) => (
                    <a key={img.id} href={mediaUrl(img.url)} target="_blank" rel="noreferrer" className="block h-12 w-12 rounded-lg overflow-hidden border border-[#101820]/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl(img.url)} alt="" className="h-full w-full object-cover" />
                    </a>
                  ))}
                  {r.images.length > 4 && (
                    <span className="text-xs text-[#101820]/50">+{r.images.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-[#101820]/60 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl my-8 bg-white border border-[#101820]/15 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#101820]/10 pb-4">
              <div>
                <span className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-blue-600">
                  {t("admin.records.recordLabel")}
                </span>
                <h3 className="font-serif text-xl font-medium text-[#101820] mt-0.5">
                  {editingId == null ? t("admin.records.newRecord") : draft.patient_name || t("admin.records.recordLabel")}
                </h3>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-full bg-[#f4f1eb] hover:bg-[#101820] hover:text-white text-[#101820]/60 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {formError && (
                <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formError}</p>
              )}

              {/* Patient identity */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelClass}><User className="w-3 h-3" /> {t("admin.records.name")} *</label>
                  <input value={draft.patient_name} onChange={(e) => setDraft((d) => ({ ...d, patient_name: e.target.value }))} className={inputClass} placeholder={t("admin.records.namePlaceholder")} />
                </div>
                <div>
                  <label className={labelClass}>{t("admin.records.gender")}</label>
                  <select value={draft.gender} onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value }))} className={inputClass}>
                    <option value="">—</option>
                    <option value="male">{t("admin.records.male")}</option>
                    <option value="female">{t("admin.records.female")}</option>
                    <option value="other">{t("admin.records.other")}</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{t("admin.records.age")}</label>
                  <input type="number" min="0" max="130" value={draft.age} onChange={(e) => setDraft((d) => ({ ...d, age: e.target.value }))} className={inputClass} placeholder="—" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}><Phone className="w-3 h-3" /> {t("admin.records.phone")}</label>
                  <input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} className={inputClass} placeholder="+20 100 000 0000" />
                </div>
              </div>

              {/* Clinical */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelClass}><Stethoscope className="w-3 h-3" /> {t("admin.records.diagnosis")}</label>
                  <textarea rows={2} value={draft.diagnosis} onChange={(e) => setDraft((d) => ({ ...d, diagnosis: e.target.value }))} className={areaClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}><FileText className="w-3 h-3" /> {t("admin.records.prescription")}</label>
                  <textarea rows={2} value={draft.prescription} onChange={(e) => setDraft((d) => ({ ...d, prescription: e.target.value }))} className={areaClass} />
                </div>
                <div>
                  <label className={labelClass}><Activity className="w-3 h-3" /> {t("admin.records.chronic")}</label>
                  <textarea rows={2} value={draft.chronic_conditions} onChange={(e) => setDraft((d) => ({ ...d, chronic_conditions: e.target.value }))} className={areaClass} />
                </div>
                <div>
                  <label className={labelClass}><Pill className="w-3 h-3" /> {t("admin.records.medications")}</label>
                  <textarea rows={2} value={draft.current_medications} onChange={(e) => setDraft((d) => ({ ...d, current_medications: e.target.value }))} className={areaClass} />
                </div>
                <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#f4f1eb]/60 border border-[#101820]/15 text-xs text-[#101820] cursor-pointer shrink-0">
                    <input type="checkbox" checked={draft.follow_up_needed} onChange={(e) => setDraft((d) => ({ ...d, follow_up_needed: e.target.checked }))} className="accent-blue-600 w-3.5 h-3.5" />
                    {t("admin.records.followUp")}
                  </label>
                  {draft.follow_up_needed && (
                    <input value={draft.follow_up_notes} onChange={(e) => setDraft((d) => ({ ...d, follow_up_notes: e.target.value }))} placeholder={t("admin.records.followUpNotesPlaceholder")} className={inputClass + " flex-1"} />
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>{t("admin.records.notes")}</label>
                  <textarea rows={2} value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} className={areaClass} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.12em] hover:bg-[#101820]/85 transition-colors disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {editingId == null ? t("admin.records.saveCreate") : t("admin.records.save")}
                </button>
                {savedNote && <span className="text-xs text-emerald-700">{t("admin.records.saved")}</span>}
              </div>
            </form>

            {/* Images */}
            <div className="border-t border-[#101820]/10 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-[#101820] flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-blue-500" /> {t("admin.records.images")}
                </h4>
                <div>
                  <input ref={fileRef} type="file" accept="image/*" multiple onChange={(e) => handleUpload(e.target.files)} className="hidden" id="med-file" disabled={editingId == null || uploading} />
                  <label
                    htmlFor="med-file"
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      editingId == null
                        ? "bg-[#f4f1eb] text-[#101820]/40 cursor-not-allowed"
                        : "bg-blue-500/10 text-blue-700 border border-blue-500/30 hover:bg-blue-500/20 cursor-pointer"
                    }`}
                  >
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {t("admin.records.uploadImage")}
                  </label>
                </div>
              </div>
              {editingId == null ? (
                <p className="text-xs text-[#101820]/45">{t("admin.records.saveFirst")}</p>
              ) : images.length === 0 ? (
                <p className="text-xs text-[#101820]/45">{t("admin.records.noImages")}</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {images.map((img) => (
                    <div key={img.id} className="relative group aspect-square rounded-xl overflow-hidden border border-[#101820]/10">
                      <a href={mediaUrl(img.url)} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaUrl(img.url)} alt={img.original_name || ""} className="h-full w-full object-cover" />
                      </a>
                      <button
                        onClick={() => handleDeleteImage(img.id)}
                        className="absolute top-1 right-1 rtl:right-auto rtl:left-1 p-1 rounded-full bg-red-600/90 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title={t("admin.records.deleteImage")}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
