import ExcelJS from "exceljs";
import type { UserWithRoles } from "../services/users.ts";
import { accountStatus } from "./serializers.ts";

/**
 * Excel export, ported from backend/app/services/user_export_service.rb
 * (caxlsx). Column order, Spanish headers, widths and the date format are kept
 * so an exported file looks the same as before.
 */
export async function usersToXlsx(rows: UserWithRoles[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Usuarios");

  sheet.columns = [
    { header: "#", width: 8 },
    { header: "Nombre Completo", width: 25 },
    { header: "Usuario", width: 18 },
    { header: "Correo Electrónico", width: 30 },
    { header: "Identificación", width: 15 },
    { header: "Teléfono", width: 15 },
    { header: "Roles", width: 20 },
    { header: "Estado de Cuenta", width: 18 },
    { header: "Verificado", width: 12 },
    { header: "Fecha de Creación", width: 20 },
    { header: "Última Actualización", width: 20 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  const formatDate = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  rows.forEach(({ user, roles }, index) => {
    sheet.addRow([
      index + 1,
      user.fullname,
      user.username,
      user.email,
      user.identification ?? "",
      user.phoneNumber ?? "",
      roles.join(", "),
      accountStatus(user),
      user.emailVerified && !user.closedAt ? "Sí" : "No",
      formatDate(user.createdAt),
      formatDate(user.updatedAt),
    ]);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
