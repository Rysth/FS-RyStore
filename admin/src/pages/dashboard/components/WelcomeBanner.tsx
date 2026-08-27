import { Card, CardContent } from "@/components/ui/card";
import { Clock, LayoutGrid } from "lucide-react";

interface WelcomeBannerProps {
  fullname: string | undefined;
}

export function WelcomeBanner({ fullname }: WelcomeBannerProps) {
  return (
    <Card className="overflow-hidden border-none bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 text-white shadow-md">
      <CardContent className="py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="hidden rounded-full bg-white/15 p-3 backdrop-blur-sm sm:flex items-center justify-center">
              <LayoutGrid className="size-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Bienvenido, {fullname ?? "Usuario"}
              </h1>
              <p className="mt-1 text-sm text-white/80">
                Aquí tienes un resumen general del sistema
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm text-white/90 backdrop-blur-sm">
            <Clock className="size-4" />
            Última actualización: ahora
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
