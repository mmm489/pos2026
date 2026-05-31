"use client";

import { useEffect, useState } from "react";
import { Product, Category, ModifierGroup } from "@/types/pos";
import { MOCK_CATEGORIES } from "@/lib/mock-data";

interface ProductForm {
  name: string;
  category_id: number;
  price: string;
  vat_rate: string;
  modifier_group_id: string;
  active: boolean;
}

interface ModifierGroupForm {
  name: string;
  category_ids: number[];
  active: boolean;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  category_id: 0,
  price: "",
  vat_rate: "10",
  modifier_group_id: "",
  active: true,
};

const EMPTY_GROUP_FORM: ModifierGroupForm = {
  name: "",
  category_ids: [],
  active: true,
};

const MODIFIER_CATEGORY_KEYWORDS = ["topping", "extra", "salsa", "complement", "complemento", "sabor"];

function isModifierCategory(name: string) {
  const lower = name.toLowerCase();
  return MODIFIER_CATEGORY_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [groupForm, setGroupForm] = useState<ModifierGroupForm>(EMPTY_GROUP_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [prodsRes, catsRes, groupsRes] = await Promise.all([
        fetch("/api/pos/products?all=true"),
        fetch("/api/pos/categories"),
        fetch("/api/pos/modifier-groups?all=true"),
      ]);

      if (prodsRes.ok && catsRes.ok) {
        setProducts(await prodsRes.json());
        setCategories(await catsRes.json());
        setModifierGroups(groupsRes.ok ? await groupsRes.json() : []);
      } else {
        // Fallback demo
        setCategories(MOCK_CATEGORIES);
        setProducts([]);
        setModifierGroups([]);
      }
    } catch {
      setCategories(MOCK_CATEGORIES);
      setProducts([]);
      setModifierGroups([]);
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
        vat_rate: parseFloat(form.vat_rate),
        modifier_group_id: form.modifier_group_id ? parseInt(form.modifier_group_id) : null,
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
      modifier_group_id: product.modifier_group_id ? String(product.modifier_group_id) : "",
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

  const handleNewModifierGroup = () => {
    setGroupForm(EMPTY_GROUP_FORM);
    setEditingGroupId(null);
    setShowGroupForm(true);
    setMessage("");
  };

  const handleEditModifierGroup = (group: ModifierGroup) => {
    setGroupForm({
      name: group.name,
      category_ids: group.category_ids,
      active: group.active,
    });
    setEditingGroupId(group.id);
    setShowGroupForm(true);
    setMessage("");
  };

  const toggleGroupCategory = (categoryId: number) => {
    setGroupForm((prev) => {
      const current = new Set(prev.category_ids);
      if (current.has(categoryId)) current.delete(categoryId);
      else current.add(categoryId);
      return { ...prev, category_ids: Array.from(current) };
    });
  };

  const handleSaveModifierGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupForm.name.trim()) {
      setMessage("Rellena el nombre de la pagina de toppings");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(
        editingGroupId ? `/api/pos/modifier-groups/${editingGroupId}` : "/api/pos/modifier-groups",
        {
          method: editingGroupId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(groupForm),
        }
      );
      if (res.ok) {
        setMessage(editingGroupId ? "Pagina actualizada" : "Pagina creada");
        setGroupForm(EMPTY_GROUP_FORM);
        setEditingGroupId(null);
        setShowGroupForm(false);
        await loadData();
      } else {
        const data = await res.json();
        setMessage(data.error || "Error al guardar pagina");
      }
    } catch {
      setMessage("Error de conexion guardando la pagina de toppings");
    }
    setSaving(false);
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
  const modifierCategories = categories;
  const modifierGroupNames = new Map(modifierGroups.map((group) => [group.id, group.name]));

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
          <button
            onClick={handleNewModifierGroup}
            className="px-4 py-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 text-sm font-bold transition-colors"
          >
            + Pagina toppings
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

        {/* Modifier pages */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Paginas de toppings</h2>
              <p className="text-sm text-gray-500">
                Cada pagina agrupa categorias de extras/sabores y luego se asigna a productos concretos.
              </p>
            </div>
            <button
              onClick={handleNewModifierGroup}
              className="px-4 py-2 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-sm font-bold transition-colors"
            >
              Nueva pagina
            </button>
          </div>

          {showGroupForm && (
            <form onSubmit={handleSaveModifierGroup} className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre pagina</label>
                  <input
                    type="text"
                    value={groupForm.name}
                    onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                    placeholder="Ej: Gelats / Iogurt"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <label className="mt-7 flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={groupForm.active}
                    onChange={(e) => setGroupForm({ ...groupForm, active: e.target.checked })}
                  />
                  Activa
                </label>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-gray-700">Categorias que apareceran en esta pagina</p>
                {modifierCategories.length === 0 ? (
                  <p className="text-sm text-gray-500">Primero crea categorias para extras, salsas o sabores.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {modifierCategories.map((cat) => (
                      <label key={cat.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={groupForm.category_ids.includes(cat.id)}
                          onChange={() => toggleGroupCategory(cat.id)}
                        />
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                        {!isModifierCategory(cat.name) && (
                          <span className="ml-auto rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                            normal
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-400">
                  Consejo: usa aqui categorias creadas solo para toppings. Si una categoria se usa en una pagina de toppings, el POS la tratara como extra.
                </p>
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white font-bold text-sm transition-colors"
                >
                  {saving ? "Guardando..." : editingGroupId ? "Guardar pagina" : "Crear pagina"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowGroupForm(false);
                    setEditingGroupId(null);
                    setGroupForm(EMPTY_GROUP_FORM);
                  }}
                  className="px-5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {modifierGroups.length === 0 ? (
              <p className="text-sm text-gray-400">Todavia no hay paginas de toppings.</p>
            ) : (
              modifierGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => handleEditModifierGroup(group)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    group.active
                      ? "border-indigo-100 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
                      : "border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100"
                  }`}
                >
                  <span className="block font-bold">{group.name}</span>
                  <span className="block text-xs">{group.category_names.length} categorias</span>
                </button>
              ))
            )}
          </div>
        </section>

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

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pagina de toppings
                </label>
                <select
                  value={form.modifier_group_id}
                  onChange={(e) =>
                    setForm({ ...form, modifier_group_id: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                >
                  <option value="">Sin toppings / click normal</option>
                  {modifierGroups
                    .filter((group) => group.active)
                    .map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  Si asignas una pagina, al mantener pulsado el producto se abre solo esa seleccion.
                </p>
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
                      {product.modifier_group_id && (
                        <span className="ml-2 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                          {modifierGroupNames.get(product.modifier_group_id) || "Toppings"}
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
