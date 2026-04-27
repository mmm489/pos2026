"use client";

import { useEffect, useState } from "react";
import { Product, Category } from "@/types/pos";
import { MOCK_CATEGORIES } from "@/lib/mock-data";

interface ProductForm {
  name: string;
  category_id: number;
  price: string;
  vat_rate: string;
  active: boolean;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  category_id: 0,
  price: "",
  vat_rate: "10",
  active: true,
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [prodsRes, catsRes] = await Promise.all([
        fetch("/api/pos/products?all=true"),
        fetch("/api/pos/categories"),
      ]);

      if (prodsRes.ok && catsRes.ok) {
        setProducts(await prodsRes.json());
        setCategories(await catsRes.json());
      } else {
        // Fallback demo
        setCategories(MOCK_CATEGORIES);
        setProducts([]);
      }
    } catch {
      setCategories(MOCK_CATEGORIES);
      setProducts([]);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.category_id || !form.price) {
      setMessage("Rellena nombre, categoria y precio");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const body = {
        name: form.name,
        category_id: form.category_id,
        price: parseFloat(form.price),
        active: form.active,
      };

      let res;
      if (editingId) {
        res = await fetch(`/api/pos/products/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/pos/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (res.ok) {
        setMessage(editingId ? "Producto actualizado" : "Producto creado");
        setForm(EMPTY_FORM);
        setEditingId(null);
        setShowForm(false);
        await loadData();
      } else {
        const data = await res.json();
        setMessage(data.error || "Error al guardar");
      }
    } catch {
      setMessage("Error de conexion. Asegurate de tener la base de datos configurada.");
    }
    setSaving(false);
  };

  const handleEdit = (product: Product) => {
    setForm({
      name: product.name,
      category_id: product.category_id,
      price: String(product.price),
      vat_rate: String(product.vat_rate || 10),
      active: product.active,
    });
    setEditingId(product.id);
    setShowForm(true);
    setMessage("");
  };

  const handleToggleActive = async (product: Product) => {
    try {
      const res = await fetch(`/api/pos/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !product.active }),
      });
      if (res.ok) await loadData();
    } catch {
      setMessage("Error al cambiar estado");
    }
  };

  const handleNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
    setMessage("");
  };

  const handleCancel = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setMessage("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <p className="text-gray-400 text-xl">Cargando...</p>
      </div>
    );
  }

  const grouped = categories.map((cat) => ({
    ...cat,
    products: products.filter((p) => p.category_id === cat.id),
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Gestionar productos</h1>
          <p className="text-sm text-gray-500">
            {products.length} productos &middot;{" "}
            {products.filter((p) => p.active).length} activos
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href="/pos"
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium transition-colors"
          >
            Volver al POS
          </a>
          <a
            href="/admin/orders"
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium transition-colors"
          >
            Comandes
          </a>
          <a
            href="/admin/employees"
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium transition-colors"
          >
            Empleats
          </a>
          <a
            href="/admin/closings"
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium transition-colors"
          >
            Tancaments
          </a>
          <button
            onClick={handleNew}
            className="px-4 py-2 rounded-lg bg-pink-500 text-white hover:bg-pink-600 text-sm font-bold transition-colors"
          >
            + Nuevo producto
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        {/* Message */}
        {message && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm font-medium ${
              message.includes("Error") || message.includes("Rellena")
                ? "bg-red-50 text-red-700"
                : "bg-green-50 text-green-700"
            }`}
          >
            {message}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6"
          >
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              {editingId ? "Editar producto" : "Nuevo producto"}
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Tarrina Grande (3 bolas)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Categoria
                </label>
                <select
                  value={form.category_id}
                  onChange={(e) =>
                    setForm({ ...form, category_id: parseInt(e.target.value) })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                >
                  <option value={0}>Selecciona...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Precio PVP (IVA incluido)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 pr-10"
                  />
                  <span className="absolute right-3 top-2 text-gray-400 text-sm">
                    &euro;
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  IVA (%)
                </label>
                <select
                  value={form.vat_rate}
                  onChange={(e) =>
                    setForm({ ...form, vat_rate: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                >
                  <option value="10">10% (Reducido — alimentacion)</option>
                  <option value="21">21% (General)</option>
                  <option value="4">4% (Superreducido)</option>
                  <option value="0">0% (Exento)</option>
                </select>
              </div>
            </div>

            {/* Price breakdown */}
            {form.price && (
              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm text-gray-600">
                <span className="font-medium">Desglose:</span>{" "}
                PVP {parseFloat(form.price).toFixed(2)}€ = Base{" "}
                {(
                  parseFloat(form.price) /
                  (1 + parseFloat(form.vat_rate) / 100)
                ).toFixed(2)}
                € + IVA{" "}
                {(
                  parseFloat(form.price) -
                  parseFloat(form.price) /
                    (1 + parseFloat(form.vat_rate) / 100)
                ).toFixed(2)}
                €
              </div>
            )}

            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                id="active"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="active" className="text-sm text-gray-700">
                Producto activo (visible en el POS)
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 rounded-lg bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300 text-white font-bold text-sm transition-colors"
              >
                {saving
                  ? "Guardando..."
                  : editingId
                  ? "Guardar cambios"
                  : "Crear producto"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Product list by category */}
        {grouped.map((cat) => (
          <div key={cat.id} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
              <h3 className="text-lg font-bold text-gray-700">{cat.name}</h3>
              <span className="text-sm text-gray-400">
                ({cat.products.length})
              </span>
            </div>

            {cat.products.length === 0 ? (
              <p className="text-sm text-gray-400 ml-5">
                Sin productos en esta categoria
              </p>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {cat.products.map((product, i) => (
                  <div
                    key={product.id}
                    className={`flex items-center justify-between px-5 py-3 ${
                      i > 0 ? "border-t border-gray-100" : ""
                    } ${!product.active ? "opacity-50" : ""}`}
                  >
                    <div className="flex-1">
                      <span className="font-medium text-gray-800">
                        {product.name}
                      </span>
                      {!product.active && (
                        <span className="ml-2 text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded">
                          Inactivo
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="font-bold text-gray-700 w-20 text-right">
                        {Number(product.price).toFixed(2)} &euro;
                      </span>

                      <button
                        onClick={() => handleEdit(product)}
                        className="px-3 py-1 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 transition-colors"
                      >
                        Editar
                      </button>

                      <button
                        onClick={() => handleToggleActive(product)}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                          product.active
                            ? "bg-red-50 text-red-600 hover:bg-red-100"
                            : "bg-green-50 text-green-600 hover:bg-green-100"
                        }`}
                      >
                        {product.active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {products.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-xl mb-2">Sin productos</p>
            <p className="text-sm">
              Necesitas la base de datos configurada para gestionar productos.
            </p>
            <p className="text-sm">
              Mientras tanto puedes editar directamente{" "}
              <code className="bg-gray-100 px-1 rounded">scripts/migrate.sql</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
