"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

type VolunteerUser = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  createdAt: string;
  volunteer: {
    id: string;
    languages: string[];
    hoursVolunteered: number;
    isCleared: boolean;
    clearedAt: string | null;
    clearanceLogs: { isCleared: boolean; createdAt: string; clearedBy: { name: string | null; email: string } }[];
  } | null;
};

type TrainingMaterial = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  url: string;
  fileName: string | null;
  languageCode: string | null;
  category: string;
  uploadedBy: { name: string | null; email: string };
  createdAt: string;
};

type Metrics = {
  totalHours: number;
  hoursByLanguage: { code: string; name: string; hours: number }[];
  hoursByClinic: { clinicId: string; clinicName: string; hours: number }[];
  volunteerCount: number;
  activeSlotCount: number;
};

type LanguageConfig = { id: string; code: string; name: string; isActive: boolean };

type Tab = "training" | "volunteers" | "metrics";

export default function InstructorDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("training");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [volunteers, setVolunteers] = useState<VolunteerUser[]>([]);
  const [trainingMaterials, setTrainingMaterials] = useState<TrainingMaterial[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [languages, setLanguages] = useState<LanguageConfig[]>([]);

  const [trainingForm, setTrainingForm] = useState({
    title: "",
    description: "",
    type: "LINK" as "LINK" | "FILE",
    url: "",
    languageCode: "",
    category: "General",
  });
  const [trainingFile, setTrainingFile] = useState<File | null>(null);
  const [trainingFormError, setTrainingFormError] = useState("");
  const [trainingSubmitting, setTrainingSubmitting] = useState(false);
  const [showTrainingForm, setShowTrainingForm] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session?.user?.role && session.user.role !== "INSTRUCTOR") router.push("/dashboard");
  }, [status, session, router]);

  const fetchAll = useCallback(async () => {
    const [usersRes, trainingRes, metricsRes, langsRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/training"),
      fetch("/api/admin/metrics"),
      fetch("/api/admin/languages"),
    ]);
    if (usersRes.ok) {
      const users = await usersRes.json();
      setVolunteers(users.filter((u: VolunteerUser) => u.status !== "SUSPENDED" || u.volunteer));
    }
    if (trainingRes.ok) setTrainingMaterials(await trainingRes.json());
    if (metricsRes.ok) setMetrics(await metricsRes.json());
    if (langsRes.ok) setLanguages(await langsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session?.user?.role === "INSTRUCTOR") fetchAll();
  }, [session, fetchAll]);

  const setClearance = async (userId: string, isCleared: boolean) => {
    setActionLoading(`clearance-${userId}`);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isCleared }),
    });
    if (res.ok) await fetchAll();
    setActionLoading(null);
  };

  const submitTraining = async () => {
    setTrainingFormError("");
    setTrainingSubmitting(true);
    try {
      let url = trainingForm.url;
      let fileName: string | null = null;

      if (trainingForm.type === "FILE") {
        if (!trainingFile) {
          setTrainingFormError("Please select a file.");
          setTrainingSubmitting(false);
          return;
        }
        const fd = new FormData();
        fd.append("file", trainingFile);
        const uploadRes = await fetch("/api/training/upload", { method: "POST", body: fd });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          setTrainingFormError(err.error ?? "File upload failed.");
          setTrainingSubmitting(false);
          return;
        }
        const uploadData = await uploadRes.json();
        url = uploadData.url;
        fileName = uploadData.fileName;
      }

      const res = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trainingForm.title,
          description: trainingForm.description || null,
          type: trainingForm.type,
          url,
          fileName,
          languageCode: trainingForm.languageCode || null,
          category: trainingForm.category || "General",
        }),
      });
      if (res.ok) {
        const material = await res.json();
        setTrainingMaterials((prev) => [material, ...prev]);
        setTrainingForm({ title: "", description: "", type: "LINK", url: "", languageCode: "", category: "General" });
        setTrainingFile(null);
        setShowTrainingForm(false);
      } else {
        const err = await res.json().catch(() => ({}));
        setTrainingFormError(err.error ?? "Could not add material.");
      }
    } finally {
      setTrainingSubmitting(false);
    }
  };

  const deleteTraining = async (id: string) => {
    if (!confirm("Delete this training material?")) return;
    const res = await fetch(`/api/training/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTrainingMaterials((prev) => prev.filter((m) => m.id !== id));
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-stone-400">Loading...</p>
      </div>
    );
  }

  const volunteerList = volunteers.filter((u) => u.volunteer !== null);

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold text-stone-800 tracking-tight">Georgetown Medical Interpreters</h1>
              <p className="text-xs text-stone-400">Instructor Dashboard</p>
            </div>
            <a
              href="mailto:georgetownmedicalinterpreters@gmail.com"
              className="text-sm px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors"
            >
              Contact Us
            </a>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-500">{session?.user?.email}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
              Instructor
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-6 pt-6">
        <div className="flex gap-1 bg-stone-200/50 p-1 rounded-lg w-fit">
          {[
            { key: "training" as Tab, label: "Training" },
            { key: "volunteers" as Tab, label: "Volunteers" },
            { key: "metrics" as Tab, label: "Metrics" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                tab === t.key
                  ? "bg-white text-stone-800 shadow-sm font-medium"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* Training Tab */}
        {tab === "training" && (
          <div className="space-y-5">
            <div className="flex justify-end">
              <button
                onClick={() => setShowTrainingForm(!showTrainingForm)}
                className="px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors"
              >
                {showTrainingForm ? "Cancel" : "+ Add Material"}
              </button>
            </div>

            {showTrainingForm && (
              <div className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
                <h3 className="text-sm font-medium text-stone-700">New Training Material</h3>
                <input
                  placeholder="Title"
                  value={trainingForm.title}
                  onChange={(e) => setTrainingForm({ ...trainingForm, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
                <textarea
                  placeholder="Description (optional)"
                  value={trainingForm.description}
                  onChange={(e) => setTrainingForm({ ...trainingForm, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none"
                />
                <div className="flex gap-2">
                  {(["LINK", "FILE"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTrainingForm({ ...trainingForm, type: t })}
                      className={`flex-1 py-2 text-sm rounded-md border transition-colors ${
                        trainingForm.type === t
                          ? "bg-stone-800 text-white border-stone-800"
                          : "border-stone-200 text-stone-600 hover:border-stone-400"
                      }`}
                    >
                      {t === "LINK" ? "Link" : "File Upload"}
                    </button>
                  ))}
                </div>
                {trainingForm.type === "LINK" ? (
                  <input
                    placeholder="URL (https://...)"
                    value={trainingForm.url}
                    onChange={(e) => setTrainingForm({ ...trainingForm, url: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                ) : (
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.pptx,.mp4,.mov"
                    onChange={(e) => setTrainingFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-stone-600"
                  />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Language</label>
                    <select
                      value={trainingForm.languageCode}
                      onChange={(e) => setTrainingForm({ ...trainingForm, languageCode: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none bg-white"
                    >
                      <option value="">All Languages</option>
                      {languages.filter((l) => l.isActive).map((l) => (
                        <option key={l.code} value={l.code}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-stone-500 mb-1 block">Category</label>
                    <input
                      placeholder="General"
                      value={trainingForm.category}
                      list="instructor-training-categories"
                      onChange={(e) => setTrainingForm({ ...trainingForm, category: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                    />
                    <datalist id="instructor-training-categories">
                      {["General", "Medical Terminology", "Ethics", "Language-Specific", "Administrative"].map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                </div>
                {trainingFormError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{trainingFormError}</p>
                )}
                <button
                  disabled={trainingSubmitting || !trainingForm.title || (trainingForm.type === "LINK" && !trainingForm.url)}
                  onClick={submitTraining}
                  className="px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors disabled:opacity-50"
                >
                  {trainingSubmitting ? "Saving..." : "Add Material"}
                </button>
              </div>
            )}

            {trainingMaterials.length === 0 ? (
              <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
                <p className="text-stone-400">No training materials yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {trainingMaterials.map((m) => (
                  <div key={m.id} className="bg-white rounded-xl border border-stone-200 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-stone-800 text-sm">{m.title}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">{m.category}</span>
                          {m.languageCode && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{m.languageCode}</span>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded ${m.type === "FILE" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                            {m.type}
                          </span>
                        </div>
                        {m.description && <p className="text-xs text-stone-500 mb-2">{m.description}</p>}
                        {m.type === "FILE" ? (
                          <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-xs text-stone-600 hover:text-stone-800 underline">
                            {m.fileName ?? "Download"}
                          </a>
                        ) : (
                          <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 underline break-all">
                            {m.url}
                          </a>
                        )}
                        <p className="text-xs text-stone-400 mt-2">
                          by {m.uploadedBy.name ?? m.uploadedBy.email} · {new Date(m.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      {session?.user?.email === m.uploadedBy.email && (
                        <button
                          onClick={() => deleteTraining(m.id)}
                          className="shrink-0 text-xs px-2 py-1 bg-red-50 text-red-500 hover:bg-red-100 rounded transition-colors"
                          title="Delete"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Volunteers Tab */}
        {tab === "volunteers" && (
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            {volunteerList.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-stone-400">No volunteers yet.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-100">
                    <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Name</th>
                    <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Email</th>
                    <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Languages</th>
                    <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Hours</th>
                    <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Clearance</th>
                  </tr>
                </thead>
                <tbody>
                  {volunteerList.map((user) => (
                    <tr key={user.id} className="border-b border-stone-50 last:border-0">
                      <td className="px-5 py-3.5 text-sm text-stone-800">{user.name ?? "—"}</td>
                      <td className="px-5 py-3.5 text-sm text-stone-500">{user.email}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-1 flex-wrap">
                          {user.volunteer?.languages?.map((lang) => (
                            <span key={lang} className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">{lang}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-stone-600">{user.volunteer?.hoursVolunteered ?? 0}h</td>
                      <td className="px-5 py-3.5">
                        {user.volunteer && (
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              user.volunteer.isCleared ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                            }`}>
                              {user.volunteer.isCleared ? "Cleared" : "Not Cleared"}
                            </span>
                            <button
                              disabled={actionLoading === `clearance-${user.id}`}
                              onClick={() => setClearance(user.id, !user.volunteer!.isCleared)}
                              className={`text-xs px-2 py-0.5 rounded transition-colors disabled:opacity-50 ${
                                user.volunteer.isCleared
                                  ? "bg-red-50 text-red-600 hover:bg-red-100"
                                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              }`}
                            >
                              {actionLoading === `clearance-${user.id}` ? "..." : user.volunteer.isCleared ? "Revoke" : "Mark Cleared"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Metrics Tab */}
        {tab === "metrics" && (
          <div className="space-y-6">
            {!metrics ? (
              <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
                <p className="text-stone-400">Loading metrics...</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border border-stone-200 p-5 text-center">
                    <p className="text-3xl font-semibold text-stone-800">{metrics.totalHours}</p>
                    <p className="text-xs text-stone-400 mt-1">Total Hours</p>
                  </div>
                  <div className="bg-white rounded-xl border border-stone-200 p-5 text-center">
                    <p className="text-3xl font-semibold text-stone-800">{metrics.volunteerCount}</p>
                    <p className="text-xs text-stone-400 mt-1">Active Volunteers</p>
                  </div>
                  <div className="bg-white rounded-xl border border-stone-200 p-5 text-center">
                    <p className="text-3xl font-semibold text-stone-800">{metrics.activeSlotCount}</p>
                    <p className="text-xs text-stone-400 mt-1">Active Slots</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-stone-200 p-5">
                    <h3 className="text-sm font-medium text-stone-700 mb-3">Hours by Language</h3>
                    {metrics.hoursByLanguage.length === 0 ? (
                      <p className="text-xs text-stone-400">No data yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {metrics.hoursByLanguage.map((item) => (
                          <div key={item.code} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-semibold px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded">{item.code}</span>
                              <span className="text-sm text-stone-700">{item.name}</span>
                            </div>
                            <span className="text-sm font-medium text-stone-800">{item.hours}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-stone-200 p-5">
                    <h3 className="text-sm font-medium text-stone-700 mb-3">Hours by Clinic</h3>
                    {metrics.hoursByClinic.length === 0 ? (
                      <p className="text-xs text-stone-400">No data yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {metrics.hoursByClinic.map((item) => (
                          <div key={item.clinicId} className="flex items-center justify-between">
                            <span className="text-sm text-stone-700">{item.clinicName}</span>
                            <span className="text-sm font-medium text-stone-800">{item.hours}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-xs text-stone-400 text-center">Graphs coming soon</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
