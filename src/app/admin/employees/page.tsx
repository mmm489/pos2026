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
      <div className="flex h-screen items-center justify-center bg-[#f5f4ef]">
        <p className="text-xl font-medium text-[#7b7469]">Carregant empleats...</p>
      </div>
    );
  }

  const activeCount = employees.filter((e) => e.active).length;

  return (
    <div className="min-h-screen bg-[#f5f4ef] text-[#241f1c]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#ddd4c4] bg-[#faf9f6] px-6 py-4">
        <div>
          <h1 className="text-3xl font-medium text-[#241f1c]">Empleats</h1>
          <p className="text-sm font-medium text-[#7b7469]">
            {activeCount} actius &middot; {employees.length} total
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <a
            href="/pos"
            className="rounded-xl border border-[#d4cbbb] bg-white px-4 py-2 text-sm font-medium text-[#5f6878] active:bg-[#f1eee7]"
          >
            Tornar al POS
          </a>
          <a
            href="/admin/orders"
            className="rounded-xl border border-[#d4cbbb] bg-white px-4 py-2 text-sm font-medium text-[#5f6878] active:bg-[#f1eee7]"
          >
            Comandes
          </a>
          <a
            href="/admin/products"
            className="rounded-xl border border-[#d4cbbb] bg-white px-4 py-2 text-sm font-medium text-[#5f6878] active:bg-[#f1eee7]"
          >
            Productes
          </a>
          <a
            href="/admin/closings"
            className="rounded-xl border border-[#d4cbbb] bg-white px-4 py-2 text-sm font-medium text-[#5f6878] active:bg-[#f1eee7]"
          >
            Tancaments
          </a>
          <button
            onClick={handleNew}
            className="rounded-xl bg-[#2e9e5b] px-4 py-2 text-sm font-semibold text-white active:bg-[#27874e]"
          >
            + Nou empleat
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {/* Message */}
        {message && (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
              message.type === "success"
                ? "border-[#b8dec2] bg-[#dff5e6] text-[#1e6b3a]"
                : "border-[#f0bdb4] bg-[#fdeceb] text-[#c4423a]"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 rounded-2xl border border-[#ddd4c4] bg-[#faf9f6] p-5"
          >
            <h3 className="mb-4 text-xl font-medium text-[#241f1c]">
              {editingId ? "Editar empleat" : "Nou empleat"}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#6f665c]">
                  Nom *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-xl border border-[#d4cbbb] bg-white px-3 py-2 text-sm text-[#241f1c] outline-none focus:border-[#2e9e5b] focus:ring-2 focus:ring-[#2e9e5b]/15"
                  placeholder="Ex. Maria Garcia"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[#6f665c]">
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
                  className="w-full rounded-xl border border-[#d4cbbb] bg-white px-3 py-2 text-sm tracking-widest text-[#241f1c] outline-none focus:border-[#2e9e5b] focus:ring-2 focus:ring-[#2e9e5b]/15"
                  placeholder="1234"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[#6f665c]">
                  Rol *
                </label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value as "admin" | "employee" })
                  }
                  className="w-full rounded-xl border border-[#d4cbbb] bg-white px-3 py-2 text-sm text-[#241f1c] outline-none focus:border-[#2e9e5b] focus:ring-2 focus:ring-[#2e9e5b]/15"
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
                className="rounded-xl border border-[#d4cbbb] bg-white px-4 py-2 text-sm font-medium text-[#6f665c] active:bg-[#f1eee7]"
              >
                Cancel·lar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#2e9e5b] px-5 py-2 text-sm font-semibold text-white active:bg-[#27874e]"
              >
                {editingId ? "Desar canvis" : "Crear"}
              </button>
            </div>
          </form>
        )}

        {/* List */}
        {employees.length === 0 ? (
          <div className="py-12 text-center text-[#7b7469]">
            <p className="text-xl font-medium">Cap empleat</p>
            <p className="mt-1 text-sm">Crea el primer empleat per començar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className={`flex items-center justify-between rounded-2xl border border-[#ddd4c4] bg-white px-5 py-3 ${
                  !emp.active ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#dff5e6] font-semibold text-[#1e6b3a]">
                    {emp.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-[#241f1c]">{emp.name}</p>
                    <p className="text-xs text-[#8a8276]">PIN: {emp.pin}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      emp.role === "admin"
                        ? "bg-[#efe5ff] text-[#6e4ca5]"
                        : "bg-[#f1eee7] text-[#6f665c]"
                    }`}
                  >
                    {emp.role === "admin" ? "Admin" : "Empleat"}
                  </span>
                  {!emp.active && (
                    <span className="rounded-full bg-[#fdeceb] px-2 py-0.5 text-xs font-medium text-[#c4423a]">
                      Inactiu
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(emp)}
                    className="rounded-xl border border-[#bfd5ee] bg-[#e4f0fb] px-3 py-1.5 text-sm font-medium text-[#275a8f] active:bg-[#d4e7f8]"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleToggleActive(emp)}
                    className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
                      emp.active
                        ? "bg-[#fdeceb] text-[#c4423a] active:bg-[#fad6d3]"
                        : "bg-[#dff5e6] text-[#1e6b3a] active:bg-[#cfecd8]"
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
