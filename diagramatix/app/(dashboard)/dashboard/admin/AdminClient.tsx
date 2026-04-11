"use client";

import { useRouter } from "next/navigation";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  _count: { projects: number; diagrams: number };
}

interface Props {
  users: UserRow[];
  currentUserId: string;
}

export function AdminClient({ users, currentUserId }: Props) {
  const router = useRouter();

  async function handleViewAs(userId: string) {
    await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    // Hard navigation so server sees the new impersonation cookie
    window.location.href = "/dashboard";
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            {"\u2190"} Dashboard
          </button>
          <h1 className="font-semibold text-gray-900">Admin — Registered Users</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard/admin/database"
            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1"
          >
            Database Access
          </a>
          <a
            href="/dashboard/admin/archive"
            className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1"
          >
            System Archive
          </a>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <table className="w-full bg-white rounded-lg border border-gray-200 overflow-hidden">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3 text-center">Projects</th>
              <th className="px-4 py-3 text-center">Diagrams</th>
              <th className="px-4 py-3">Registered</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                  {u.name || <span className="text-gray-400 italic">No name</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                <td className="px-4 py-3 text-sm text-gray-600 text-center">{u._count.projects}</td>
                <td className="px-4 py-3 text-sm text-gray-600 text-center">{u._count.diagrams}</td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id === currentUserId ? (
                    <span className="text-xs text-gray-400">You</span>
                  ) : (
                    <button
                      onClick={() => handleViewAs(u.id)}
                      className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-300 rounded px-2 py-1 hover:bg-orange-50"
                    >
                      View as
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-4">{users.length} registered user(s)</p>
      </div>
    </div>
  );
}
