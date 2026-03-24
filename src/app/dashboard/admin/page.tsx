"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

type VolunteerStats = {
  languages: string[];
  hoursVolunteered: number;
  cancellationsWithin24h: number;
  cancellationsWithin2h: number;
  noShows: number;
};

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  clinicId: string | null;
  createdAt: string;
  clinic?: { name: string } | null;
  volunteer?: VolunteerStats | null;
};

type Clinic = {
  id: string;
  name: string;
  address: string;
  contactName: string;
  contactEmail: string;
  loginToken: string;
  _count?: { staff: number; slots: number };
};

type Tab = "pending" | "users" | "clinics";

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pending");
  const [users, setUsers] = useState<User[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showClinicForm, setShowClinicForm] = useState(false);
  const [clinicForm, setClinicForm] = useState({ name: "", address: "", contactName: "", contactEmail: "" });
  const [clinicFormError, setClinicFormError] = useState("");
  const [assignModal, setAssignModal] = useState<{ userId: string; userName: string } | null>(null);
  const [pinReveal, setPinReveal] = useState<{ clinicName: string; pin: string } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session?.user?.role && session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") router.push("/dashboard");
  }, [status, session, router]);

  const fetchData = useCallback(async () => {
    const [usersRes, clinicsRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/clinics"),
    ]);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (clinicsRes.ok) setClinics(await clinicsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN") {
      fetchData();
    }
  }, [session, fetchData]);

  const updateUser = async (userId: string, data: Record<string, string | null>) => {
    setActionLoading(userId);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...data }),
    });
    if (res.ok) await fetchData();
    setActionLoading(null);
  };

  const createClinic = async () => {
    setActionLoading("clinic-form");
    setClinicFormError("");
    const res = await fetch("/api/admin/clinics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clinicForm),
    });
    if (res.ok) {
      const data = await res.json();
      await fetchData();
      setClinicForm({ name: "", address: "", contactName: "", contactEmail: "" });
      setClinicFormError("");
      setShowClinicForm(false);
      setPinReveal({ clinicName: data.name, pin: data.plainPin });
    } else {
      const data = await res.json().catch(() => ({}));
      setClinicFormError(data.error ?? `Error ${res.status} — please try again.`);
    }
    setActionLoading(null);
  };

  const regeneratePin = async (clinicId: string, clinicName: string) => {
    if (!confirm("Generate a new PIN for this clinic? The old PIN will stop working immediately.")) return;
    setActionLoading(`pin-${clinicId}`);
    const res = await fetch(`/api/admin/clinics/${clinicId}`, { method: "PATCH" });
    if (res.ok) {
      const data = await res.json();
      await fetchData();
      setPinReveal({ clinicName, pin: data.plainPin });
    }
    setActionLoading(null);
  };

  const pendingUsers = users.filter((u) => u.status === "PENDING_APPROVAL");

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-stone-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-stone-800 tracking-tight">Georgetown Medical Interpreters</h1>
            <p className="text-xs text-stone-400">Admin Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-500">{session?.user?.email}</span>
            {session?.user?.role === "SUPER_ADMIN" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                Super Admin
              </span>
            )}
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
            { key: "pending" as Tab, label: "Pending", count: pendingUsers.length },
            { key: "users" as Tab, label: "All Users", count: users.length },
            { key: "clinics" as Tab, label: "Clinics", count: clinics.length },
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
              {t.count > 0 && (
                <span
                  className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                    t.key === "pending" && t.count > 0
                      ? "bg-amber-100 text-amber-700"
                      : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Pending Approvals */}
        {tab === "pending" && (
          <div>
            {pendingUsers.length === 0 ? (
              <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
                <p className="text-stone-400">No pending approvals</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingUsers.map((user) => (
                  <div key={user.id} className="bg-white rounded-xl border border-stone-200 p-5 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-stone-800">{user.name}</p>
                      <p className="text-sm text-stone-500">{user.email}</p>
                      <p className="text-xs text-stone-400 mt-1">
                        Applied {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={actionLoading === user.id}
                        onClick={() => updateUser(user.id, { status: "ACTIVE", role: "VOLUNTEER" })}
                        className="px-4 py-2 text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md transition-colors disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        disabled={actionLoading === user.id}
                        onClick={() => updateUser(user.id, { status: "SUSPENDED" })}
                        className="px-4 py-2 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-md transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* All Users */}
        {tab === "users" && (
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Email</th>
                  <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Role</th>
                  <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Clinic</th>
                  <th className="text-left text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Volunteer Stats</th>
                  <th className="text-right text-xs font-medium text-stone-400 uppercase tracking-wider px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-stone-50 last:border-0">
                    <td className="px-5 py-3.5 text-sm text-stone-800">{user.name}</td>
                    <td className="px-5 py-3.5 text-sm text-stone-500">{user.email}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        user.role === "SUPER_ADMIN" ? "bg-violet-100 text-violet-800" :
                        user.role === "ADMIN" ? "bg-violet-50 text-violet-700" :
                        user.role === "CLINIC" ? "bg-blue-50 text-blue-700" :
                        user.role === "VOLUNTEER" ? "bg-emerald-50 text-emerald-700" :
                        "bg-stone-100 text-stone-500"
                      }`}>
                        {user.role === "SUPER_ADMIN" ? "Super Admin" : user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        user.status === "ACTIVE" ? "bg-green-50 text-green-700" :
                        user.status === "SUSPENDED" ? "bg-red-50 text-red-600" :
                        "bg-amber-50 text-amber-700"
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-stone-500">{user.clinic?.name || "—"}</td>
                    <td className="px-5 py-3.5">
                      {user.volunteer ? (
                        <div className="flex gap-3 text-xs text-stone-500">
                          <span title="Hours volunteered">⏱ {user.volunteer.hoursVolunteered}h</span>
                          <span title="No-shows" className={user.volunteer.noShows > 0 ? "text-red-500" : ""}>
                            NS {user.volunteer.noShows}
                          </span>
                          <span title="Cancellations within 24 hours" className={user.volunteer.cancellationsWithin24h > 0 ? "text-amber-600" : ""}>
                            24h {user.volunteer.cancellationsWithin24h}
                          </span>
                          <span title="Cancellations within 2 hours" className={user.volunteer.cancellationsWithin2h > 0 ? "text-red-500" : ""}>
                            2h {user.volunteer.cancellationsWithin2h}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-stone-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex gap-1 justify-end">
                        {user.role !== "SUPER_ADMIN" && (user.role !== "ADMIN" || session?.user?.role === "SUPER_ADMIN") && (
                          <>
                            <select
                              className="text-xs border border-stone-200 rounded px-2 py-1 text-stone-600"
                              value={user.role}
                              onChange={(e) => updateUser(user.id, { role: e.target.value })}
                            >
                              <option value="VOLUNTEER">Volunteer</option>
                              <option value="CLINIC">Clinic</option>
                              {session?.user?.role === "SUPER_ADMIN" && (
                                <option value="ADMIN">Admin</option>
                              )}
                            </select>
                            {user.role === "CLINIC" && (
                              <button
                                onClick={() => setAssignModal({ userId: user.id, userName: user.name })}
                                className="text-xs px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                              >
                                Assign Clinic
                              </button>
                            )}
                            {user.status === "ACTIVE" ? (
                              <button
                                onClick={() => updateUser(user.id, { status: "SUSPENDED" })}
                                className="text-xs px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors"
                              >
                                Suspend
                              </button>
                            ) : (
                              <button
                                onClick={() => updateUser(user.id, { status: "ACTIVE" })}
                                className="text-xs px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded transition-colors"
                              >
                                Activate
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Clinics */}
        {tab === "clinics" && (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowClinicForm(!showClinicForm)}
                className="px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors"
              >
                {showClinicForm ? "Cancel" : "+ Add Clinic"}
              </button>
            </div>

            {showClinicForm && (
              <div className="bg-white rounded-xl border border-stone-200 p-6 mb-4">
                <h3 className="text-sm font-medium text-stone-700 mb-4">New Clinic</h3>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    placeholder="Clinic Name"
                    value={clinicForm.name}
                    onChange={(e) => setClinicForm({ ...clinicForm, name: e.target.value })}
                    className="px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                  <input
                    placeholder="Address"
                    value={clinicForm.address}
                    onChange={(e) => setClinicForm({ ...clinicForm, address: e.target.value })}
                    className="px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                  <input
                    placeholder="Contact Name"
                    value={clinicForm.contactName}
                    onChange={(e) => setClinicForm({ ...clinicForm, contactName: e.target.value })}
                    className="px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                  <input
                    placeholder="Contact Email"
                    value={clinicForm.contactEmail}
                    onChange={(e) => setClinicForm({ ...clinicForm, contactEmail: e.target.value })}
                    className="px-3 py-2 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                </div>
                {clinicFormError && (
                  <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                    {clinicFormError}
                  </p>
                )}
                <button
                  disabled={actionLoading === "clinic-form" || !clinicForm.name || !clinicForm.contactEmail}
                  onClick={createClinic}
                  className="mt-4 px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-md transition-colors disabled:opacity-50"
                >
                  {actionLoading === "clinic-form" ? "Creating..." : "Create Clinic"}
                </button>
              </div>
            )}

            {clinics.length === 0 && !showClinicForm ? (
              <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
                <p className="text-stone-400">No clinics yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {clinics.map((clinic) => (
                  <div key={clinic.id} className="bg-white rounded-xl border border-stone-200 p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium text-stone-800">{clinic.name}</h3>
                        <p className="text-sm text-stone-500 mt-0.5">{clinic.address}</p>
                        <p className="text-xs text-stone-400 mt-1">{clinic.contactName} · {clinic.contactEmail}</p>
                        {/* Login credentials */}
                        <div className="mt-3 flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-md px-2 py-1">
                            <span className="text-xs text-stone-400">PIN</span>
                            <span className="text-xs font-mono font-semibold text-stone-400 tracking-widest">
                              ••••••
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/clinic-login/${clinic.loginToken}`;
                              navigator.clipboard.writeText(url);
                            }}
                            className="text-xs px-2 py-1 bg-stone-50 border border-stone-200 hover:bg-stone-100 text-stone-600 rounded-md transition-colors"
                          >
                            Copy Login URL
                          </button>
                          <button
                            disabled={actionLoading === `pin-${clinic.id}`}
                            onClick={() => regeneratePin(clinic.id, clinic.name)}
                            className="text-xs px-2 py-1 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 rounded-md transition-colors disabled:opacity-50"
                          >
                            Regenerate PIN
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-stone-400">{clinic._count?.slots || 0} slots</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* PIN Reveal Modal — shown once after create or regenerate */}
      {pinReveal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-sm font-semibold text-stone-800 mb-1">New PIN for {pinReveal.clinicName}</h3>
            <p className="text-xs text-stone-400 mb-4">
              Copy this PIN now — it cannot be shown again. Share it with the clinic directly.
            </p>
            <div className="flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 mb-4">
              <span className="text-2xl font-mono font-bold tracking-[0.3em] text-stone-800">
                {pinReveal.pin}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(pinReveal.pin)}
                className="ml-auto text-xs px-2 py-1 bg-stone-200 hover:bg-stone-300 text-stone-600 rounded transition-colors"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => setPinReveal(null)}
              className="w-full px-4 py-2 text-sm bg-stone-800 text-white hover:bg-stone-700 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Assign Clinic Modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-sm font-medium text-stone-700 mb-3">
              Assign {assignModal.userName} to a clinic
            </h3>
            <div className="space-y-2">
              {clinics.map((clinic) => (
                <button
                  key={clinic.id}
                  onClick={async () => {
                    await updateUser(assignModal.userId, { clinicId: clinic.id });
                    setAssignModal(null);
                  }}
                  className="w-full text-left px-3 py-2 text-sm border border-stone-200 rounded-md hover:bg-stone-50 transition-colors"
                >
                  {clinic.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAssignModal(null)}
              className="mt-4 text-xs text-stone-400 hover:text-stone-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
