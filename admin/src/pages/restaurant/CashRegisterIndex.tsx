export default function CashRegisterIndex() {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-muted-foreground">HungerApp</p>
        <h1 className="text-2xl font-bold tracking-tight">Caja</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Apertura, cierre, efectivo esperado, transferencias y cuadre del turno.
          Una sola caja abierta será la regla base de este vertical.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-card p-6">
        <h2 className="text-base font-semibold">Próximo módulo</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          El siguiente paso es crear el modelo de caja y pagos con garantías de
          concurrencia para evitar dobles cobros y descuadres.
        </p>
      </div>
    </section>
  );
}
