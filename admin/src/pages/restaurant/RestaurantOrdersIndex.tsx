export default function RestaurantOrdersIndex() {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-muted-foreground">HungerApp</p>
        <h1 className="text-2xl font-bold tracking-tight">Comanda</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Esta será la pantalla táctil para tomar pedidos locales, WhatsApp manual
          y autoservicio. El cobro será el paso que envía el pedido a cocina.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-card p-6">
        <h2 className="text-base font-semibold">Próximo módulo</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Aquí conectaremos catálogo, modificadores, caja abierta y creación de
          pedidos restaurante sin tocar el checkout actual de RyStore.
        </p>
      </div>
    </section>
  );
}
