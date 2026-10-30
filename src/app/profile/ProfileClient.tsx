"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Shield,
  User,
  Lock,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Trash2,
  Save,
  X,
  Mail,
  Phone,
  CalendarDays,
  Award,
  Loader2,
} from "lucide-react";

type Completion = {
  completed: number;
  total: number;
  percent: number;
  missing: { field: string; label: string }[];
  optionalMissing: { field: string; label: string }[];
};

type Profile = {
  id: string;
  fullName: string;
  prn: string | null;
  regiNumber: string | null;
  wing: string | null;
  division: string | null;
  year: string | null;
  branch: string | null;
  dob: string | null;
  bloodGroup: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  parentContact: string | null;
  height: string | null;
  weight: string | null;
  emergencyContact: string | null;
  hasPhoto: boolean;
  completion: Completion;
};

type EditableValue = string;

const EDITABLE_FIELDS: {
  field: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: string[];
  placeholder?: string;
  required?: boolean;
}[] = [
  { field: "phone", label: "Phone", type: "text", placeholder: "9876543210" },
  { field: "bloodGroup", label: "Blood group", type: "text", placeholder: "O+" },
  {
    field: "gender",
    label: "Gender",
    type: "select",
    options: ["Male", "Female", "Other"],
  },
  { field: "address", label: "Address", type: "textarea" },
  { field: "parentContact", label: "Parent contact", type: "text" },
  {
    field: "emergencyContact",
    label: "Emergency contact",
    type: "text",
  },
  { field: "height", label: "Height", type: "text", placeholder: "172 cm" },
  { field: "weight", label: "Weight", type: "text", placeholder: "62 kg" },
];

const LOCKED_FIELDS: { field: string; label: string }[] = [
  { field: "fullName", label: "Full name" },
  { field: "prn", label: "PRN" },
  { field: "regiNumber", label: "Regimental number" },
  { field: "wing", label: "Wing" },
  { field: "division", label: "Division" },
  { field: "year", label: "Academic year" },
  { field: "branch", label: "Branch / programme" },
  { field: "dob", label: "Date of birth" },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return String(value);
}

