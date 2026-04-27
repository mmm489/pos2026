"use client";

import { useEffect, useState } from "react";
import { Employee } from "@/types/pos";

interface EmployeeForm {
  name: string;
  pin: string;
  role: "admin" | "employee";
}

const EMPTY_FORM: EmployeeForm = {
  name: "",
  pin: "",
  role: "employee",
};

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const res = await fetch("/api/pos/employees");
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch {
      // API not available
    }
    setLoading(false);
  };

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const handleEdit = (emp: Employee) => {
    setForm({ name: emp.name, pin: emp.pin, role: emp.role });
    setEditingId(emp.id);
    setShowForm(true);
  };

  const handleCancel = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      showMessage("error", "El nom és obligatori");
      return;
    }
    if (!/^\d{4}$/.test(form.pin)) {
      showMessage("error", "El PIN ha de ser de 4 dígits numèrics");
      return;
    }

    try {
      const url = editingId ? `/api/pos/employees/${editingId}` : "/api/pos/employees";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        showMessage("success", editingId ? "Empleat actualitzat" : "Empleat creat");
        handleCancel();
        loadEmployees();
      } else {
        const err = await res.json();
        showMessage("error", err.error || "Error al desar");
      }
    } catch {
      showMessage("error", "Error de connexió");
    }
  };

  const handleToggleActive = async (emp: Employee) => {
    try {
      const res = await fetch(`/api/pos/employees/${emp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !emp.active }),
      });
      if (res.ok) {
        showMessage("success", emp.active ? "Empleat desactivat" : "Empleat activat");
        loadEmployees();
      }
    } catch {
      showMessage("error", "Error al canviar estat");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <p className="text-gray-400 text-xl">Carregant empleats...</p>
      </div>
    );
  }

  const activeCount = employees.filter((e) => e.active).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Empleats</h1>
          <p className="text-sm text-gray-500">
            {activeCount} actius &middot; {employees.length} total
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href="/pos"
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium"
          >
            Tornar al POS
          </a>
          <a
            href="/admin/orders"
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium"
          >
            Comandes
          </a>
          <a
            href="/admin/products"
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium"
          >
            Productes
          </a>
          <a
            href="/admin/closings"
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium"
          >
            Tancaments
          </a>
          <button
            onClick={handleNew}
            className="px-4 py-2 rounded-lg bg-pink-500 text-white hover:bg-pink-600 text-sm font-semibold"
          >
            + Nou empleat
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {/* Message */}
        {message && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
              message.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 bg-white rounded-xl border border-gray-200 p-5"
          >
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              {editingId ? "Editar empleat" : "Nou empleat"}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                  placeholder="Ex. Maria Garcia"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PIN (4 dígits) *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  value={form.pin}
                  onChange={(e) =>
                    setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-pink-400"
                  placeholder="1234"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rol *
                </label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value as "admin" | "employee" })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                >
                  <option value="employee">Empleat</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium"
              >
                Cancel·lar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-pink-500 text-white hover:bg-pink-600 text-sm font-semibold"
              >
                {editingId ? "Desar canvis" : "Crear"}
              </button>
            </div>
          </form>
        )}

        {/* List */}
        {employees.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-xl">Cap empleat</p>
            <p className="text-sm mt-1">Crea el primer empleat per començar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className={`bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center justify-between ${
                  !emp.active ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 font-bold">
                    {emp.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{emp.name}</p>
                    <p className="text-xs text-gray-400">PIN: {emp.pin}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      emp.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {emp.role === "admin" ? "Admin" : "Empleat"}
                  </span>
                  {!emp.active && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                      Inactiu
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(emp)}
                    className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-sm font-medium"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleToggleActive(emp)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      emp.active
                        ? "bg-red-50 text-red-600 hover:bg-red-100"
                        : "bg-green-50 text-green-600 hover:bg-green-100"
                    }`}
                  >
                    {emp.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
