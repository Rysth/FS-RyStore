export default function KitchenIndex() {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-muted-foreground">HungerApp</p>
        <h1 className="text-2xl font-bold tracking-tight">Cocina</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Pantalla de cocina para TV: pedidos grandes, sin precios, sin métricas
          visibles y botón LISTO con refresco por polling.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-card p-6">
        <h2 className="text-base font-semibold">Próximo módulo</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Aquí se conectará la cola de cocina cuando existan pedidos restaurante
          confirmados por cobro.
        </p>
      </div>
    </section>
  );
}