export default function ProfileClient({
  user,
  profile: initialProfile,
}: {
  user: { id: string; name: string; email: string; role: string };
  profile: Profile | null;
  fieldOwnership: Record<string, string>;
  fieldLabels: Record<string, string>;
}) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState<Record<string, EditableValue>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [photoRevision, setPhotoRevision] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const completion = useMemo(() => {
    return (
      profile?.completion ?? {
        completed: 0,
        total: 0,
        percent: 0,
        missing: [],
        optionalMissing: [],
      }
    );
  }, [profile]);

  const startEditing = () => {
    const next: Record<string, EditableValue> = {};

    for (const field of EDITABLE_FIELDS) {
      const value = profile ? (profile as unknown as Record<string, unknown>)[field.field] : null;
      next[field.field] = value === null || value === undefined ? "" : String(value);
    }

    setValues(next);
    setMessage(null);
    setIsEditing(true);
  };

  const save = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage({
          kind: "error",
          text: payload.error ?? "The profile could not be saved",
        });
        return;
      }

      setProfile(payload.profile);
      setIsEditing(false);
      setMessage({
        kind: "success",
        text: payload.changed?.length
          ? "Your profile has been updated"
          : "Nothing changed",
      });
    } catch {
      setMessage({ kind: "error", text: "The profile could not be saved" });
    } finally {
      setIsSaving(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    setIsUploading(true);
    setMessage(null);

    try {
      const body = new FormData();
      body.append("photo", file);

      const response = await fetch("/api/profile/photo", {
        method: "POST",
        body,
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage({
          kind: "error",
          text: payload.error ?? "The photo could not be uploaded",
        });
        return;
      }

      setPhotoRevision((revision) => revision + 1);
      setProfile((current) =>
        current ? { ...current, hasPhoto: true } : current
      );
      setMessage({ kind: "success", text: "Your profile photo has been updated" });
    } catch {
      setMessage({ kind: "error", text: "The photo could not be uploaded" });
    } finally {
      setIsUploading(false);
    }
  };

  const removePhoto = async () => {
    setIsUploading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/profile/photo", { method: "DELETE" });
      const payload = await response.json();

      if (!response.ok) {
        setMessage({
          kind: "error",
          text: payload.error ?? "The photo could not be removed",
        });
        return;
      }

      setPhotoRevision((revision) => revision + 1);
      setProfile((current) =>
        current ? { ...current, hasPhoto: false } : current
      );
      setMessage({ kind: "success", text: "Your profile photo has been removed" });
    } catch {
      setMessage({ kind: "error", text: "The photo could not be removed" });
    } finally {
      setIsUploading(false);
    }
  };

  const displayName = profile?.fullName || user.name;

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="bg-ncc-dark-blue text-white rounded-3xl p-5 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute -top-16 -right-10 w-64 h-64 bg-ncc-red/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="relative">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-white/10 border-2 border-ncc-gold flex items-center justify-center shrink-0">
                {profile?.hasPhoto ? (
                  <Image
                    src={`/api/profile/photo?r=${photoRevision}`}
                    alt={`Profile photo of ${displayName}`}
                    width={112}
                    height={112}
                    unoptimized
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="font-heading font-black text-3xl text-ncc-gold">
                    {initials(displayName) || "NC"}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={isUploading}
                className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-ncc-red hover:bg-ncc-red-light text-white flex items-center justify-center shadow-lg disabled:opacity-60"
                aria-label="Change profile photo"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    void uploadPhoto(file);
                  }
                }}
              />
            </div>

            <div className="min-w-0">
              <h1 className="font-heading font-black text-xl sm:text-3xl truncate">
                {displayName}
              </h1>
              <p className="text-white/70 text-xs sm:text-sm mt-1 flex items-center gap-2">
                <Mail className="w-4 h-4 shrink-0" />
                <span className="truncate">{user.email}</span>
              </p>
              <p className="text-white/60 text-xs mt-1">
                {profile?.wing || "Wing pending"} • {profile?.division || "Division pending"}{" "}
                • {profile?.year || "Year pending"}
              </p>

              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/70 mb-1.5">
                  <span>Profile completion</span>
                  <span>
                    {completion.completed}/{completion.total}
                  </span>
                </div>
                <div className="h-2 w-full sm:w-72 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full bg-ncc-gold rounded-full transition-all"
                    style={{ width: `${completion.percent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="sm:ml-auto flex items-center gap-2">
              <Link
                href="/dashboard"
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all"
              >
                Dashboard
              </Link>
              {!isEditing && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="px-4 py-2.5 rounded-xl bg-ncc-red hover:bg-ncc-red-light text-white text-xs font-bold transition-all flex items-center gap-2"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit profile
                </button>
              )}
            </div>
          </div>
        </div>

        {message && (
          <div
            className={`flex items-center gap-2 p-3 sm:p-4 rounded-2xl border text-xs sm:text-sm font-semibold ${
              message.kind === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {message.kind === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            {message.text}
          </div>
        )}

        {completion.missing.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5">
            <h2 className="font-heading font-bold text-amber-900 text-sm sm:text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Information still missing
            </h2>
            <p className="text-xs text-amber-800 mt-1">
              The following details are still empty. Some of them are maintained
              by the unit office, so use the correction request if a locked
              field is wrong.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {completion.missing.map((item) => (
                <li
                  key={item.field}
                  className="px-2.5 py-1 rounded-full bg-white border border-amber-200 text-[11px] font-semibold text-amber-900"
                >
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 sm:p-7">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-heading font-black text-lg text-gray-900 flex items-center gap-2">
                  <User className="w-5 h-5 text-ncc-red" /> Personal details
                </h2>
                {!isEditing && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    Edited by you
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {EDITABLE_FIELDS.map((field) => {
                  const value = profile
                    ? (profile as unknown as Record<string, unknown>)[field.field]
                    : null;

                  return (
                    <div
                      key={field.field}
                      className={field.type === "textarea" ? "sm:col-span-2" : ""}
                    >
                      <label
                        htmlFor={`profile-${field.field}`}
                        className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5"
                      >
                        {field.label}
                      </label>

                      {isEditing ? (
                        field.type === "select" ? (
                          <select
                            id={`profile-${field.field}`}
                            value={values[field.field] ?? ""}
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [field.field]: event.target.value,
                              }))
                            }
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                          >
                            <option value="">Not specified</option>
                            {(field.options ?? []).map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <textarea
                            id={`profile-${field.field}`}
                            rows={field.type === "textarea" ? 3 : 1}
                            placeholder={field.placeholder}
                            value={values[field.field] ?? ""}
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [field.field]: event.target.value,
                              }))
                            }
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-red/30 focus:border-ncc-red"
                          />
                        )
                      ) : (
                        <p className="px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-sm text-gray-800 break-words">
                          {displayValue(value) ?? (
                            <span className="text-gray-400">Not provided</span>
                          )}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {isEditing && (
                <div className="flex items-center gap-3 mt-6 pt-5 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={save}
                    disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl bg-ncc-red hover:bg-ncc-red-light disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setMessage(null);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold flex items-center gap-2"
                  >
                    <X className="w-4 h-4" /> Cancel
                  </button>
                </div>
              )}
            </section>

            <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 sm:p-7">
              <h2 className="font-heading font-black text-lg text-gray-900 flex items-center gap-2 mb-1">
                <Shield className="w-5 h-5 text-ncc-red" /> Academic and roster
                details
              </h2>
              <p className="text-xs text-gray-500 mb-5">
                These fields are maintained by the unit office through the NCC
                roster. A cadet cannot change them.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {LOCKED_FIELDS.map((field) => {
                  const value = profile
                    ? (profile as unknown as Record<string, unknown>)[field.field]
                    : null;

                  return (
                    <div key={field.field}>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
                        <Lock className="w-3 h-3" /> {field.label}
                      </p>
                      <p className="px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-sm text-gray-800 break-words">
                        {displayValue(value) ?? (
                          <span className="text-gray-400">Not allotted yet</span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 sm:p-6">
              <h2 className="font-heading font-black text-base text-gray-900 flex items-center gap-2 mb-4">
                <Camera className="w-4 h-4 text-ncc-red" /> Profile photo
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                JPEG, PNG or WebP, up to 5 MB. The photo is resized, stripped of
                its metadata and stored privately.
              </p>

              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={isUploading}
                className="w-full px-4 py-2.5 rounded-xl bg-ncc-dark-blue hover:bg-ncc-navy disabled:opacity-60 text-white text-xs font-bold transition-all"
              >
                {isUploading ? "Working..." : "Choose a photo"}
              </button>

              {profile?.hasPhoto && (
                <button
                  type="button"
                  onClick={removePhoto}
                  disabled={isUploading}
                  className="mt-2 w-full px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-700 text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove photo
                </button>
              )}
            </section>

            <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 sm:p-6">
              <h2 className="font-heading font-black text-base text-gray-900 flex items-center gap-2 mb-4">
                <Award className="w-4 h-4 text-ncc-red" /> Optional details
              </h2>
              {completion.optionalMissing.length === 0 ? (
                <p className="text-xs text-emerald-700 font-semibold">
                  Every optional detail is filled in.
                </p>
              ) : (
                <ul className="space-y-2">
                  {completion.optionalMissing.map((item) => (
                    <li
                      key={item.field}
                      className="flex items-center gap-2 text-xs text-gray-600"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                      {item.label}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-ncc-navy text-white rounded-3xl p-5 sm:p-6">
              <h2 className="font-heading font-black text-base flex items-center gap-2 mb-3">
                <Phone className="w-4 h-4 text-ncc-gold" /> Need a change?
              </h2>
              <p className="text-xs text-white/70 mb-4">
                A locked field is corrected by the unit office. Send the
                correction request from the cadet directory of the admin
                console, or ask your Senior Under Officer.
              </p>
              <div className="flex items-center gap-2 text-xs text-white/60">
                <CalendarDays className="w-4 h-4" />
                Office hours: 09:00 - 17:00
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
