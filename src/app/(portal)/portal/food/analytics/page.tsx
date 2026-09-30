import { redirect } from "next/navigation";

// Analítica se unió con Ventas en /portal/food/sales (mismas métricas de 30
// días más el desglose por canal). Esta ruta se conserva solo para que los
// enlaces o marcadores viejos sigan funcionando.
export default function FoodAnalyticsPage() {
  redirect("/portal/food/sales");
}
