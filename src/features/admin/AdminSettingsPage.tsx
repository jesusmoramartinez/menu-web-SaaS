import { Save } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useRestaurantScope } from "@/features/staff/useRestaurantScope";
import { useSettingsAdminMutation } from "@/hooks/useAdminMutations";
import { currentBrand } from "@/services/settingsAdmin";
import { ImageUploadField } from "./ImageUploadField";
import { ServiceChargesSection } from "./ServiceChargesSection";

const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const CURRENCIES = ["ARS", "USD", "CLP", "UYU", "MXN", "COP", "PEN", "BRL"];

export default function AdminSettingsPage() {
  const { restaurant } = useRestaurantScope();
  const save = useSettingsAdminMutation(restaurant.id);

  const [name, setName] = useState(restaurant.name);
  const [tagline, setTagline] = useState(restaurant.tagline ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(restaurant.logoUrl);
  const [currency, setCurrency] = useState(restaurant.currency);
  const [brand, setBrand] = useState(currentBrand(restaurant));

  const handleSave = () => {
    save.mutate({
      name: name.trim(),
      tagline: tagline.trim() || null,
      logoUrl,
      currency,
      brand,
    });
  };

  return (
    <div className="space-y-5">
      <div className="max-w-lg space-y-4 rounded-2xl bg-white p-5 ring-1 ring-stone-200/70">
        <label className="block">
          <span className="text-sm font-semibold">Nombre del restaurante</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`mt-1 ${inputCls}`}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold">Frase corta (opcional)</span>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Horno de leña desde 1987"
            className={`mt-1 ${inputCls}`}
          />
        </label>

        <ImageUploadField
          label="Logo"
          restaurantId={restaurant.id}
          folder="logo"
          value={logoUrl}
          onChange={setLogoUrl}
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-semibold">Moneda</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={`mt-1 ${inputCls}`}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Color principal</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-stone-200"
              />
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className={inputCls}
              />
            </div>
          </label>
        </div>

        <Button
          icon={<Save size={16} />}
          onClick={handleSave}
          disabled={save.isPending || !name.trim()}
          full
          size="lg"
        >
          {save.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>

      <ServiceChargesSection />
    </div>
  );
}
